from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select, text

from app.api.ai import router as ai_router
from app.api.analytics import router as analytics_router
from app.api.annotations import router as annotations_router
from app.api.backup import router as backup_router
from app.api.brains import config_router as brain_config_router
from app.api.brains import router as brains_router
from app.api.categories import router as categories_router
from app.api.collections import router as collections_router
from app.api.embedding import router as embedding_router
from app.api.file import router as file_router
from app.api.file import contents_router, recycle_router, storage_router
from app.api.imports import router as imports_router
from app.api.maintenance import router as maintenance_router
from app.api.notes import router as notes_router
from app.api.preview import router as preview_router
from app.api.provider import router as provider_router
from app.api.relations import router as relations_router
from app.api.search import router as search_router
from app.api.tags import router as tags_router
from app.core.config import get_settings
from app.core.logging import get_logger, setup_logging
from app.middleware.tracing import RequestIdMiddleware
from app.services.task_queue import start_worker, stop_worker, subscribe_progress, unsubscribe_progress


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    setup_logging(log_dir=settings.log_dir, debug=settings.debug)
    logger = get_logger(__name__)

    logger.info("Application startup begins.")

    from app.core.database import async_session_factory, engine
    from app.models.base import Base
    from app.models.models import Content, ProcessingTask

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))

    logger.info("Database tables are ready.")
    logger.info("Checking for stale processing tasks.")

    async with async_session_factory() as session:
        cutoff = datetime.utcnow() - timedelta(minutes=30)
        result = await session.execute(
            select(Content).where(
                Content.processing_status.in_(["processing", "chunking", "embedding"]),
                Content.updated_at < cutoff,
            )
        )
        stale_contents = result.scalars().all()
        for content in stale_contents:
            logger.warning(
                "Marking stale content as failed: %s (%s) - %s",
                content.id,
                content.title,
                content.processing_status,
            )
            content.processing_status = "failed"
            content.processing_error = "Service restarted while the task was running."

        task_result = await session.execute(
            select(ProcessingTask).where(ProcessingTask.status.in_(["queued", "processing"]))
        )
        stale_tasks = task_result.scalars().all()
        for task in stale_tasks:
            logger.warning(
                "Marking stale task as failed: %s (content: %s) - %s",
                task.id,
                task.content_id,
                task.status,
            )
            task.status = "failed"
            task.error_message = "Service restarted while the task was running."

        await session.commit()
        if stale_contents or stale_tasks:
            logger.info("Reset %s content items and %s queued tasks.", len(stale_contents), len(stale_tasks))
        else:
            logger.info("No stale processing tasks found.")

    start_worker()
    logger.info("Background task worker started.")

    try:
        yield
    finally:
        logger.info("Stopping background worker.")
        await stop_worker()
        logger.info("Application shutdown complete.")


app = FastAPI(
    title="Moyuan",
    description="Local multimodal personal knowledge base for text, files, images, audio, video, and web content.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(RequestIdMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(provider_router)
app.include_router(file_router)
app.include_router(contents_router)
app.include_router(storage_router)
app.include_router(imports_router)
app.include_router(recycle_router)
app.include_router(search_router)
app.include_router(tags_router)
app.include_router(categories_router)
app.include_router(collections_router)
app.include_router(preview_router)
app.include_router(embedding_router)
app.include_router(notes_router)
app.include_router(ai_router)
app.include_router(backup_router)
app.include_router(analytics_router)
app.include_router(relations_router)
app.include_router(brains_router)
app.include_router(brain_config_router)
app.include_router(annotations_router)
app.include_router(maintenance_router)

settings = get_settings()
app.mount("/files", StaticFiles(directory=settings.file_storage_root), name="files")


@app.websocket("/ws/progress/{content_id}")
async def ws_progress(websocket: WebSocket, content_id: str):
    await websocket.accept()

    async def _on_progress(payload: dict):
        try:
            await websocket.send_json(payload)
        except Exception:
            pass

    subscribe_progress(content_id, _on_progress)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        unsubscribe_progress(content_id, _on_progress)


@app.get("/", response_class=HTMLResponse)
async def landing_page():
    html_path = Path(__file__).parent.parent.parent / "frontend" / "public" / "moyuan-landing-final.html"
    return html_path.read_text(encoding="utf-8")


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "moyuan"}
