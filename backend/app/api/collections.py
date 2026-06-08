"""收藏夹（Collection）管理 API

POST   /api/collections          — 创建收藏夹
GET    /api/collections          — 收藏夹列表
GET    /api/collections/{id}    — 收藏夹详情 + 内容列表
PATCH  /api/collections/{id}   — 更新收藏夹名称/描述
DELETE /api/collections/{id}    — 删除收藏夹
POST   /api/collections/{id}/add — 添加内容到收藏夹
DELETE /api/collections/{id}/remove/{content_id} — 移除内容
POST   /api/contents/{id}/favorite — 快速收藏（加到默认收藏夹或创建）
DELETE /api/contents/{id}/favorite — 取消收藏
"""

import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import case, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import Brain, Collection, CollectionItem, Content

router = APIRouter(prefix="/api/collections", tags=["collections"])


# ── Schemas ──

class CollectionCreate(BaseModel):
    name: str
    description: str | None = None
    brain_id: str | None = None


class CollectionUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class CollectionItemAdd(BaseModel):
    content_id: str


class CollectionResponse(BaseModel):
    id: str
    name: str
    description: str | None
    brain_id: str | None = None
    item_count: int = 0
    completed_count: int = 0
    in_progress_count: int = 0
    progress_percent: int = 0
    resume_content_id: str | None = None
    resume_content_title: str | None = None
    resume_study_status: str | None = None
    created_at: str

    model_config = {"from_attributes": True}


class CollectionListResponse(BaseModel):
    items: list[CollectionResponse]
    total: int
    page: int
    page_size: int


class CollectionItemResponse(BaseModel):
    id: str
    content_id: str
    title: str
    content_type: str
    sort_order: int
    added_at: str

    pass


# ── Helpers ──

def _col_resp(
    col: Collection,
    item_count: int = 0,
    completed_count: int = 0,
    in_progress_count: int = 0,
    resume_content: Content | None = None,
) -> dict:
    resume_meta = (resume_content.extra_meta or {}) if resume_content else {}
    return {
        "id": str(col.id),
        "name": col.name,
        "description": col.description,
        "brain_id": str(col.brain_id) if col.brain_id else None,
        "item_count": item_count,
        "completed_count": completed_count,
        "in_progress_count": in_progress_count,
        "progress_percent": round((completed_count / item_count) * 100) if item_count else 0,
        "resume_content_id": str(resume_content.id) if resume_content else None,
        "resume_content_title": resume_content.title if resume_content else None,
        "resume_study_status": (resume_meta.get("study_status") or "not_started") if resume_content else None,
        "created_at": col.created_at.isoformat() if col.created_at else "",
    }


async def _collections_progress(
    db: AsyncSession,
    collection_ids: list[uuid.UUID],
) -> dict[uuid.UUID, tuple[int, int, int]]:
    progress = {collection_id: (0, 0, 0) for collection_id in collection_ids}
    if not collection_ids:
        return progress

    rows = await db.execute(
        select(CollectionItem.collection_id, Content.extra_meta)
        .join(Content, CollectionItem.content_id == Content.id)
        .where(CollectionItem.collection_id.in_(collection_ids), Content.is_deleted == False)
    )
    mutable_progress = {collection_id: [0, 0, 0] for collection_id in collection_ids}
    for collection_id, meta in rows.all():
        counters = mutable_progress.setdefault(collection_id, [0, 0, 0])
        counters[0] += 1
        status = (meta or {}).get("study_status")
        if status == "completed":
            counters[1] += 1
        elif status == "in_progress":
            counters[2] += 1
    return {collection_id: tuple(counters) for collection_id, counters in mutable_progress.items()}


async def _collection_progress(db: AsyncSession, collection_id: uuid.UUID) -> tuple[int, int, int]:
    return (await _collections_progress(db, [collection_id])).get(collection_id, (0, 0, 0))


async def _collections_resume_content(
    db: AsyncSession,
    collection_ids: list[uuid.UUID],
) -> dict[uuid.UUID, Content]:
    if not collection_ids:
        return {}

    study_status_value = Content.extra_meta["study_status"].astext
    result = await db.execute(
        select(CollectionItem.collection_id, Content)
        .join(Content, CollectionItem.content_id == Content.id)
        .where(
            CollectionItem.collection_id.in_(collection_ids),
            Content.is_deleted == False,
            or_(
                Content.extra_meta.is_(None),
                study_status_value.is_(None),
                study_status_value != "completed",
            ),
        )
        .order_by(
            CollectionItem.collection_id.asc(),
            case((study_status_value == "in_progress", 0), else_=1),
            CollectionItem.sort_order.asc(),
            Content.created_at.asc(),
        )
    )
    resume_by_collection: dict[uuid.UUID, Content] = {}
    for collection_id, content in result.all():
        if collection_id not in resume_by_collection:
            resume_by_collection[collection_id] = content
    return resume_by_collection


