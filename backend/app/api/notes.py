"""笔记 API：基于 Content 模型的 CRUD + 版本历史"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func, JSON
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import JSONB

from app.core.database import get_db
from app.models.models import Content
from app.schemas.file import FileResponse

router = APIRouter(prefix="/api/notes", tags=["notes"])


# ── Schemas ──

class NoteCreate(BaseModel):
    title: str
    content: str = ""
    brain_id: str | None = None


class NoteUpdate(BaseModel):
    title: str | None = None
    content: str | None = None


class NoteVersion:
    """版本历史记录（存到 extra_meta 的 versions 数组）"""

    @staticmethod
    def record(content: Content) -> None:
        if not content.extra_meta:
            content.extra_meta = {}
        versions = content.extra_meta.get("versions", [])
        versions.append({
            "title": content.title,
            "text_content": content.text_content,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        # 最多保留 20 个版本
        if len(versions) > 20:
            versions = versions[-20:]
        content.extra_meta["versions"] = versions


# ── Routes ──

@router.post("", response_model=dict)
async def create_note(body: NoteCreate, db: AsyncSession = Depends(get_db)):
    """创建笔记"""
    note = Content(
        id=uuid.uuid4(),
        title=body.title,
        content_type="note",
        source_type="manual",
        text_content=body.content,
        brain_id=uuid.UUID(body.brain_id) if body.brain_id else None,
    )
    # 记录初始版本
    NoteVersion.record(note)
    db.add(note)
    await db.commit()
    await db.refresh(note)

    return {
        "id": str(note.id),
        "title": note.title,
        "content": note.text_content,
        "created_at": note.created_at.isoformat() if note.created_at else None,
    }


@router.get("")
async def list_notes(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    star: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    """笔记列表"""
    conds = [Content.content_type == "note", Content.is_deleted == False]
    if star:
        conds.append(Content.is_starred == True)

    count_res = await db.execute(select(func.count(Content.id)).where(*conds))
    total = count_res.scalar() or 0

    res = await db.execute(
        select(Content)
        .where(*conds)
        .order_by(Content.is_pinned.desc(), Content.updated_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = res.scalars().all()

    return {
        "items": [
            {
                "id": str(n.id),
                "title": n.title,
                "content": n.text_content,
                "is_starred": n.is_starred,
                "is_pinned": n.is_pinned,
                "created_at": n.created_at.isoformat() if n.created_at else None,
                "updated_at": n.updated_at.isoformat() if n.updated_at else None,
                "version_count": len((n.extra_meta or {}).get("versions", [])),
            }
            for n in items
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/{note_id}")
async def get_note(note_id: str, db: AsyncSession = Depends(get_db)):
    """获取笔记详情"""
    res = await db.execute(
        select(Content).where(Content.id == note_id, Content.content_type == "note")
    )
    note = res.scalar_one_or_none()
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")

    return {
        "id": str(note.id),
        "title": note.title,
        "content": note.text_content,
        "is_starred": note.is_starred,
        "is_pinned": note.is_pinned,
        "brain_id": str(note.brain_id) if note.brain_id else None,
        "versions": (note.extra_meta or {}).get("versions", []),
        "created_at": note.created_at.isoformat() if note.created_at else None,
        "updated_at": note.updated_at.isoformat() if note.updated_at else None,
    }


@router.put("/{note_id}")
async def update_note(note_id: str, body: NoteUpdate, db: AsyncSession = Depends(get_db)):
    """更新笔记（自动记录版本历史）"""
    res = await db.execute(
        select(Content).where(Content.id == note_id, Content.content_type == "note")
    )
    note = res.scalar_one_or_none()
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")

    # 记录版本
    NoteVersion.record(note)

    if body.title is not None:
        note.title = body.title
    if body.content is not None:
        note.text_content = body.content

    await db.commit()
    await db.refresh(note)

    return {
        "id": str(note.id),
        "title": note.title,
        "content": note.text_content,
        "version_count": len((note.extra_meta or {}).get("versions", [])),
        "updated_at": note.updated_at.isoformat() if note.updated_at else None,
    }


@router.delete("/{note_id}")
async def delete_note(note_id: str, db: AsyncSession = Depends(get_db)):
    """软删除笔记"""
    res = await db.execute(
        select(Content).where(Content.id == note_id, Content.content_type == "note")
    )
    note = res.scalar_one_or_none()
    if note is None:
        raise HTTPException(status_code=404)
    note.is_deleted = True
    note.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True}


@router.post("/from-excerpt")
async def create_from_excerpt(
    content_id: str = Query(...),
    excerpt_text: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """从内容摘录创建笔记"""
    src = await db.execute(select(Content).where(Content.id == content_id))
    source = src.scalar_one_or_none()
    source_name = source.title if source else content_id

    note = Content(
        id=uuid.uuid4(),
        title=f"摘录自: {source_name}",
        content_type="note",
        source_type="manual",
        text_content=excerpt_text,
        extra_meta={"source_content_id": content_id, "source_title": source_name},
    )
    NoteVersion.record(note)
    db.add(note)
    await db.commit()
    await db.refresh(note)

    return {
        "id": str(note.id),
        "title": note.title,
        "content": note.text_content,
    }
