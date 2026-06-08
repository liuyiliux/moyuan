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
from sqlalchemy import select, func, delete, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import Brain, Tag, ContentTag, Content

router = APIRouter(prefix="/api/tags", tags=["tags"])
_tag_uniqueness_checked = False


# ── Schemas ──

class TagCreate(BaseModel):
    name: str
    color: str | None = None
    brain_id: str | None = None


class TagResponse(BaseModel):
    id: str
    name: str
    color: str | None
    brain_id: str | None = None
    created_at: str

    model_config = {"from_attributes": True}


# ── Routes ──

@router.post("", response_model=TagResponse, status_code=201)
async def create_tag(body: TagCreate, db: AsyncSession = Depends(get_db)):
    """创建标签"""
    await _ensure_tag_uniqueness_indexes(db)
    brain_uuid = _parse_brain_uuid(body.brain_id)
    await _ensure_brain_exists(db, brain_uuid)
    # 检查重名
    existing = await db.execute(select(Tag).where(Tag.name == body.name, Tag.brain_id == brain_uuid))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Tag name already exists")
    tag = Tag(name=body.name, color=body.color, brain_id=brain_uuid)
    db.add(tag)
    await db.flush()
    await db.refresh(tag)
    return _tag_resp(tag)


async def _ensure_brain_exists(db: AsyncSession, brain_id) -> None:
    if brain_id is None:
        return
    if await db.get(Brain, brain_id) is None:
        raise HTTPException(status_code=404, detail="Brain not found")


def _parse_brain_uuid(brain_id: str | None):
    if not brain_id:
        return None
    from uuid import UUID
    try:
        return UUID(brain_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid brain_id")


@router.get("", response_model=list[TagResponse])
async def list_tags(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    brain_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """标签列表（附使用计数）"""
    offset = (page - 1) * page_size
    query = select(Tag)
    if brain_id:
        brain_uuid = _parse_brain_uuid(brain_id)
        await _ensure_brain_exists(db, brain_uuid)
        query = query.where(Tag.brain_id == brain_uuid)
    res = await db.execute(query.order_by(Tag.name).offset(offset).limit(page_size))
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
    content = c_res.scalar_one_or_none()
    if not content:
        raise HTTPException(status_code=404, detail="Content not found")
    # 检查标签存在
    t_res = await db.execute(select(Tag).where(Tag.id == tid))
    tag = t_res.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    if tag.brain_id is not None and content.brain_id != tag.brain_id:
        raise HTTPException(status_code=400, detail="Tag belongs to another brain")
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
        "brain_id": str(tag.brain_id) if tag.brain_id else None,
        "created_at": tag.created_at.isoformat() if tag.created_at else "",
    }


async def _ensure_tag_uniqueness_indexes(db: AsyncSession) -> None:
    """兼容旧库：把 tags.name 全局唯一替换成按工作区唯一。"""
    global _tag_uniqueness_checked
    if _tag_uniqueness_checked:
        return
    bind = db.get_bind()
    if bind.dialect.name != "postgresql":
        _tag_uniqueness_checked = True
        return
    await db.execute(text("ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_name_key"))
    await db.execute(text(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_tags_brain_name "
        "ON tags (brain_id, name) WHERE brain_id IS NOT NULL"
    ))
    await db.execute(text(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_tags_global_name "
        "ON tags (name) WHERE brain_id IS NULL"
    ))
    _tag_uniqueness_checked = True
