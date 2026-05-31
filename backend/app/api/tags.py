"""标签管理 API

POST   /api/tags              — 创建标签
GET    /api/tags              — 标签列表
DELETE /api/tags/{id}        — 删除标签
POST   /api/contents/{id}/tags   — 为内容添加标签
DELETE /api/contents/{id}/tags/{tid} — 移除标签
GET    /api/contents?tag_id=  — 按标签筛选内容（已有接口扩展）
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import Tag, ContentTag, Content

router = APIRouter(prefix="/api/tags", tags=["tags"])


# ── Schemas ──

class TagCreate(BaseModel):
    name: str
    color: str | None = None


class TagResponse(BaseModel):
    id: str
    name: str
    color: str | None
    created_at: str

    model_config = {"from_attributes": True}


# ── Routes ──

@router.post("", response_model=TagResponse, status_code=201)
async def create_tag(body: TagCreate, db: AsyncSession = Depends(get_db)):
    """创建标签"""
    # 检查重名
    existing = await db.execute(select(Tag).where(Tag.name == body.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Tag name already exists")
    tag = Tag(name=body.name, color=body.color)
    db.add(tag)
    await db.flush()
    await db.refresh(tag)
    return _tag_resp(tag)


@router.get("", response_model=list[TagResponse])
async def list_tags(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """标签列表（附使用计数）"""
    offset = (page - 1) * page_size
    res = await db.execute(
        select(Tag).order_by(Tag.name).offset(offset).limit(page_size)
    )
    return [_tag_resp(t) for t in res.scalars().all()]


@router.delete("/{tag_id}")
async def delete_tag(tag_id: str, db: AsyncSession = Depends(get_db)):
    """删除标签（同时清除关联）"""
    from uuid import UUID
    try:
        tid = UUID(tag_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid tag_id")
    res = await db.execute(select(Tag).where(Tag.id == tid))
    tag = res.scalar_one_or_none()
    if tag is None:
        raise HTTPException(status_code=404, detail="Tag not found")
    # 清除关联
    await db.execute(delete(ContentTag).where(ContentTag.tag_id == tid))
    await db.delete(tag)
    await db.flush()
    return {"ok": True}


# ── 内容标签关联 ──

@router.post("/content/{content_id}", status_code=201)
async def add_tag_to_content(
    content_id: str,
    tag_id: str,
    db: AsyncSession = Depends(get_db),
):
    """为内容添加标签"""
    from uuid import UUID
    try:
        cid = UUID(content_id)
        tid = UUID(tag_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ID format")
    # 检查内容存在
    c_res = await db.execute(select(Content).where(Content.id == cid))
    if not c_res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Content not found")
    # 检查标签存在
    t_res = await db.execute(select(Tag).where(Tag.id == tid))
    if not t_res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Tag not found")
    # 检查关联已存在
    existing = await db.execute(
        select(ContentTag).where(
            ContentTag.content_id == cid,
            ContentTag.tag_id == tid,
        )
    )
    if existing.scalar_one_or_none():
        return {"ok": True}  # 已存在，幂等
    db.add(ContentTag(content_id=cid, tag_id=tid))
    await db.flush()
    return {"ok": True}


@router.delete("/content/{content_id}/{tag_id}")
async def remove_tag_from_content(
    content_id: str,
    tag_id: str,
    db: AsyncSession = Depends(get_db),
):
    """移除内容的标签"""
    from uuid import UUID
    try:
        cid = UUID(content_id)
        tid = UUID(tag_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ID format")
    await db.execute(
        delete(ContentTag).where(
            ContentTag.content_id == cid,
            ContentTag.tag_id == tid,
        )
    )
    await db.flush()
    return {"ok": True}


# ── Helpers ──

def _tag_resp(tag: Tag) -> dict:
    return {
        "id": str(tag.id),
        "name": tag.name,
        "color": tag.color,
        "created_at": tag.created_at.isoformat() if tag.created_at else "",
    }
