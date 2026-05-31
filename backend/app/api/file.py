"""文件 & 内容管理 API"""

import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.file import (
    ContentCreate,
    ContentUpdate,
    FileListResponse,
    FileResponse,
    FileUploadResponse,
)
from app.services.file import FileService

router = APIRouter(prefix="/api/files", tags=["files"])


# ── 文件上传 ──

# ── 重复文件检测 ──

@router.post("/check-duplicate", response_model=dict)
async def check_duplicate(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """检查文件是否已存在（基于 MD5），不实际保存"""
    import hashlib
    from sqlalchemy import select
    from app.models.models import Content

    content_bytes = await file.read()
    md5 = hashlib.md5(content_bytes).hexdigest()

    existing = await db.execute(
        select(Content).where(
            Content.file_md5 == md5,
            Content.is_deleted == False,
        ).limit(5)
    )
    duplicates = existing.scalars().all()

    return {
        "file_md5": md5,
        "filename": file.filename,
        "file_size": len(content_bytes),
        "is_duplicate": len(duplicates) > 0,
        "duplicates": [
            {
                "id": str(d.id),
                "title": d.title,
                "content_type": d.content_type,
                "file_size": d.file_size,
                "created_at": d.created_at.isoformat() if d.created_at else None,
            }
            for d in duplicates
        ],
    }


@router.post("/upload", response_model=FileUploadResponse, status_code=201)
async def upload_file(
    file: UploadFile = File(...),
    brain_id: str | None = Form(None),
    db: AsyncSession = Depends(get_db),
):
    """上传文件"""
    if file.filename is None:
        raise HTTPException(status_code=400, detail="No filename provided")

    service = FileService(db)
    content = await service.upload(
        file=file,
        brain_id=uuid.UUID(brain_id) if brain_id else None,
    )

    # 检查是否去重
    is_dup = False
    if content.file_md5:
        from sqlalchemy import select, func
        from app.models.models import Content
        count_result = await db.execute(
            select(func.count(Content.id)).where(
                Content.file_md5 == content.file_md5,
                Content.is_deleted == False,
            )
        )
        is_dup = (count_result.scalar() or 0) > 1

    return FileUploadResponse(
        content_id=content.id,
        title=content.title,
        content_type=content.content_type,
        file_path=content.file_path,
        file_size=content.file_size,
        file_md5=content.file_md5,
        is_duplicate=is_dup,
    )


@router.post("/{content_id}/enqueue", response_model=dict)
async def enqueue_processing(content_id: str, db: AsyncSession = Depends(get_db)):
    """将内容加入处理队列"""
    from app.services.task_queue import enqueue, get_queue_size

    # 验证内容存在
    from sqlalchemy import select
    from app.models.models import Content
    result = await db.execute(select(Content).where(Content.id == content_id))
    content = result.scalar_one_or_none()
    if content is None:
        raise HTTPException(status_code=404, detail="Content not found")

    await enqueue(content_id)
    qsize = await get_queue_size()
    return {"status": "queued", "content_id": content_id, "queue_size": qsize}


@router.post("/reprocess-all", response_model=dict)
async def reprocess_all_pending(db: AsyncSession = Depends(get_db)):
    """批量重新处理所有待处理的内容"""
    from sqlalchemy import select
    from app.models.models import Content
    from app.services.task_queue import enqueue, get_queue_size

    # 查找所有 pending 或 failed 状态的内容
    result = await db.execute(
        select(Content).where(
            Content.is_deleted == False,
            Content.processing_status.in_(["pending", "failed"]),
            Content.file_path.isnot(None),  # 只处理有文件的内容
        )
    )
    contents = result.scalars().all()

    queued_count = 0
    for content in contents:
        await enqueue(str(content.id), task_type="parse", priority=1)
        queued_count += 1

    qsize = await get_queue_size()
    return {
        "status": "ok",
        "queued": queued_count,
        "queue_size": qsize,
        "message": f"已将 {queued_count} 个待处理内容加入队列"
    }


@router.get("/queue/status", response_model=dict)
async def get_queue_status():
    """获取处理队列状态"""
    from app.services.task_queue import get_queue_size
    return {"queue_size": await get_queue_size()}


# ── 文件列表 ──

@router.get("", response_model=FileListResponse)
async def list_files(
    content_type: str | None = Query(None),
    brain_id: str | None = Query(None),
    is_deleted: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """获取文件列表"""
    service = FileService(db)
    items, total = await service.list_files(
        content_type=content_type,
        brain_id=uuid.UUID(brain_id) if brain_id else None,
        is_deleted=is_deleted,
        page=page,
        page_size=page_size,
    )
    return FileListResponse(
        items=[FileResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{content_id}", response_model=FileResponse)
async def get_file(content_id: str, db: AsyncSession = Depends(get_db)):
    """获取单个文件详情"""
    service = FileService(db)
    content = await service.get_by_id(uuid.UUID(content_id))
    if content is None:
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse.model_validate(content)


@router.delete("/{content_id}", response_model=FileResponse)
async def delete_file(content_id: str, db: AsyncSession = Depends(get_db)):
    """软删除文件"""
    service = FileService(db)
    content = await service.soft_delete(uuid.UUID(content_id))
    if content is None:
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse.model_validate(content)


@router.post("/{content_id}/restore", response_model=FileResponse)
async def restore_file(content_id: str, db: AsyncSession = Depends(get_db)):
    """恢复已删除的文件"""
    from sqlalchemy import update
    from app.models.models import Content
    from datetime import datetime, timezone

    result = await db.execute(
        update(Content)
        .where(Content.id == uuid.UUID(content_id))
        .values(is_deleted=False, deleted_at=None)
        .returning(Content)
    )
    content = result.scalar_one_or_none()
    if content is None:
        raise HTTPException(status_code=404, detail="File not found")
    await db.commit()
    return FileResponse.model_validate(content)


# ── 回收站 ──

recycle_router = APIRouter(prefix="/api/recycle", tags=["recycle"])


@recycle_router.delete("/{content_id}/permanent", response_model=dict)
async def permanent_delete(content_id: str, db: AsyncSession = Depends(get_db)):
    """永久删除文件"""
    from sqlalchemy import select
    from app.models.models import Content
    from pathlib import Path
    from app.core.config import get_settings

    settings = get_settings()
    
    result = await db.execute(
        select(Content).where(Content.id == uuid.UUID(content_id))
    )
    content = result.scalar_one_or_none()
    if content is None:
        raise HTTPException(status_code=404, detail="File not found")

    # 删除物理文件
    if content.file_path:
        file_path = Path(settings.file_storage_root) / content.file_path
        if file_path.exists():
            file_path.unlink()

    # 删除数据库记录
    await db.delete(content)
    await db.commit()

    return {"status": "ok", "message": "File permanently deleted"}


# ── 存储管理 ──

storage_router = APIRouter(prefix="/api/storage", tags=["storage"])


@storage_router.get("/stats", response_model=dict)
async def get_storage_stats(db: AsyncSession = Depends(get_db)):
    """获取存储统计信息"""
    from sqlalchemy import select, func
    from app.models.models import Content

    # 总文件数
    total_result = await db.execute(
        select(func.count(Content.id)).where(Content.is_deleted == False)
    )
    total_count = total_result.scalar() or 0

    # 总大小
    size_result = await db.execute(
        select(func.sum(Content.file_size)).where(Content.is_deleted == False)
    )
    total_size = size_result.scalar() or 0

    # 按类型统计
    type_result = await db.execute(
        select(
            Content.content_type,
            func.count(Content.id),
            func.sum(Content.file_size)
        )
        .where(Content.is_deleted == False)
        .group_by(Content.content_type)
    )
    type_stats = {
        row[0]: {"count": row[1], "size": row[2] or 0}
        for row in type_result.all()
    }

    return {
        "total_count": total_count,
        "total_size": total_size,
        "by_type": type_stats,
    }


# ── 内容管理 ──

contents_router = APIRouter(prefix="/api/contents", tags=["contents"])


@contents_router.post("", response_model=FileResponse, status_code=201)
async def create_content(body: ContentCreate, db: AsyncSession = Depends(get_db)):
    """创建内容条目"""
    service = FileService(db)
    content = await service.create_content(body.model_dump())
    return FileResponse.model_validate(content)


@contents_router.patch("/{content_id}", response_model=FileResponse)
async def update_content(content_id: str, body: ContentUpdate, db: AsyncSession = Depends(get_db)):
    """更新内容"""
    service = FileService(db)
    content = await service.update_content(uuid.UUID(content_id), body.model_dump(exclude_unset=True))
    if content is None:
        raise HTTPException(status_code=404, detail="Content not found")
    return FileResponse.model_validate(content)


@contents_router.post("/{content_id}/process", response_model=dict)
async def trigger_process(content_id: str, db: AsyncSession = Depends(get_db)):
    """触发内容处理（解析、分块、嵌入）"""
    from app.services.process import ContentProcessService

    svc = ContentProcessService(db)
    try:
        content = await svc.process(content_id=content_id)
        return {"status": "ok", "processing_status": content.processing_status}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing failed: {e}")


@contents_router.post("/rechunk-all", response_model=dict)
async def rechunk_all(db: AsyncSession = Depends(get_db)):
    """批量重新分块所有内容"""
    from sqlalchemy import select
    from app.models.models import Content
    from app.services.process import ContentProcessService

    result = await db.execute(
        select(Content.id).where(Content.is_deleted == False)
    )
    items = result.scalars().all()

    svc = ContentProcessService(db)
    success = 0
    failed = 0
    for content_id in items:
        try:
            await svc.process(content_id=str(content_id))
            success += 1
        except Exception:
            failed += 1

    return {
        "status": "ok",
        "total": len(items),
        "success": success,
        "failed": failed,
    }


@contents_router.get("/{content_id}/status", response_model=dict)
async def get_process_status(content_id: str, db: AsyncSession = Depends(get_db)):
    """获取内容处理状态"""
    from app.services.process import ContentProcessService

    svc = ContentProcessService(db)
    try:
        return await svc.get_status(content_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@contents_router.get("/{content_id}/chunks", response_model=dict)
async def get_content_chunks(content_id: str, db: AsyncSession = Depends(get_db)):
    """获取内容的所有分块"""
    from sqlalchemy import select
    from app.models.models import ContentChunk

    result = await db.execute(
        select(ContentChunk)
        .where(ContentChunk.content_id == content_id)
        .order_by(ContentChunk.chunk_index)
    )
    chunks = result.scalars().all()

    return {
        "content_id": content_id,
        "total": len(chunks),
        "chunks": [
            {
                "id": str(c.id),
                "chunk_index": c.chunk_index,
                "chunk_type": c.chunk_type,
                "chunk_text": c.chunk_text,
                "embedding_type": c.embedding_type,
                "page_number": c.page_number,
                "start_offset": c.start_offset,
                "end_offset": c.end_offset,
                "time_start": c.time_start,
                "time_end": c.time_end,
                "image_path": c.image_path,
                "has_embedding": c.embedding is not None,
            }
            for c in chunks
        ],
    }


class BatchActionRequest(BaseModel):
    ids: list[str]
    action: str  # star, unstar, pin, unpin, delete

@contents_router.post("/batch", response_model=dict)
async def batch_action(body: BatchActionRequest, db: AsyncSession = Depends(get_db)):
    """批量操作内容"""
    from sqlalchemy import update
    from app.models.models import Content

    valid_actions = {"star", "unstar", "pin", "unpin", "delete"}
    if body.action not in valid_actions:
        raise HTTPException(status_code=400, detail=f"Invalid action: {body.action}")

    updated = 0
    for cid in body.ids:
        try:
            uid = uuid.UUID(cid)
        except ValueError:
            continue
        values = {}
        if body.action == "star": values["is_starred"] = True
        elif body.action == "unstar": values["is_starred"] = False
        elif body.action == "pin": values["is_pinned"] = True
        elif body.action == "unpin": values["is_pinned"] = False
        elif body.action == "delete": values["is_deleted"] = True

        await db.execute(
            update(Content).where(Content.id == uid).values(**values)
        )
        updated += 1

    await db.commit()
    return {"status": "ok", "action": body.action, "updated": updated}


@contents_router.post("/{content_id}/star", response_model=dict)
async def toggle_star(content_id: str, db: AsyncSession = Depends(get_db)):
    """切换星标"""
    from sqlalchemy import select
    from app.models.models import Content
    result = await db.execute(select(Content).where(Content.id == content_id))
    content = result.scalar_one_or_none()
    if content is None:
        raise HTTPException(status_code=404)
    content.is_starred = not content.is_starred
    await db.commit()
    return {"is_starred": content.is_starred}


@contents_router.post("/{content_id}/pin", response_model=dict)
async def toggle_pin(content_id: str, db: AsyncSession = Depends(get_db)):
    """切换置顶"""
    from sqlalchemy import select
    from app.models.models import Content
    result = await db.execute(select(Content).where(Content.id == content_id))
    content = result.scalar_one_or_none()
    if content is None:
        raise HTTPException(status_code=404)
    content.is_pinned = not content.is_pinned
    await db.commit()
    return {"is_pinned": content.is_pinned}