async def _collection_resume_content(db: AsyncSession, collection_id: uuid.UUID) -> Content | None:
    return (await _collections_resume_content(db, [collection_id])).get(collection_id)


async def _ensure_brain_exists(db: AsyncSession, brain_id: uuid.UUID | None) -> None:
    if brain_id is None:
        return
    if await db.get(Brain, brain_id) is None:
        raise HTTPException(status_code=404, detail="Brain not found")


def _parse_brain_uuid(brain_id: str | None) -> uuid.UUID | None:
    if not brain_id:
        return None
    try:
        return uuid.UUID(brain_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid brain_id")


# ── Routes ──

@router.post("", response_model=CollectionResponse, status_code=201)
async def create_collection(body: CollectionCreate, db: AsyncSession = Depends(get_db)):
    """创建收藏夹"""
    brain_uuid = _parse_brain_uuid(body.brain_id)
    await _ensure_brain_exists(db, brain_uuid)
    col = Collection(name=body.name, description=body.description, brain_id=brain_uuid)
    db.add(col)
    await db.flush()
    await db.refresh(col)
    return _col_resp(col)


@router.get("", response_model=CollectionListResponse)
async def list_collections(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    brain_id: str | None = Query(None),
    q: str | None = Query(None),
    progress: str = Query("all", pattern="^(all|not_done|in_progress|completed)$"),
    db: AsyncSession = Depends(get_db),
):
    """收藏夹列表（附内容计数）"""
    offset = (page - 1) * page_size
    query = select(Collection)
    if brain_id:
        brain_uuid = _parse_brain_uuid(brain_id)
        await _ensure_brain_exists(db, brain_uuid)
        query = query.where(Collection.brain_id == brain_uuid)
    keyword = (q or "").strip()
    if keyword:
        pattern = f"%{keyword}%"
        query = query.where(or_(Collection.name.ilike(pattern), Collection.description.ilike(pattern)))

    res = await db.execute(query.order_by(Collection.created_at.desc()))
    all_cols = list(res.scalars().all())
    all_collection_ids = [col.id for col in all_cols]
    progress_by_collection = await _collections_progress(db, all_collection_ids)

    def matches_progress(col: Collection) -> bool:
        if progress == "all":
            return True
        total, completed, in_progress = progress_by_collection.get(col.id, (0, 0, 0))
        if progress == "completed":
            return total > 0 and completed >= total
        if progress == "in_progress":
            return in_progress > 0
        if progress == "not_done":
            return total > 0 and completed < total
        return True

    filtered_cols = [col for col in all_cols if matches_progress(col)]
    cols = filtered_cols[offset:offset + page_size]
    collection_ids = [col.id for col in cols]
    progress_by_collection = await _collections_progress(db, collection_ids)
    resume_by_collection = await _collections_resume_content(db, collection_ids)
    result = []
    for col in cols:
        total, completed, in_progress = progress_by_collection.get(col.id, (0, 0, 0))
        result.append(_col_resp(
            col,
            item_count=total,
            completed_count=completed,
            in_progress_count=in_progress,
            resume_content=resume_by_collection.get(col.id),
        ))
    return {
        "items": result,
        "total": len(filtered_cols),
        "page": page,
        "page_size": page_size,
    }


@router.get("/favorites")
async def get_favorites(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    brain_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """获取收藏内容列表（使用默认收藏夹）"""
    # 查找默认收藏夹
    query = select(Collection).where(Collection.name == "默认收藏夹")
    if brain_id:
        brain_uuid = _parse_brain_uuid(brain_id)
        await _ensure_brain_exists(db, brain_uuid)
        query = query.where(Collection.brain_id == brain_uuid)
    fr = await db.execute(query.order_by(Collection.created_at).limit(1))
    fav = fr.scalar_one_or_none()
    if not fav:
        return {"items": [], "total": 0, "page": page, "page_size": page_size}
    # 总数
    cr = await db.execute(
        select(func.count(CollectionItem.id)).where(CollectionItem.collection_id == fav.id)
    )
    total = cr.scalar() or 0
    # 分页查内容
    offset = (page - 1) * page_size
    ir = await db.execute(
        select(Content)
        .join(CollectionItem, CollectionItem.content_id == Content.id)
        .where(CollectionItem.collection_id == fav.id)
        .order_by(CollectionItem.sort_order)
        .offset(offset)
        .limit(page_size)
    )
    items = []
    for c in ir.scalars().all():
        items.append({
            "id": str(c.id),
            "title": c.title,
            "content_type": c.content_type,
            "file_size": c.file_size,
            "created_at": c.created_at.isoformat() if c.created_at else "",
        })
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/{col_id}")
async def get_collection(col_id: str, db: AsyncSession = Depends(get_db)):
    """收藏夹详情 + 内容列表"""
    from uuid import UUID
    try:
        cid = UUID(col_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid collection id")
    res = await db.execute(select(Collection).where(Collection.id == cid))
    col = res.scalar_one_or_none()
    if not col:
        raise HTTPException(status_code=404, detail="Collection not found")
    # 内容列表
    ir = await db.execute(
        select(CollectionItem, Content)
        .join(Content, CollectionItem.content_id == Content.id)
        .where(CollectionItem.collection_id == cid, Content.is_deleted == False)
        .order_by(CollectionItem.sort_order)
    )
    items = []
    for row in ir.all():
        ci, content = row[0], row[1]
        meta = content.extra_meta or {}
        import_relative_path = meta.get("import_relative_path")
        folder_path = None
        if isinstance(import_relative_path, str) and "/" in import_relative_path:
            folder_path = import_relative_path.rsplit("/", 1)[0]
        items.append({
            "id": str(ci.id),
            "content_id": str(content.id),
            "title": content.title,
            "content_type": content.content_type,
            "sort_order": ci.sort_order,
            "added_at": content.created_at.isoformat() if content.created_at else "",
            "import_relative_path": import_relative_path if isinstance(import_relative_path, str) else None,
            "folder_path": folder_path,
            "import_root": meta.get("import_root") if isinstance(meta.get("import_root"), str) else None,
            "import_category_id": meta.get("import_category_id") if isinstance(meta.get("import_category_id"), str) else None,
            "study_status": meta.get("study_status") if isinstance(meta.get("study_status"), str) else None,
            "study_started_at": meta.get("study_started_at") if isinstance(meta.get("study_started_at"), str) else None,
            "study_completed_at": meta.get("study_completed_at") if isinstance(meta.get("study_completed_at"), str) else None,
        })
    total, completed, in_progress = await _collection_progress(db, cid)
    resume_content = await _collection_resume_content(db, cid)
    return {
        "collection": _col_resp(
            col,
            item_count=total,
            completed_count=completed,
            in_progress_count=in_progress,
            resume_content=resume_content,
        ),
        "items": items,
    }


@router.patch("/{col_id}", response_model=CollectionResponse)
async def update_collection(
    col_id: str,
    body: CollectionUpdate,
    db: AsyncSession = Depends(get_db),
):
    """更新收藏夹"""
    from uuid import UUID
    try:
        cid = UUID(col_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid collection id")
    res = await db.execute(select(Collection).where(Collection.id == cid))
    col = res.scalar_one_or_none()
    if not col:
        raise HTTPException(status_code=404, detail="Collection not found")
    if body.name is not None:
        col.name = body.name
    if body.description is not None:
        col.description = body.description
    await db.flush()
    await db.refresh(col)
    # 合集变更后失效缓存
    from app.core.scope_cache import invalidate_scope_cache
    await invalidate_scope_cache(f"quiz:scope:collection:{cid}")
    await invalidate_scope_cache(f"quiz:scope:collection:*:{cid}")
    return _col_resp(col)


@router.delete("/{col_id}")
async def delete_collection(col_id: str, db: AsyncSession = Depends(get_db)):
    """删除收藏夹（同时清除条目）"""
    from uuid import UUID
    try:
        cid = UUID(col_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid collection id")
    res = await db.execute(select(Collection).where(Collection.id == cid))
    col = res.scalar_one_or_none()
    if not col:
        raise HTTPException(status_code=404, detail="Collection not found")
    # 失效缓存
    from app.core.scope_cache import invalidate_scope_cache
    await invalidate_scope_cache(f"quiz:scope:collection:{cid}")
    await invalidate_scope_cache(f"quiz:scope:collection:*:{cid}")
    await db.execute(delete(CollectionItem).where(CollectionItem.collection_id == cid))
    await db.delete(col)
    await db.flush()
    return {"ok": True}


# ── 收藏夹内容管理 ──

@router.post("/{col_id}/add", status_code=201)
async def add_to_collection(
    col_id: str,
    body: CollectionItemAdd,
    db: AsyncSession = Depends(get_db),
):
    """添加内容到收藏夹"""
    from uuid import UUID
    try:
        cid = UUID(col_id)
        cuid = UUID(body.content_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ID format")
    # 验证收藏夹存在
    cr = await db.execute(select(Collection).where(Collection.id == cid))
    collection = cr.scalar_one_or_none()
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")
    # 验证内容存在
    con_r = await db.execute(select(Content).where(Content.id == cuid))
    content = con_r.scalar_one_or_none()
    if not content:
        raise HTTPException(status_code=404, detail="Content not found")
    if collection.brain_id is not None and content.brain_id != collection.brain_id:
        raise HTTPException(status_code=400, detail="Content belongs to another brain")
    # 检查重复
    exist = await db.execute(
        select(CollectionItem).where(
            CollectionItem.collection_id == cid,
            CollectionItem.content_id == cuid,
        )
    )
    if exist.scalar_one_or_none():
        return {"ok": True}  # 幂等
    # 取当前最大 sort_order
    sr = await db.execute(
        select(func.coalesce(func.max(CollectionItem.sort_order), 0)).where(
            CollectionItem.collection_id == cid
        )
    )
    next_order = (sr.scalar() or 0) + 1
    item = CollectionItem(collection_id=cid, content_id=cuid, sort_order=next_order)
    db.add(item)
    await db.flush()
    # 合集内容变更后失效缓存
    from app.core.scope_cache import invalidate_scope_cache
    await invalidate_scope_cache(f"quiz:scope:collection:{cid}")
    await invalidate_scope_cache(f"quiz:scope:collection:*:{cid}")
    return {"ok": True}


@router.delete("/{col_id}/remove/{content_id}")
async def remove_from_collection(
    col_id: str,
    content_id: str,
    db: AsyncSession = Depends(get_db),
):
    """从收藏夹移除内容"""
    from uuid import UUID
    try:
        cid = UUID(col_id)
        cuid = UUID(content_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ID format")
    await db.execute(
        delete(CollectionItem).where(
            CollectionItem.collection_id == cid,
            CollectionItem.content_id == cuid,
        )
    )
    await db.flush()
    # 合集内容变更后失效缓存
    from app.core.scope_cache import invalidate_scope_cache
    await invalidate_scope_cache(f"quiz:scope:collection:{cid}")
    await invalidate_scope_cache(f"quiz:scope:collection:*:{cid}")
    return {"ok": True}


# ── 快捷收藏（切换接口）──

@router.post("/favorite/{content_id}", status_code=201)
async def toggle_favorite(
    content_id: str,
    db: AsyncSession = Depends(get_db),
):
    """切换收藏状态（没有默认收藏夹则自动创建）"""
    from uuid import UUID
    try:
        cuid = UUID(content_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid content_id")
    # 验证内容存在
    cr = await db.execute(select(Content).where(Content.id == cuid))
    content = cr.scalar_one_or_none()
    if not content:
        raise HTTPException(status_code=404, detail="Content not found")
    # 查找默认收藏夹
    fr = await db.execute(
        select(Collection)
        .where(Collection.brain_id == content.brain_id, Collection.name == "默认收藏夹")
        .order_by(Collection.created_at)
        .limit(1)
    )
    fav = fr.scalar_one_or_none()
    if not fav:
        fav = Collection(name="默认收藏夹", brain_id=content.brain_id)
        db.add(fav)
        await db.flush()
        await db.refresh(fav)
    # 检查是否已收藏
    exist = await db.execute(
        select(CollectionItem).where(
            CollectionItem.collection_id == fav.id,
            CollectionItem.content_id == cuid,
        )
    )
    if exist.scalar_one_or_none():
        # 已收藏 → 取消
        await db.execute(
            delete(CollectionItem).where(
                CollectionItem.collection_id == fav.id,
                CollectionItem.content_id == cuid,
            )
        )
        await db.flush()
        return {"favorited": False}
    else:
        sr = await db.execute(
            select(func.coalesce(func.max(CollectionItem.sort_order), 0)).where(
                CollectionItem.collection_id == fav.id
            )
        )
        next_order = (sr.scalar() or 0) + 1
        db.add(CollectionItem(collection_id=fav.id, content_id=cuid, sort_order=next_order))
        await db.flush()
        return {"favorited": True}


