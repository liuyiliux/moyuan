from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.api.provider import router as provider_router
from app.api.file import router as file_router, contents_router, storage_router, recycle_router
from app.api.search import router as search_router
from app.api.tags import router as tags_router
from app.api.categories import router as categories_router
from app.api.collections import router as collections_router
from app.api.preview import router as preview_router
from app.api.embedding import router as embedding_router
from app.api.notes import router as notes_router
from app.api.ai import router as ai_router
from app.api.backup import router as backup_router
from app.api.analytics import router as analytics_router
from app.api.relations import router as relations_router
from app.api.brains import router as brains_router
from app.api.brains import config_router as brain_config_router
from app.api.annotations import router as annotations_router

from app.services.task_queue import start_worker, stop_worker, subscribe_progress, unsubscribe_progress


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时：创建表 + 启动后台 Worker
    import sys
    print("[Moyuan] Lifespan startup...", file=sys.stderr, flush=True)
    from app.models.base import Base
    from app.core.database import engine
    from app.models.models import ProcessingTask, Annotation
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
        # 创建 pgvector 扩展
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
        
        # 注意：4096 维向量无法创建 IVFFlat/HNSW 索引（限制 2000 维）
        # 数据量小时（<10万条）不创建索引性能完全够用
        # 如需索引，请将向量维度降至 1536 或 2000 以内
        
    print("[Moyuan] Tables created", file=sys.stderr, flush=True)
    start_worker()
    print("[Moyuan] Worker started", file=sys.stderr, flush=True)
    yield
    # 关闭时：停止 Worker
    await stop_worker()


app = FastAPI(
    title="墨渊 Moyuan",
    description="多模态个人知识库 - 统一管理文本、图片、音视频与网页内容",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(provider_router)
app.include_router(file_router)
app.include_router(contents_router)
app.include_router(storage_router)
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

# Static files (uploaded files)
from app.core.config import get_settings

_stg = get_settings().file_storage_root
app.mount("/files", StaticFiles(directory=_stg), name="files")


# ── WebSocket 进度推送 ──

from fastapi import WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from pathlib import Path

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
            # keep-alive
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
