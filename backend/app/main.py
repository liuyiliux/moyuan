from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
import time
from datetime import datetime, timedelta

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
from app.core.logging import setup_logging, get_logger
from app.core.config import get_settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 初始化日志
    settings = get_settings()
    setup_logging(log_dir=settings.log_dir, debug=settings.debug)
    logger = get_logger(__name__)
    
    logger.info("启动生命周期开始...")
    from app.models.base import Base
    from app.core.database import engine, async_session_factory
    from app.models.models import ProcessingTask, Content
    from sqlalchemy import select, update
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
        # 创建 pgvector 扩展
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
        
        # 注意：4096 维向量无法创建 IVFFlat/HNSW 索引（限制 2000 维）
        # 数据量小时（<10万条）不创建索引性能完全够用
        # 如需索引，请将向量维度降至 1536 或 2000 以内
        
    logger.info("数据库表初始化完成")
    
    # 重置卡住的任务
    logger.info("检查并重置卡住的处理任务...")
    async with async_session_factory() as session:
        # 重置内容状态：服务重启 + 长时间未推进的任务都兜底处理
        cutoff = datetime.utcnow() - timedelta(minutes=30)
        result = await session.execute(
            select(Content).where(
                Content.processing_status.in_(["processing", "chunking", "embedding"]),
                Content.updated_at < cutoff,
            )
        )
        stuck_contents = result.scalars().all()
        if stuck_contents:
            for content in stuck_contents:
                logger.warning(f"重置卡住的内容：{content.id} ({content.title}) - {content.processing_status}")
                content.processing_status = "failed"
                content.processing_error = "服务重启，任务被中断"
        
        # 重置任务队列状态
        result_tasks = await session.execute(
            select(ProcessingTask).where(
                ProcessingTask.status.in_(["queued", "processing"])
            )
        )
        stuck_tasks = result_tasks.scalars().all()
        if stuck_tasks:
            for task in stuck_tasks:
                logger.warning(f"重置卡住的任务：{task.id} (content: {task.content_id}) - {task.status}")
                task.status = "failed"
                task.error_message = "服务重启，任务被中断"
        
        await session.commit()
        if stuck_contents or stuck_tasks:
            logger.info(f"已重置 {len(stuck_contents)} 个内容和 {len(stuck_tasks)} 个任务")
        else:
            logger.info("没有发现卡住的任务")
    
    start_worker()
    logger.info("后台任务队列 Worker 已启动")
    yield
    # 关闭时：停止 Worker
    logger.info("正在停止后台 Worker...")
    await stop_worker()
    logger.info("服务已停止")


app = FastAPI(
    title="墨渊 Moyuan",
    description="多模态个人知识库 - 统一管理文本、图片、音视频与网页内容",
    version="0.1.0",
    lifespan=lifespan,
)

# 请求追踪中间件（记录日志 + 添加 X-Request-ID 响应头）
from app.middleware.tracing import RequestIdMiddleware
app.add_middleware(RequestIdMiddleware)

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
