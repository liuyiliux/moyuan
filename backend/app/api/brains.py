"""工作区（Brain）管理 API"""

import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import Brain, Content

router = APIRouter(prefix="/api/brains", tags=["brains"])
config_router = APIRouter(prefix="/api/brains", tags=["brain-config"])


# ── Schemas ──

class BrainCreate(BaseModel):
    name: str
    description: str | None = None
    icon: str | None = None


class BrainUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    icon: str | None = None


class BrainConfig(BaseModel):
    embedding_model: str | None = None
    summarize_model: str | None = None
    quiz_model: str | None = None
    provider_id: str | None = None


# ── CRUD ──

@router.post("")
async def create_brain(body: BrainCreate, db: AsyncSession = Depends(get_db)):
    """创建工作区"""
    # 检查名称唯一性
    exists = await db.execute(select(Brain).where(Brain.name == body.name))
    if exists.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Brain name already exists")

    brain = Brain(name=body.name, description=body.description, icon=body.icon)
    db.add(brain)
    await db.commit()
    await db.refresh(brain)

    # 自动创建默认分类根节点
    from app.models.models import Category
    root = Category(name="未分类", brain_id=brain.id, sort_order=0)
    db.add(root)
    await db.commit()

    return _brain_dict(brain, 0)


@router.get("")
async def list_brains(
    archived: bool = False,
    db: AsyncSession = Depends(get_db),
):
    """查询工作区列表"""
    query = select(Brain)
    if not archived:
        query = query.where(Brain.archived == False)
    query = query.order_by(Brain.is_default.desc(), Brain.created_at.desc())

    result = await db.execute(query)
    brains = result.scalars().all()

    # 批量查询每个工作区的内容数量
    brain_ids = [b.id for b in brains]
    count_result = await db.execute(
        select(Content.brain_id, func.count(Content.id))
        .where(Content.brain_id.in_(brain_ids), Content.is_deleted == False)
        .group_by(Content.brain_id)
    )
    count_map = {row[0]: row[1] for row in count_result.all()}

    return [_brain_dict(b, count_map.get(b.id, 0)) for b in brains]


@router.get("/{brain_id}")
async def get_brain(brain_id: str, db: AsyncSession = Depends(get_db)):
    """查询单个工作区"""
    brain = await _get_brain_or_404(db, brain_id)
    count_result = await db.execute(
        select(func.count(Content.id))
        .where(Content.brain_id == brain.id, Content.is_deleted == False)
    )
    count = count_result.scalar() or 0
    return _brain_dict(brain, count)


@router.put("/{brain_id}")
async def update_brain(brain_id: str, body: BrainUpdate, db: AsyncSession = Depends(get_db)):
    """更新工作区"""
    brain = await _get_brain_or_404(db, brain_id)

    if body.name is not None:
        # 检查名称唯一性（排除自身）
        exists = await db.execute(
            select(Brain).where(Brain.name == body.name, Brain.id != brain.id)
        )
        if exists.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Brain name already exists")
        brain.name = body.name

    if body.description is not None:
        brain.description = body.description
    if body.icon is not None:
        brain.icon = body.icon

    await db.commit()
    await db.refresh(brain)
    return _brain_dict(brain, 0)


@router.delete("/{brain_id}")
async def delete_brain(brain_id: str, db: AsyncSession = Depends(get_db)):
    """删除工作区"""
    brain = await _get_brain_or_404(db, brain_id)

    if brain.is_default:
        raise HTTPException(status_code=403, detail="Default brain cannot be deleted")

    # 级联删除相关内容
    await db.execute(
        select(Content).where(Content.brain_id == brain.id)
    )
    # 使用 ORM 级联删除
    await db.delete(brain)
    await db.commit()
    return {"ok": True}


@router.post("/{brain_id}/archive")
async def archive_brain(brain_id: str, db: AsyncSession = Depends(get_db)):
    """归档工作区"""
    brain = await _get_brain_or_404(db, brain_id)
    if brain.is_default:
        raise HTTPException(status_code=403, detail="Default brain cannot be archived")
    brain.archived = True
    await db.commit()
    return {"ok": True}


@router.post("/{brain_id}/restore")
async def restore_brain(brain_id: str, db: AsyncSession = Depends(get_db)):
    """恢复已归档工作区"""
    brain = await _get_brain_or_404(db, brain_id)
    brain.archived = False
    await db.commit()
    return {"ok": True}


# ── Config ──

@config_router.get("/{brain_id}/config")
async def get_brain_config(brain_id: str, db: AsyncSession = Depends(get_db)):
    """获取工作区 AI 配置"""
    brain = await _get_brain_or_404(db, brain_id)
    return brain.config or {}


@config_router.put("/{brain_id}/config")
async def update_brain_config(
    brain_id: str, body: BrainConfig, db: AsyncSession = Depends(get_db)
):
    """更新工作区 AI 配置"""
    brain = await _get_brain_or_404(db, brain_id)
    brain.config = body.model_dump(exclude_none=True)
    await db.commit()
    return {"ok": True}


# ── Helpers ──

async def _get_brain_or_404(db: AsyncSession, brain_id: str) -> Brain:
    try:
        uid = uuid.UUID(brain_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid brain ID format")

    result = await db.execute(select(Brain).where(Brain.id == uid))
    brain = result.scalar_one_or_none()
    if brain is None:
        raise HTTPException(status_code=404, detail="Brain not found")
    return brain


def _brain_dict(brain: Brain, content_count: int) -> dict:
    return {
        "id": str(brain.id),
        "name": brain.name,
        "description": brain.description,
        "icon": brain.icon,
        "is_default": brain.is_default,
        "archived": brain.archived if hasattr(brain, "archived") else False,
        "config": brain.config if hasattr(brain, "config") else None,
        "content_count": content_count,
        "created_at": brain.created_at.isoformat() if brain.created_at else None,
        "updated_at": brain.updated_at.isoformat() if brain.updated_at else None,
    }
