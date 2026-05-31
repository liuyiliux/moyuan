"""文件 & 内容管理 API"""

import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
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


# ── 文件详情 ──

@router.get("/{content_id}", response_model=FileResponse)
async def get_file(content_id: str, db: AsyncSession = Depends(get_db)):
    """获取文件/内容详情"""
    service = FileService(db)
    content = await service.get_by_id(uuid.UUID(content_id))
    if content is None:
        raise HTTPException(status_code=404, detail="Content not found")
    return FileResponse.model_validate(content)


# ── 删除文件 ──

@router.delete("/{content_id}", response_model=FileResponse)
async def delete_file(content_id: str, db: AsyncSession = Depends(get_db)):
    """软删除文件/内容"""
    service = FileService(db)
    content = await service.soft_delete(uuid.UUID(content_id))
    if content is None:
        raise HTTPException(status_code=404, detail="Content not found")
    return FileResponse.model_validate(content)


# ── 内容管理 / 处理触发 ──

contents_router = APIRouter(prefix="/api/contents", tags=["contents"])


@contents_router.post("", response_model=FileResponse, status_code=201)
async def create_content(body: ContentCreate, db: AsyncSession = Depends(get_db)):
    """创建内容（笔记等）"""
    service = FileService(db)
    data = body.model_dump(exclude_none=True)
    content = await service.create_content(data)
    return FileResponse.model_validate(content)


@contents_router.patch("/{content_id}", response_model=FileResponse)
async def update_content(
    content_id: str,
    body: ContentUpdate,
    db: AsyncSession = Depends(get_db),
):
    """更新内容"""
    service = FileService(db)
    data = body.model_dump(exclude_none=True)
    content = await service.update_content(uuid.UUID(content_id), data)
    if content is None:
        raise HTTPException(status_code=404, detail="Content not found")
    return FileResponse.model_validate(content)


@contents_router.post("/{content_id}/process", response_model=dict)
async def trigger_process(content_id: str, db: AsyncSession = Depends(get_db)):
    """触发内容处理（PDF解析、OCR、转写等）"""
    from app.services.process import ContentProcessService

    svc = ContentProcessService(db)
    try:
        content = await svc.process(content_id=content_id)
        return {"status": "ok", "processing_status": content.processing_status}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing failed: {e}")


@contents_router.get("/{content_id}/status", response_model=dict)
async def get_process_status(content_id: str, db: AsyncSession = Depends(get_db)):
    """获取内容处理状态"""
    from app.services.process import ContentProcessService

    svc = ContentProcessService(db)
    try:
        return await svc.get_status(content_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ── 星标 / 置顶 / 批量操作 ──

from pydantic import BaseModel

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


# ── 存储路径管理 ──

storage_router = APIRouter(prefix="/api/storage", tags=["storage"])


@storage_router.get("/config")
async def get_storage_config():
    """获取存储配置"""
    from app.services.storage import StorageService
    return StorageService.get_config()


@storage_router.post("/validate")
async def validate_storage_path(path: str = Form(...)):
    """验证存储路径"""
    from app.services.storage import StorageService
    return StorageService.validate_path(path)


@storage_router.put("/config")
async def update_storage_root(path: str = Form(...)):
    """更新存储根目录"""
    from app.services.storage import StorageService
    try:
        return StorageService.update_storage_root(path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── 回收站 ──

recycle_router = APIRouter(prefix="/api/recycle", tags=["recycle"])


@recycle_router.get("")
async def list_recycle_bin(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """获取回收站列表"""
    from app.schemas.file import FileListResponse, FileResponse
    service = FileService(db)
    items, total = await service.list_files(
        is_deleted=True,
        page=page,
        page_size=page_size,
    )
    return FileListResponse(
        items=[FileResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@recycle_router.post("/{content_id}/restore")
async def restore_from_recycle(content_id: str, db: AsyncSession = Depends(get_db)):
    """从回收站恢复"""
    from app.schemas.file import FileResponse
    service = FileService(db)
    content = await service.get_by_id(uuid.UUID(content_id))
    if content is None:
        raise HTTPException(status_code=404, detail="Content not found")
    if not content.is_deleted:
        raise HTTPException(status_code=400, detail="Content is not deleted")
    content.is_deleted = False
    content.deleted_at = None
    await db.flush()
    await db.refresh(content)
    return FileResponse.model_validate(content)


@recycle_router.delete("/{content_id}/permanent")
async def permanent_delete(content_id: str, db: AsyncSession = Depends(get_db)):
    """永久删除"""
    service = FileService(db)
    content = await service.get_by_id(uuid.UUID(content_id))
    if content is None:
        raise HTTPException(status_code=404, detail="Content not found")

    # 删除物理文件
    if content.file_path:
        from app.services.file import _get_storage_dir
        full_path = _get_storage_dir() / content.file_path
        full_path.unlink(missing_ok=True)

    await db.delete(content)
    await db.flush()
    return {"status": "deleted", "id": str(content.id)}


@recycle_router.post("/cleanup")
async def cleanup_old_recycle(days: int = Query(30, ge=1), db: AsyncSession = Depends(get_db)):
    """清理超过 N 天的回收站内容"""
    from datetime import datetime, timezone, timedelta
    from sqlalchemy import select
    from app.models.models import Content

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(Content).where(
            Content.is_deleted == True,
            Content.deleted_at < cutoff,
        )
    )
    old_items = list(result.scalars().all())

    # 删除物理文件
    from app.services.file import _get_storage_dir
    storage = _get_storage_dir()
    deleted_count = 0
    for item in old_items:
        if item.file_path:
            (storage / item.file_path).unlink(missing_ok=True)
        await db.delete(item)
        deleted_count += 1

    await db.flush()
    return {"status": "ok", "deleted_count": deleted_count, "cutoff_date": cutoff.isoformat()}
