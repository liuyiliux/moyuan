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
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import Collection, CollectionItem, Content

router = APIRouter(prefix="/api/collections", tags=["collections"])


# ── Schemas ──

class CollectionCreate(BaseModel):
    name: str
    description: str | None = None


class CollectionUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class CollectionItemAdd(BaseModel):
    content_id: str


class CollectionResponse(BaseModel):
    id: str
    name: str
    description: str | None
    item_count: int = 0
    created_at: str

    model_config = {"from_attributes": True}


class CollectionItemResponse(BaseModel):
    id: str
    content_id: str
    title: str
    content_type: str
    sort_order: int
    added_at: str

    pass


# ── Helpers ──

def _col_resp(col: Collection, item_count: int = 0) -> dict:
    return {
        "id": str(col.id),
        "name": col.name,
        "description": col.description,
        "item_count": item_count,
        "created_at": col.created_at.isoformat() if col.created_at else "",
    }


# ── Routes ──

@router.post("", response_model=CollectionResponse, status_code=201)
async def create_collection(body: CollectionCreate, db: AsyncSession = Depends(get_db)):
    """创建收藏夹"""
    col = Collection(name=body.name, description=body.description)
    db.add(col)
    await db.flush()
    await db.refresh(col)
    return _col_resp(col)


@router.get("", response_model=list[CollectionResponse])
async def list_collections(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """收藏夹列表（附内容计数）"""
    offset = (page - 1) * page_size
    res = await db.execute(
        select(Collection).order_by(Collection.created_at.desc()).offset(offset).limit(page_size)
    )
    cols = list(res.scalars().all())
    # 批量查计数
    result = []
    for col in cols:
        cr = await db.execute(select(func.count(CollectionItem.id)).where(CollectionItem.collection_id == col.id))
        cnt = cr.scalar() or 0
        result.append(_col_resp(col, item_count=cnt))
    return result


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
        .where(CollectionItem.collection_id == cid)
        .order_by(CollectionItem.sort_order)
    )
    items = []
    for row in ir.all():
        ci, content = row[0], row[1]
        items.append({
            "id": str(ci.id),
            "content_id": str(content.id),
            "title": content.title,
            "content_type": content.content_type,
            "sort_order": ci.sort_order,
            "added_at": content.created_at.isoformat() if content.created_at else "",
        })
    return {"collection": _col_resp(col), "items": items}


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
    if not cr.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Collection not found")
    # 验证内容存在
    con_r = await db.execute(select(Content).where(Content.id == cuid))
    if not con_r.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Content not found")
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
    if not cr.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Content not found")
    # 查找默认收藏夹
    fr = await db.execute(select(Collection).order_by(Collection.created_at).limit(1))
    fav = fr.scalar_one_or_none()
    if not fav:
        fav = Collection(name="默认收藏夹")
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


@router.get("/favorites")
async def get_favorites(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """获取收藏内容列表（使用默认收藏夹）"""
    from uuid import UUID
    # 查找默认收藏夹
    fr = await db.execute(select(Collection).order_by(Collection.created_at).limit(1))
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
