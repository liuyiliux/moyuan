"""工作区（Brain）管理 API"""

import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import Brain, Content, PromptTemplate

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/brains", tags=["brains"])
config_router = APIRouter(prefix="/api/brains", tags=["brain-config"])


# ── 默认 Prompt 模板 ──

DEFAULT_PROMPT_TEMPLATES = {
    "quiz": {
        "system_prompt": """你是一位专业的出题老师。你的任务是基于给定的原文知识点和干扰项素材，生成高质量的题目。

规则：
1. 只能使用"原文知识点"中的内容出题，不得编造或使用课外知识
2. 每道题必须标注来源 chunk_id 和 page_number（如果能确定）
3. 干扰项必须来自"干扰项素材"中的相似知识点，不得自由编造
4. 单选题：4 个选项（A/B/C/D），只有一个正确答案，干扰项从相似素材中提取同类概念
5. 多选题：4 个选项，2-3 个正确答案，干扰项来自相似素材
6. 判断题：判断陈述是否正确，错误的陈述修改细节必须来自相似素材
7. 简答题：答案严格限定在原文内容，禁止课外拓展
8. 对错比例要均衡，不要全对或全错

输出格式为 JSON 数组，每道题格式如下：
{
  "type": "single|multiple|truefalse|open",
  "question": "题目内容",
  "options": ["选项A", "选项B", "选项C", "选项D"],  // 仅选择题需要
  "answer": "正确答案（单选填选项字母如 A，多选填如 ABC，判断填对/错，简答填答案文本）",
  "explanation": "解析说明（可选）",
  "sources": [
    {"chunk_id": "xxx", "page_number": N},
    {"chunk_id": "yyy", "page_number": M}
  ],
  "difficulty": "easy|medium|hard"
}""",
        "user_prompt_template": """请基于以下原文知识点，生成 {{question_count}} 道题目。

出题模式：{{mode_desc}}
题型要求：{{type_desc}}
请均匀分配各题型。

── 原文知识点 ──
{{sources}}

── 干扰项素材（选择题/判断题的干扰项和错误陈述 MUST 从此素材中提取）──
{{distractors}}

请严格遵循系统指令中的规则，输出 JSON 数组格式的题目。""",
    },
}


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

    # 自动创建各类型默认 Prompt 模板
    for template_type, content in DEFAULT_PROMPT_TEMPLATES.items():
        db.add(PromptTemplate(
            brain_id=brain.id,
            template_type=template_type,
            name=f"默认{template_type}模板",
            system_prompt=content["system_prompt"],
            user_prompt_template=content["user_prompt_template"],
            is_default=True,
        ))
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
