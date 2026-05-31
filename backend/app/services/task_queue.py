"""异步任务队列 Service

使用 asyncio.Queue + 后台 Worker 实现轻量级任务队列：
- 无需 Redis/RabbitMQ 等外部依赖
- 支持任务优先级、进度追踪、取消操作
- 通过 WebSocket 推送实时进度
"""

import asyncio
import traceback
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory
from app.models.models import ProcessingTask


# ── 全局队列与回调 ──

_task_queue: asyncio.PriorityQueue = asyncio.PriorityQueue()
_worker_task: asyncio.Task | None = None
_progress_callbacks: dict[str, list] = {}  # content_id -> [callback, ...]


def subscribe_progress(content_id: str, callback):
    """订阅某个 content 的处理进度更新（供 WebSocket 使用）"""
    if content_id not in _progress_callbacks:
        _progress_callbacks[content_id] = []
    _progress_callbacks[content_id].append(callback)


def unsubscribe_progress(content_id: str, callback):
    """取消订阅"""
    cbs = _progress_callbacks.get(content_id, [])
    if callback in cbs:
        cbs.remove(callback)


async def _notify_progress(content_id: str, progress: int, status: str, error: str | None = None):
    """通知所有订阅者进度变更"""
    cbs = _progress_callbacks.get(content_id, [])
    payload = {"content_id": content_id, "progress": progress, "status": status, "error": error}
    for cb in cbs:
        try:
            await cb(payload)
        except Exception:
            pass


# ── 任务入队 ──

async def enqueue(content_id: str, task_type: str = "parse", priority: int = 0):
    """将处理任务加入队列"""
    async with async_session_factory() as db:
        task = ProcessingTask(
            id=uuid.uuid4(),
            content_id=content_id,
            task_type=task_type,
            status="queued",
            priority=priority,
        )
        db.add(task)
        await db.flush()

        # 更新 Content 状态
        from app.models.models import Content
        result = await db.execute(select(Content).where(Content.id == content_id))
        content = result.scalar_one_or_none()
        if content:
            content.processing_status = "pending"
            await db.flush()

        await db.commit()

        # 入队（PriorityQueue: (priority, task_id)）
        await _task_queue.put((priority, str(task.id)))


async def enqueue_embed(content_id: str, priority: int = 1):
    """将嵌入生成任务加入队列（优先级低于解析）"""
    await enqueue(content_id, task_type="embed", priority=priority)


# ── 队列大小 ──

async def get_queue_size() -> int:
    return _task_queue.qsize()


# ── 后台 Worker ──

async def _worker():
    """后台 Worker：持续从队列中取任务并执行"""
    print("[TaskQueue] Worker started, waiting for tasks...")

    while True:
        try:
            _priority, task_id = await _task_queue.get()
            print(f"[TaskQueue] Worker picked task {task_id}, priority={_priority}")
        except asyncio.CancelledError:
            print("[TaskQueue] Worker cancelled")
            break

        async with async_session_factory() as db:
            try:
                # 获取任务
                result = await db.execute(
                    select(ProcessingTask).where(ProcessingTask.id == task_id)
                )
                task = result.scalar_one_or_none()
                if task is None or task.status == "cancelled":
                    print(f"[TaskQueue] Task {task_id} not found or cancelled")
                    _task_queue.task_done()
                    continue

                if task.status != "queued":
                    print(f"[TaskQueue] Task {task_id} status is {task.status}, skipping")
                    _task_queue.task_done()
                    continue

                # 开始处理
                task.status = "processing"
                task.started_at = datetime.now(timezone.utc)
                task.progress = 0
                await db.flush()
                print(f"[TaskQueue] Task {task_id}: status=processing")

                content_id_str = str(task.content_id)
                await _notify_progress(content_id_str, 0, "processing")

                # 获取 Content
                from app.models.models import Content
                c_result = await db.execute(select(Content).where(Content.id == task.content_id))
                content = c_result.scalar_one_or_none()
                if content is None:
                    task.status = "failed"
                    task.error_message = "Content not found"
                    await db.commit()
                    print(f"[TaskQueue] Task {task_id}: content not found")
                    _task_queue.task_done()
                    continue

                await _notify_progress(content_id_str, 50, "processing")

                # 执行处理
                if task.task_type == "parse":
                    from app.services.process import ContentProcessService
                    svc = ContentProcessService(db)
                    await svc.process(content=content)
                    print(f"[TaskQueue] Task {task_id}: parse completed, text_len={len(content.text_content or '')}")
                    # 处理完成后自动入队嵌入任务
                    await enqueue_embed(content_id_str)

                elif task.task_type == "embed":
                    from app.services.embedding import embed_content
                    await embed_content(db, content_id_str)
                    print(f"[TaskQueue] Task {task_id}: embed completed")

                # 完成
                task.status = "completed"
                task.progress = 100
                task.completed_at = datetime.now(timezone.utc)
                await db.commit()
                await _notify_progress(content_id_str, 100, "completed")
                print(f"[TaskQueue] Task {task_id}: done")

            except Exception as e:
                print(f"[TaskQueue] Task {task_id} FAILED: {e}")
                task.status = "failed"
                task.error_message = f"{e}\n{traceback.format_exc()}"
                await db.commit()
                await _notify_progress(str(task.content_id), 0, "failed", str(e))

            finally:
                _task_queue.task_done()


def start_worker():
    """启动后台 Worker（应用启动时调用）"""
    global _worker_task
    print(f"[TaskQueue] start_worker called, existing task: {_worker_task}")
    if _worker_task is None or _worker_task.done():
        _worker_task = asyncio.create_task(_worker())
        print(f"[TaskQueue] Worker task created: {_worker_task}")


async def stop_worker():
    """停止后台 Worker（应用关闭时调用）"""
    global _worker_task
    if _worker_task:
        _worker_task.cancel()
        try:
            await _worker_task
        except asyncio.CancelledError:
            pass
