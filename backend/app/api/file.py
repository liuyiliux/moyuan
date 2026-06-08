"""文件 & 内容管理 API"""

import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

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
from app.services.file import FileService, _normalize_import_relative_path

router = APIRouter(prefix="/api/files", tags=["files"])


# ── 文件上传 ──

# ── 重复文件检测 ──

@router.post("/check-duplicate", response_model=dict)
async def check_duplicate(
    file: UploadFile = File(...),
    brain_id: str | None = Form(None),
    import_relative_path: str | None = Form(None),
    db: AsyncSession = Depends(get_db),
):
    """检查文件是否已存在（基于 MD5），不实际保存"""
    import hashlib
    from sqlalchemy import or_, select
    from app.models.models import Content

    content_bytes = await file.read()
    md5 = hashlib.md5(content_bytes).hexdigest()
    brain_uuid = _parse_brain_uuid(brain_id)
    await _ensure_brain_exists(db, brain_uuid)
    try:
        normalized_import_path = _normalize_import_relative_path(import_relative_path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    normalized_import_path_str = normalized_import_path.as_posix() if normalized_import_path else None
    filename = normalized_import_path.name if normalized_import_path else (file.filename or "")
    title = Path(filename).stem if filename else ""

    conditions = [
        Content.is_deleted == False,
        or_(
            Content.file_md5 == md5,
            Content.title == title,
        ),
    ]
    if brain_uuid is not None:
        conditions.append(Content.brain_id == brain_uuid)

    existing = await db.execute(
        select(Content).where(*conditions).order_by(Content.created_at.desc()).limit(50)
    )
    candidates = existing.scalars().all()
    duplicates = []
    for item in candidates:
        meta = item.extra_meta or {}
        same_md5 = item.file_md5 == md5
        same_title = not normalized_import_path_str and item.title == title
        same_relative_path = (
            bool(normalized_import_path_str)
            and isinstance(meta.get("import_relative_path"), str)
            and meta.get("import_relative_path") == normalized_import_path_str
        )
        if same_md5 or same_title or same_relative_path:
            duplicates.append(item)

    return {
        "file_md5": md5,
        "filename": filename,
        "file_size": len(content_bytes),
        "is_duplicate": len(duplicates) > 0,
        "duplicates": [
            {
                "id": str(d.id),
                "title": d.title,
                "content_type": d.content_type,
                "file_size": d.file_size,
                "created_at": d.created_at.isoformat() if d.created_at else None,
                "match_types": [
                    match_type
                    for match_type, matched in (
                        ("md5", d.file_md5 == md5),
                        ("filename", not normalized_import_path_str and d.title == title),
                        ("relative_path", bool(normalized_import_path_str) and (d.extra_meta or {}).get("import_relative_path") == normalized_import_path_str),
                    )
                    if matched
                ],
            }
            for d in duplicates
        ],
    }


@router.post("/upload", response_model=FileUploadResponse, status_code=201)
async def upload_file(
    file: UploadFile = File(...),
    brain_id: str | None = Form(None),
    overwrite_content_id: str | None = Form(None),
    import_relative_path: str | None = Form(None),
    import_batch_id: str | None = Form(None),
    title_override: str | None = Form(None),
    text_content: str | None = Form(None),
    subtitle_path: str | None = Form(None),
    danmaku_path: str | None = Form(None),
    course_index: int | None = Form(None),
    course_import: bool = Form(False),
    db: AsyncSession = Depends(get_db),
):
    """上传文件，支持覆盖已有内容"""
    if file.filename is None:
        raise HTTPException(status_code=400, detail="No filename provided")

    service = FileService(db)
    brain_uuid = _parse_brain_uuid(brain_id)
    await _ensure_brain_exists(db, brain_uuid)

    # 如果是覆盖模式，先删除旧内容
    if overwrite_content_id:
        from datetime import datetime, timezone
        from sqlalchemy import select as sa_select
        from app.models.models import Content as ContentModel
        old_id = uuid.UUID(overwrite_content_id)
        old_result = await db.execute(sa_select(ContentModel).where(ContentModel.id == old_id))
        old_content = old_result.scalar_one_or_none()
        if old_content is None:
            raise HTTPException(status_code=404, detail="Overwrite target not found")
        if old_content.brain_id != brain_uuid:
            raise HTTPException(status_code=400, detail="Overwrite target belongs to another brain")
        old_content.is_deleted = True
        old_content.deleted_at = datetime.now(timezone.utc)
        await db.flush()

    try:
        content = await service.upload(
            file=file,
            brain_id=brain_uuid,
            import_relative_path=import_relative_path,
            import_batch_id=import_batch_id,
            title_override=title_override,
            text_content=text_content,
            extra_meta_patch={
                "course_import": course_import or None,
                "course_index": course_index,
                "subtitle_path": subtitle_path,
                "subtitle_source": "srt" if text_content else None,
                "danmaku_path": danmaku_path,
            },
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

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
    category_id: str | None = Query(None),
    processing_status: str | None = Query(None),
    study_status: str | None = Query(None),
    q: str | None = Query(None),
    import_batch_id: str | None = Query(None),
    is_deleted: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """获取文件列表"""
    await cleanup_expired_recycle_items(db)
    service = FileService(db)
    if study_status and study_status not in {"not_started", "in_progress", "completed"}:
        raise HTTPException(status_code=400, detail=f"Invalid study_status: {study_status}")
    brain_uuid = _parse_brain_uuid(brain_id)
    await _ensure_brain_exists(db, brain_uuid)
    items, total = await service.list_files(
        content_type=content_type,
        brain_id=brain_uuid,
        category_id=uuid.UUID(category_id) if category_id else None,
        processing_status=processing_status,
        study_status=study_status,
        q=q,
        import_batch_id=import_batch_id,
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

    result = await db.execute(
        update(Content)
        .where(Content.id == uuid.UUID(content_id), Content.is_deleted == True)
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


async def _delete_content_record(content, db: AsyncSession) -> bool:
    from sqlalchemy import delete, or_, select
    from app.core.config import get_settings
    from app.models.models import (
        Annotation,
        CollectionItem,
        Content,
        ContentCategory,
        ContentChunk,
        ContentRelation,
        ContentTag,
        ProcessingTask,
    )

    removed_file = False
    storage_root = Path(get_settings().file_storage_root).resolve()

    def remove_storage_file(path_value: str | None) -> bool:
        if not path_value:
            return False
        file_path = (storage_root / path_value).resolve()
        try:
            file_path.relative_to(storage_root)
        except ValueError:
            return False
        if file_path.exists():
            file_path.unlink()
            return True
        return False

    file_path_value = content.file_path
    if file_path_value:
        references = await db.execute(
            select(Content.id).where(
                Content.id != content.id,
                Content.file_path == file_path_value,
            ).limit(1)
        )
        if references.scalar_one_or_none() is None:
            removed_file = remove_storage_file(file_path_value) or removed_file

    chunk_paths_result = await db.execute(
        select(ContentChunk.image_path)
        .where(ContentChunk.content_id == content.id, ContentChunk.image_path.isnot(None))
        .distinct()
    )
    for (image_path,) in chunk_paths_result.all():
        references = await db.execute(
            select(ContentChunk.id).where(
                ContentChunk.content_id != content.id,
                ContentChunk.image_path == image_path,
            ).limit(1)
        )
        if references.scalar_one_or_none() is None:
            removed_file = remove_storage_file(image_path) or removed_file

    await db.execute(delete(ProcessingTask).where(ProcessingTask.content_id == content.id))
    await db.execute(delete(Annotation).where(Annotation.content_id == content.id))
    await db.execute(delete(ContentRelation).where(or_(ContentRelation.source_id == content.id, ContentRelation.target_id == content.id)))
    await db.execute(delete(ContentTag).where(ContentTag.content_id == content.id))
    await db.execute(delete(ContentCategory).where(ContentCategory.content_id == content.id))
    await db.execute(delete(CollectionItem).where(CollectionItem.content_id == content.id))
    await db.execute(delete(ContentChunk).where(ContentChunk.content_id == content.id))

    await db.delete(content)
    return removed_file


async def cleanup_expired_recycle_items(db: AsyncSession, *, now: datetime | None = None) -> dict:
    from sqlalchemy import func, select
    from app.models.models import Content

    cutoff = (now or datetime.now(timezone.utc)) - timedelta(days=30)
    result = await db.execute(
        select(Content).where(
            Content.is_deleted == True,
            Content.deleted_at.isnot(None),
            Content.deleted_at < cutoff,
        )
    )
    expired_items = result.scalars().all()

    removed_files = 0
    for item in expired_items:
        if await _delete_content_record(item, db):
            removed_files += 1

    if expired_items:
        await db.commit()

    return {
        "status": "ok",
        "deleted_count": len(expired_items),
        "removed_files": removed_files,
        "retention_days": 30,
        "cutoff": cutoff.isoformat(),
    }


@router.delete("/{content_id}/permanent", response_model=dict)
@recycle_router.delete("/{content_id}/permanent", response_model=dict)
async def permanent_delete(content_id: str, db: AsyncSession = Depends(get_db)):
    """永久删除文件"""
    from sqlalchemy import select
    from app.models.models import Content
    result = await db.execute(
        select(Content).where(Content.id == uuid.UUID(content_id), Content.is_deleted == True)
    )
    content = result.scalar_one_or_none()
    if content is None:
        raise HTTPException(status_code=404, detail="File not found")

    # 删除物理文件
    removed_file = await _delete_content_record(content, db)
    # 删除数据库记录
    await db.commit()

    return {"status": "ok", "message": "File permanently deleted", "removed_file": removed_file}


# ── 存储管理 ──

@recycle_router.post("/cleanup", response_model=dict)
async def cleanup_recycle(db: AsyncSession = Depends(get_db)):
    return await cleanup_expired_recycle_items(db)


storage_router = APIRouter(prefix="/api/storage", tags=["storage"])


@storage_router.get("/config", response_model=dict)
async def get_storage_config():
    from app.services.storage import StorageService

    return StorageService.get_config()


@storage_router.put("/config", response_model=dict)
async def update_storage_config(path: str = Form(...)):
    from app.services.storage import StorageService

    return StorageService.update_storage_root(path)


@storage_router.post("/migrate", response_model=dict)
async def migrate_storage_files(
    path: str = Form(...),
    old_path: str | None = Form(None),
    db: AsyncSession = Depends(get_db),
):
    from app.services.storage import StorageService

    try:
        return await StorageService.migrate_files(db=db, new_root=path, old_root=old_path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@storage_router.post("/orphan-files/cleanup", response_model=dict)
async def cleanup_orphan_storage_files(
    dry_run: bool = Query(True),
    db: AsyncSession = Depends(get_db),
):
    from app.services.storage import StorageService

    return await StorageService.cleanup_orphan_files(db=db, dry_run=dry_run)


@storage_router.get("/stats", response_model=dict)
async def get_storage_stats(
    brain_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """获取存储统计信息"""
    from sqlalchemy import select, func
    from app.models.models import Content

    # 总文件数
    conditions = [Content.is_deleted == False]
    if brain_id:
        brain_uuid = _parse_brain_uuid(brain_id)
        await _ensure_brain_exists(db, brain_uuid)
        conditions.append(Content.brain_id == brain_uuid)

    total_result = await db.execute(
        select(func.count(Content.id)).where(*conditions)
    )
    total_count = total_result.scalar() or 0

    # 总大小
    size_result = await db.execute(
        select(func.sum(Content.file_size)).where(*conditions)
    )
    total_size = size_result.scalar() or 0

    # 按类型统计
    type_result = await db.execute(
        select(
            Content.content_type,
            func.count(Content.id),
            func.sum(Content.file_size)
        )
        .where(*conditions)
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


class BatchStatusRequest(BaseModel):
    ids: list[str]
    brain_id: str | None = None


class BatchMoveRequest(BaseModel):
    ids: list[str]
    target_brain_id: str
    brain_id: str | None = None


@contents_router.post("", response_model=FileResponse, status_code=201)
async def create_content(body: ContentCreate, db: AsyncSession = Depends(get_db)):
    """创建内容条目"""
    await _ensure_brain_exists(db, body.brain_id)
    service = FileService(db)
    content = await service.create_content(body.model_dump())
    return FileResponse.model_validate(content)


@contents_router.patch("/{content_id}", response_model=FileResponse)
async def update_content(content_id: str, body: ContentUpdate, db: AsyncSession = Depends(get_db)):
    """更新内容"""
    await _ensure_brain_exists(db, body.brain_id)
    service = FileService(db)
    content = await service.update_content(uuid.UUID(content_id), body.model_dump(exclude_unset=True))
    if content is None:
        raise HTTPException(status_code=404, detail="Content not found")
    return FileResponse.model_validate(content)


@contents_router.post("/batch-move", response_model=dict)
async def batch_move_contents(body: BatchMoveRequest, db: AsyncSession = Depends(get_db)):
    """批量移动内容到目标工作区。"""
    source_brain_uuid = _parse_brain_uuid(body.brain_id)
    target_brain_uuid = _parse_brain_uuid(body.target_brain_id)
    await _ensure_brain_exists(db, source_brain_uuid)
    await _ensure_brain_exists(db, target_brain_uuid)

    content_ids: list[uuid.UUID] = []
    for raw_id in body.ids:
        try:
            content_ids.append(uuid.UUID(raw_id))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid content id")
    if not content_ids:
        return {"status": "ok", "moved": 0}

    service = FileService(db)
    moved = 0
    for content_id in content_ids:
        content = await service.get_by_id(content_id)
        if content is None:
            continue
        if source_brain_uuid and content.brain_id != source_brain_uuid:
            continue
        updated = await service.update_content(content_id, {"brain_id": target_brain_uuid})
        if updated is not None:
            moved += 1

    await db.commit()
    return {"status": "ok", "moved": moved}


async def _ensure_brain_exists(db: AsyncSession, brain_id: uuid.UUID | None) -> None:
    if brain_id is None:
        return
    from app.models.models import Brain

    if await db.get(Brain, brain_id) is None:
        raise HTTPException(status_code=404, detail="Brain not found")


def _parse_brain_uuid(brain_id: str | None) -> uuid.UUID | None:
    if not brain_id:
        return None
    try:
        return uuid.UUID(brain_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid brain_id")


@contents_router.post("/{content_id}/process", response_model=dict)
async def trigger_process(content_id: str, reprocess_all: bool = Query(False), db: AsyncSession = Depends(get_db)):
    """触发内容处理（解析、分块、嵌入）- 完整流程
    
    :param reprocess_all: 是否重新处理所有块（包括已成功嵌入的），默认为 False
    """
    from app.services.process import ContentProcessService

    svc = ContentProcessService(db)
    try:
        content = await svc.process(content_id=content_id, keep_embedded=not reprocess_all)
        return {"status": "ok", "processing_status": content.processing_status}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing failed: {e}")


@contents_router.post("/{content_id}/chunk", response_model=dict)
async def trigger_chunk(content_id: str, db: AsyncSession = Depends(get_db)):
    """触发智能分块（仅分块，不生成嵌入）"""
    from app.services.task_queue import enqueue

    try:
        await enqueue(content_id, task_type="chunk", priority=0, db=db)
        return {"status": "queued", "processing_status": "chunking"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chunking failed: {e}")


@contents_router.post("/{content_id}/embed", response_model=dict)
async def trigger_embed(content_id: str, db: AsyncSession = Depends(get_db)):
    """触发生成嵌入（对已分块的内容生成向量嵌入）"""
    from sqlalchemy import select, func
    from app.models.models import Content, ContentChunk
    from app.services.task_queue import enqueue

    result = await db.execute(select(Content).where(Content.id == content_id))
    content = result.scalar_one_or_none()
    if content is None:
        raise HTTPException(status_code=404, detail=f"Content {content_id} not found")
    
    # 检查是否有 chunks
    chunk_count_result = await db.execute(
        select(func.count(ContentChunk.id)).where(ContentChunk.content_id == content_id)
    )
    chunk_count = chunk_count_result.scalar() or 0
    
    if chunk_count == 0:
        raise HTTPException(status_code=400, detail="内容还没有分块，请先进行智能分块")
    
    if content.processing_status not in ("chunked", "embedding", "completed", "partial", "failed"):
        raise HTTPException(status_code=400, detail=f"内容状态不允许生成嵌入: {content.processing_status}")

    try:
        await enqueue(content_id, task_type="embed", priority=1, db=db)
        return {"status": "queued", "processing_status": "embedding"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Embedding failed: {e}")


@contents_router.post("/batch-chunk", response_model=dict)
async def batch_chunk(
    content_ids: list[str],
    brain_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """批量触发智能分块"""
    from sqlalchemy import select
    from app.models.models import Content
    from app.services.task_queue import enqueue

    success = 0
    failed = []
    brain_uuid = _parse_brain_uuid(brain_id)
    await _ensure_brain_exists(db, brain_uuid)
    for content_id in content_ids:
        try:
            if brain_uuid:
                result = await db.execute(select(Content).where(Content.id == uuid.UUID(content_id)))
                content = result.scalar_one_or_none()
                if content is None:
                    raise ValueError(f"Content {content_id} not found")
                if content.brain_id != brain_uuid:
                    raise ValueError("Content does not belong to current brain")
            await enqueue(content_id, task_type="chunk", priority=0, db=db)
            success += 1
        except Exception as e:
            failed.append({"content_id": content_id, "error": str(e)})

    return {
        "status": "queued",
        "total": len(content_ids),
        "success": success,
        "failed": failed,
    }


@contents_router.post("/batch-embed", response_model=dict)
async def batch_embed(
    content_ids: list[str],
    brain_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """批量触发生成嵌入"""
    from sqlalchemy import select
    from app.models.models import Content
    from app.services.task_queue import enqueue

    success = 0
    failed = []
    brain_uuid = _parse_brain_uuid(brain_id)
    await _ensure_brain_exists(db, brain_uuid)
    for content_id in content_ids:
        try:
            result = await db.execute(select(Content).where(Content.id == content_id))
            content = result.scalar_one_or_none()
            if content is None:
                raise ValueError(f"Content {content_id} not found")
            if brain_uuid and content.brain_id != brain_uuid:
                raise ValueError("Content does not belong to current brain")
            if content.processing_status not in ("chunked", "embedding", "completed", "partial", "failed"):
                raise ValueError(f"内容状态不允许生成嵌入: {content.processing_status}")
            await enqueue(content_id, task_type="embed", priority=1, db=db)
            success += 1
        except Exception as e:
            failed.append({"content_id": content_id, "error": str(e)})

    return {
        "status": "queued",
        "total": len(content_ids),
        "success": success,
        "failed": failed,
    }


@contents_router.post("/rechunk-all", response_model=dict)
async def rechunk_all(
    brain_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """批量重新分块所有内容"""
    from sqlalchemy import select
    from app.models.models import Content
    from app.services.process import ContentProcessService

    query = select(Content.id).where(Content.is_deleted == False)
    if brain_id:
        brain_uuid = _parse_brain_uuid(brain_id)
        await _ensure_brain_exists(db, brain_uuid)
        query = query.where(Content.brain_id == brain_uuid)
    result = await db.execute(query)
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


@contents_router.post("/status-batch", response_model=dict)
async def get_process_status_batch(body: BatchStatusRequest, db: AsyncSession = Depends(get_db)):
    """批量获取内容处理状态。"""
    from sqlalchemy import case, func, select
    from app.models.models import Content, ContentChunk

    brain_uuid = _parse_brain_uuid(body.brain_id)
    await _ensure_brain_exists(db, brain_uuid)

    content_ids: list[uuid.UUID] = []
    for raw_id in body.ids:
        try:
            content_ids.append(uuid.UUID(raw_id))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid content_id")
    if not content_ids:
        return {"items": {}}

    conditions = [Content.id.in_(content_ids)]
    if brain_uuid:
        conditions.append(Content.brain_id == brain_uuid)

    result = await db.execute(
        select(
            Content.id,
            Content.processing_status,
            Content.processing_error,
            Content.text_content,
            Content.embedding,
            func.count(ContentChunk.id).label("chunk_count"),
            func.count(case((ContentChunk.chunk_type == "text", 1))).label("text_chunks"),
            func.count(case((ContentChunk.chunk_type == "image", 1))).label("image_chunks"),
            func.count(case((ContentChunk.embedding.is_not(None), 1))).label("embedded_chunks"),
        )
        .outerjoin(ContentChunk, ContentChunk.content_id == Content.id)
        .where(*conditions)
        .group_by(
            Content.id,
            Content.processing_status,
            Content.processing_error,
            Content.text_content,
            Content.embedding,
        )
    )

    items = {}
    for row in result.all():
        content_id = str(row.id)
        items[content_id] = {
            "id": content_id,
            "processing_status": row.processing_status,
            "processing_error": row.processing_error,
            "has_text": bool(row.text_content),
            "has_embedding": row.embedding is not None,
            "chunk_count": row.chunk_count or 0,
            "text_chunks": row.text_chunks or 0,
            "image_chunks": row.image_chunks or 0,
            "embedded_chunks": row.embedded_chunks or 0,
        }

    return {"items": items}


PROCESSING_CENTER_GROUPS = {
    "active": {"pending", "processing", "chunking", "embedding"},
    "needs_action": {"failed", "chunked", "partial"},
    "failed": {"failed"},
    "done": {"completed"},
}


class ProcessingCenterActionRequest(BaseModel):
    action: str  # retry_failed, embed_ready, reset_stuck_embeddings, cancel_queued, clear_finished_tasks
    brain_id: str | None = None
    limit: int = 100


@contents_router.get("/processing-center", response_model=dict)
async def get_processing_center(
    brain_id: str | None = Query(None),
    group: str = Query("active", pattern="^(active|needs_action|failed|done|all)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """处理状态中心：汇总内容处理状态、队列状态与最近任务。"""
    from sqlalchemy import case, desc, func, select
    from app.models.models import Content, ContentChunk, ProcessingTask
    from app.services.task_queue import get_queue_size

    brain_uuid = _parse_brain_uuid(brain_id)
    await _ensure_brain_exists(db, brain_uuid)

    base_conditions = [Content.is_deleted == False]
    if brain_uuid:
        base_conditions.append(Content.brain_id == brain_uuid)

    status_result = await db.execute(
        select(Content.processing_status, func.count(Content.id))
        .where(*base_conditions)
        .group_by(Content.processing_status)
    )
    by_status = {status or "unknown": count for status, count in status_result.all()}
    summary = {
        "total": sum(by_status.values()),
        "by_status": by_status,
        "active": sum(by_status.get(status, 0) for status in PROCESSING_CENTER_GROUPS["active"]),
        "needs_action": sum(by_status.get(status, 0) for status in PROCESSING_CENTER_GROUPS["needs_action"]),
        "completed": by_status.get("completed", 0),
        "failed": by_status.get("failed", 0),
    }

    task_conditions = []
    if brain_uuid:
        task_conditions.append(Content.brain_id == brain_uuid)
    task_result = await db.execute(
        select(ProcessingTask.status, func.count(ProcessingTask.id))
        .join(Content, Content.id == ProcessingTask.content_id)
        .where(Content.is_deleted == False, *task_conditions)
        .group_by(ProcessingTask.status)
    )
    task_counts = {status or "unknown": count for status, count in task_result.all()}

    list_conditions = list(base_conditions)
    if group != "all":
        list_conditions.append(Content.processing_status.in_(PROCESSING_CENTER_GROUPS[group]))

    total_result = await db.execute(select(func.count(Content.id)).where(*list_conditions))
    total = total_result.scalar() or 0
    offset = (page - 1) * page_size

    rows_result = await db.execute(
        select(
            Content.id,
            Content.title,
            Content.content_type,
            Content.source_type,
            Content.file_size,
            Content.processing_status,
            Content.processing_error,
            Content.brain_id,
            Content.created_at,
            Content.updated_at,
            func.count(ContentChunk.id).label("chunk_count"),
            func.count(case((ContentChunk.embedding.is_not(None), 1))).label("embedded_chunks"),
        )
        .outerjoin(ContentChunk, ContentChunk.content_id == Content.id)
        .where(*list_conditions)
        .group_by(
            Content.id,
            Content.title,
            Content.content_type,
            Content.source_type,
            Content.file_size,
            Content.processing_status,
            Content.processing_error,
            Content.brain_id,
            Content.created_at,
            Content.updated_at,
        )
        .order_by(Content.updated_at.desc(), Content.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    rows = rows_result.all()
    content_ids = [row.id for row in rows]

    task_history: dict[uuid.UUID, list[dict]] = {}
    if content_ids:
        task_rows = await db.execute(
            select(ProcessingTask)
            .where(ProcessingTask.content_id.in_(content_ids))
            .order_by(ProcessingTask.content_id, desc(ProcessingTask.created_at))
        )
        for task in task_rows.scalars().all():
            history = task_history.setdefault(task.content_id, [])
            if len(history) >= 3:
                continue
            history.append({
                "id": str(task.id),
                "task_type": task.task_type,
                "status": task.status,
                "priority": task.priority,
                "progress": task.progress,
                "error_message": task.error_message,
                "created_at": task.created_at.isoformat() if task.created_at else None,
                "started_at": task.started_at.isoformat() if task.started_at else None,
                "completed_at": task.completed_at.isoformat() if task.completed_at else None,
            })

    return {
        "queue_size": await get_queue_size(),
        "summary": summary,
        "tasks": task_counts,
        "items": [
            {
                "id": str(row.id),
                "title": row.title,
                "content_type": row.content_type,
                "source_type": row.source_type,
                "file_size": row.file_size,
                "processing_status": row.processing_status,
                "processing_error": row.processing_error,
                "brain_id": str(row.brain_id) if row.brain_id else None,
                "chunk_count": row.chunk_count or 0,
                "embedded_chunks": row.embedded_chunks or 0,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "updated_at": row.updated_at.isoformat() if row.updated_at else None,
                "latest_task": (task_history.get(row.id) or [None])[0],
                "recent_tasks": task_history.get(row.id, []),
            }
            for row in rows
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@contents_router.post("/processing-center/actions", response_model=dict)
async def run_processing_center_action(
    body: ProcessingCenterActionRequest,
    db: AsyncSession = Depends(get_db),
):
    """处理状态中心批量动作。"""
    from sqlalchemy import func, select
    from app.models.models import Content, ProcessingTask
    from app.services.task_queue import enqueue, get_queue_size

    valid_actions = {"retry_failed", "embed_ready", "reset_stuck_embeddings", "cancel_queued", "clear_finished_tasks"}
    if body.action not in valid_actions:
        raise HTTPException(status_code=400, detail=f"Invalid action: {body.action}")
    if body.limit < 1 or body.limit > 500:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 500")

    brain_uuid = _parse_brain_uuid(body.brain_id)
    await _ensure_brain_exists(db, brain_uuid)

    conditions = [Content.is_deleted == False]
    if brain_uuid:
        conditions.append(Content.brain_id == brain_uuid)

    queued = 0
    reset = 0
    cancelled = 0
    cleared = 0
    affected_ids: list[str] = []

    if body.action == "retry_failed":
        result = await db.execute(
            select(Content)
            .where(*conditions, Content.processing_status == "failed")
            .order_by(Content.updated_at.desc(), Content.created_at.desc())
            .limit(body.limit)
        )
        for content in result.scalars().all():
            await enqueue(str(content.id), task_type="parse", priority=1, db=db)
            queued += 1
            affected_ids.append(str(content.id))

    elif body.action == "embed_ready":
        result = await db.execute(
            select(Content)
            .where(*conditions, Content.processing_status.in_(["chunked", "partial"]))
            .order_by(Content.updated_at.desc(), Content.created_at.desc())
            .limit(body.limit)
        )
        for content in result.scalars().all():
            await enqueue(str(content.id), task_type="embed", priority=1, db=db)
            queued += 1
            affected_ids.append(str(content.id))

    elif body.action == "reset_stuck_embeddings":
        server_now = (await db.execute(select(func.now()))).scalar()
        cutoff = server_now - timedelta(minutes=30)
        result = await db.execute(
            select(Content)
            .where(*conditions, Content.processing_status == "embedding", Content.updated_at < cutoff)
            .order_by(Content.updated_at.asc())
            .limit(body.limit)
        )
        stuck_contents = result.scalars().all()
        for content in stuck_contents:
            content.processing_status = "failed"
            content.processing_error = "长时间停留在 embedding，自动回滚为 failed"
            affected_ids.append(str(content.id))
        if stuck_contents:
            stuck_ids = [content.id for content in stuck_contents]
            task_result = await db.execute(
                select(ProcessingTask).where(
                    ProcessingTask.content_id.in_(stuck_ids),
                    ProcessingTask.task_type == "embed",
                    ProcessingTask.status.in_(["queued", "processing"]),
                )
            )
            for task in task_result.scalars().all():
                task.status = "failed"
                task.error_message = "长时间停留在 embedding，自动回滚为 failed"
        reset = len(stuck_contents)

    elif body.action == "cancel_queued":
        result = await db.execute(
            select(ProcessingTask, Content)
            .join(Content, Content.id == ProcessingTask.content_id)
            .where(
                *conditions,
                ProcessingTask.status == "queued",
            )
            .order_by(ProcessingTask.created_at.asc())
            .limit(body.limit)
        )
        for task, content in result.all():
            task.status = "cancelled"
            if task.task_type == "embed":
                content.processing_status = "chunked"
            else:
                content.processing_status = "pending"
            content.processing_error = None
            cancelled += 1
            affected_ids.append(str(content.id))

    elif body.action == "clear_finished_tasks":
        result = await db.execute(
            select(ProcessingTask)
            .join(Content, Content.id == ProcessingTask.content_id)
            .where(
                *conditions,
                ProcessingTask.status.in_(["completed", "failed", "cancelled"]),
            )
            .order_by(ProcessingTask.created_at.asc())
            .limit(body.limit)
        )
        tasks = result.scalars().all()
        for task in tasks:
            await db.delete(task)
        cleared = len(tasks)

    await db.commit()
    return {
        "status": "ok",
        "action": body.action,
        "queued": queued,
        "reset": reset,
        "cancelled": cancelled,
        "cleared": cleared,
        "affected_ids": affected_ids,
        "queue_size": await get_queue_size(),
    }


@contents_router.get("/{content_id}/status", response_model=dict)
async def get_process_status(content_id: str, db: AsyncSession = Depends(get_db)):
    """获取内容处理状态"""
    from app.services.process import ContentProcessService

    try:
        uuid.UUID(content_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid content_id")

    svc = ContentProcessService(db)
    try:
        return await svc.get_status(content_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@contents_router.get("/{content_id}/chunks", response_model=dict)
async def get_content_chunks(
    content_id: str, 
    page: int = Query(1, ge=1), 
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db)
):
    """获取内容的分块（分页）"""
    from sqlalchemy import select, func
    from app.models.models import ContentChunk

    # 先查询总数
    count_result = await db.execute(
        select(func.count(ContentChunk.id))
        .where(ContentChunk.content_id == content_id)
    )
    total = count_result.scalar() or 0

    # 分页查询
    offset = (page - 1) * page_size
    result = await db.execute(
        select(ContentChunk)
        .where(ContentChunk.content_id == content_id)
        .order_by(ContentChunk.chunk_index)
        .offset(offset)
        .limit(page_size)
    )
    chunks = result.scalars().all()

    return {
        "content_id": content_id,
        "total": total,
        "page": page,
        "page_size": page_size,
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
    action: str  # star, unstar, pin, unpin, delete, restore, permanent_delete
    brain_id: str | None = None


class BatchStudyStatusRequest(BaseModel):
    ids: list[str]
    status: str
    brain_id: str | None = None


def _study_status_meta(status: str, now: datetime, existing_meta: dict | None = None) -> dict:
    if status not in {"not_started", "in_progress", "completed"}:
        raise HTTPException(status_code=400, detail=f"Invalid study status: {status}")
    timestamp = now.isoformat()
    existing_started_at = (existing_meta or {}).get("study_started_at")
    return {
        "study_status": status,
        "study_started_at": None if status == "not_started" else existing_started_at or timestamp,
        "study_completed_at": timestamp if status == "completed" else None,
    }


class WebPreviewRequest(BaseModel):
    url: str


@contents_router.post("/web-preview", response_model=dict)
async def preview_web_capture(body: WebPreviewRequest):
    """Fetch a web page preview before the user confirms saving it."""
    from urllib.parse import urlparse
    from app.services.process import _extract_web

    url = body.url.strip()
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(status_code=400, detail="Invalid web URL")

    try:
        text = await _extract_web(url)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Web page fetch failed: {e}")

    if not text.strip():
        raise HTTPException(status_code=422, detail="No readable article text was extracted from this URL")

    title = parsed.netloc.replace("www.", "")
    first_line = next((line.strip() for line in text.splitlines() if line.strip()), "")
    if 4 <= len(first_line) <= 120:
        title = first_line

    return {
        "url": url,
        "title": title,
        "text_content": text,
        "excerpt": text[:500],
        "text_length": len(text),
    }


@contents_router.post("/batch-study-status", response_model=dict)
async def batch_study_status(body: BatchStudyStatusRequest, db: AsyncSession = Depends(get_db)):
    """批量更新内容学习状态，保留已有 extra_meta。"""
    from sqlalchemy import select
    from app.models.models import Content

    brain_uuid = _parse_brain_uuid(body.brain_id)
    await _ensure_brain_exists(db, brain_uuid)

    if not body.ids:
        return {"status": "ok", "updated": 0}

    content_ids: list[uuid.UUID] = []
    for raw_id in body.ids:
        try:
            content_ids.append(uuid.UUID(raw_id))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid content id")

    conditions = [Content.id.in_(content_ids), Content.is_deleted == False]
    if brain_uuid:
        conditions.append(Content.brain_id == brain_uuid)

    result = await db.execute(select(Content).where(*conditions))
    contents = result.scalars().all()
    now = datetime.now(timezone.utc)
    for content in contents:
        meta_patch = _study_status_meta(body.status, now, content.extra_meta if isinstance(content.extra_meta, dict) else None)
        content.extra_meta = {**(content.extra_meta or {}), **meta_patch}

    await db.commit()
    return {"status": "ok", "updated": len(contents)}


@contents_router.post("/batch", response_model=dict)
async def batch_action(body: BatchActionRequest, db: AsyncSession = Depends(get_db)):
    """批量操作内容"""
    from sqlalchemy import select, update
    from app.models.models import Content

    valid_actions = {"star", "unstar", "pin", "unpin", "delete", "restore", "permanent_delete"}
    if body.action not in valid_actions:
        raise HTTPException(status_code=400, detail=f"Invalid action: {body.action}")

    updated = 0
    brain_uuid = _parse_brain_uuid(body.brain_id)
    await _ensure_brain_exists(db, brain_uuid)
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
        elif body.action == "delete":
            values["is_deleted"] = True
            values["deleted_at"] = datetime.now(timezone.utc)
        elif body.action == "restore":
            values["is_deleted"] = False
            values["deleted_at"] = None

        conditions = [Content.id == uid]
        if brain_uuid:
            conditions.append(Content.brain_id == brain_uuid)
        if body.action == "restore":
            conditions.append(Content.is_deleted == True)
        elif body.action == "permanent_delete":
            conditions.append(Content.is_deleted == True)
            result = await db.execute(select(Content).where(*conditions))
            content = result.scalar_one_or_none()
            if content is None:
                continue
            await _delete_content_record(content, db)
            updated += 1
            continue
        result = await db.execute(
            update(Content).where(*conditions).values(**values)
        )
        updated += result.rowcount or 0

    await db.commit()
    return {"status": "ok", "action": body.action, "updated": updated}


@contents_router.post("/maintenance/reset-stuck-embeddings", response_model=dict)
async def reset_stuck_embeddings(
    brain_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """将长时间停留在 embedding 的内容重置为 failed，便于用户重新处理"""
    from datetime import datetime, timedelta
    from sqlalchemy import select, func
    from app.models.models import Content, ProcessingTask

    from sqlalchemy import func as sa_func
    server_now = (await db.execute(select(sa_func.now()))).scalar()
    cutoff = server_now - timedelta(minutes=30)

    conditions = [
        Content.processing_status == "embedding",
        Content.updated_at < cutoff,
    ]
    if brain_id:
        brain_uuid = _parse_brain_uuid(brain_id)
        await _ensure_brain_exists(db, brain_uuid)
        conditions.append(Content.brain_id == brain_uuid)

    result = await db.execute(
        select(Content).where(*conditions)
    )
    stuck_contents = result.scalars().all()

    for content in stuck_contents:
        content.processing_status = "failed"
        content.processing_error = "长时间停留在 embedding，自动回滚为 failed"

    if stuck_contents:
        stuck_ids = [c.id for c in stuck_contents]
        task_result = await db.execute(
            select(ProcessingTask).where(
                ProcessingTask.content_id.in_(stuck_ids),
                ProcessingTask.task_type == "embed",
                ProcessingTask.status.in_(["queued", "processing"]),
            )
        )
        for task in task_result.scalars().all():
            task.status = "failed"
            task.error_message = "长时间停留在 embedding，自动回滚为 failed"

    await db.commit()

    return {
        "status": "ok",
        "reset_count": len(stuck_contents),
        "cutoff_minutes": 30,
        "reset_ids": [str(c.id) for c in stuck_contents],
        "server_now": server_now.isoformat(),
        "local_now": datetime.now().astimezone().isoformat(),
    }


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
