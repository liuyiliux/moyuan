"""工作区（Brain）管理 API"""

import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import case, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import (
    Brain,
    Category,
    Collection,
    CollectionItem,
    Content,
    ContentCategory,
    ContentTag,
    PromptTemplate,
    ProviderConfig,
    SearchLog,
    Tag,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/brains", tags=["brains"])
config_router = APIRouter(prefix="/api/brains", tags=["brain-config"])


# ── 默认 Prompt 模板 ──

DEFAULT_PROMPT_TEMPLATES = {
    "quiz": {
        "system_prompt": """你是一位专业的出题老师。你的任务是基于给定的原文知识点和干扰项素材，生成高质量的题目。

【一、出题质量规范】
优先依据原文生成概念、定义、原理、方法类考题，规避细碎边角无效考题；严格匹配用户指定难度等级。

【二、素材强制约束】
1. 题干与正确答案100%取自【原文知识点】区块内容，禁止AI凭空编造知识点；
2. 单选/多选错误选项仅能从【干扰项素材】提取内容；
3. 每题标注来源chunk_id、页码，可溯源至原PDF文档；
4. 严格遵循指定题型：{{type_desc}}；
5. 对错比例要均衡，不要全对或全错。

【三、输出格式约束】
只返回标准JSON，严格遵循约定Schema，禁止多余说明、markdown、注释文本。
{
  "type": "single|multiple|truefalse|open",
  "question": "题目内容",
  "options": ["选项A", "选项B", "选项C", "选项D"],
  "answer": "正确答案",
  "explanation": "解析说明（可选）",
  "sources": [{"chunk_id": "xxx", "page_number": N}],
  "difficulty": "easy|medium|hard"
}""",
        "user_prompt_template": """请基于以下原文知识点，生成 {{question_count}} 道题目。

出题模式：{{mode_desc}}
题型要求：{{type_desc}}
请均匀分配各题型。

=====原文知识点（正确答案出处）=====
{{sources}}

=====干扰项素材（仅用于生成错误选项，不可作为正确答案）=====
{{distractors}}

请严格遵循系统指令中的规则，输出 JSON 数组格式的题目。""",
    },
    "qa": {
        "system_prompt": """你是一个知识库助手。你的任务是基于用户提供的检索内容回答问题。

【核心规则】
1. 答案必须严格基于以下【检索内容】中的信息，禁止凭空编造；
2. 如果检索内容不足以回答问题，请明确回复"知识库中暂无相关信息，建议补充相关资料后重试"；
3. 回答应简洁、准确、有条理，使用中文；
4. 引用来源时标注方括号编号，如 [1]、[2]；
5. 不要使用"根据检索内容"之类的元表述，直接回答问题。

【回答格式】
先给出简洁答案（2-4句话），然后逐一引用来源。""",
        "user_prompt_template": """=====检索到的相关内容（共 {{top_k}} 条）=====

{{context}}

=====用户问题=====
{{question}}

请基于以上检索内容回答用户问题。""",
    },
}


# ── Schemas ──

class BrainCreate(BaseModel):
    name: str
    description: str | None = None
    icon: str | None = None
    template: str | None = None


class BrainUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    icon: str | None = None


class BrainConfig(BaseModel):
    embedding_model: str | None = None
    summarize_model: str | None = None
    quiz_model: str | None = None
    qa_model: str | None = None
    judge_model: str | None = None
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
    root = Category(name="未分类", brain_id=brain.id, sort_order=0)
    db.add(root)
    await db.commit()

    if body.template == "study":
        from app.api.tags import _ensure_tag_uniqueness_indexes

        await _ensure_tag_uniqueness_indexes(db)
        study_categories = ["基础概念", "课程笔记", "资料阅读", "实践练习", "复盘总结"]
        for index, name in enumerate(study_categories, start=1):
            db.add(Category(name=name, brain_id=brain.id, sort_order=index))
        for name, description in [
            ("课程合集", "按一套课程或系列视频收纳资料"),
            ("书籍与 PDF", "按一本书、讲义或 PDF 资料包收纳"),
            ("案例与练习", "收纳案例、作业、实践素材和复盘"),
        ]:
            db.add(Collection(name=name, description=description, brain_id=brain.id))
        for name, color in [
            ("入门", "#38bdf8"),
            ("重点", "#f97316"),
            ("待复习", "#a855f7"),
            ("已掌握", "#22c55e"),
            ("需要实践", "#eab308"),
            ("作业", "#ef4444"),
        ]:
            db.add(Tag(name=name, color=color, brain_id=brain.id))
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


@router.get("/unassigned-content")
async def get_unassigned_content_summary(db: AsyncSession = Depends(get_db)):
    """统计旧版本未归属任何工作区的内容。"""
    unassigned_filter = (Content.brain_id.is_(None),)
    legacy_visible_filter = (
        *unassigned_filter,
        or_(Content.is_deleted == False, Content.is_deleted.is_(None)),
    )
    total_result = await db.execute(
        select(func.count(Content.id)).where(*unassigned_filter)
    )
    count_result = await db.execute(
        select(func.count(Content.id)).where(*legacy_visible_filter)
    )
    deleted_result = await db.execute(
        select(func.count(Content.id)).where(*unassigned_filter, Content.is_deleted == True)
    )
    sample_result = await db.execute(
        select(Content.id, Content.title, Content.content_type)
        .where(*legacy_visible_filter)
        .order_by(Content.updated_at.desc(), Content.created_at.desc())
        .limit(5)
    )
    return {
        "count": count_result.scalar() or 0,
        "total_count": total_result.scalar() or 0,
        "deleted_count": deleted_result.scalar() or 0,
        "samples": [
            {"id": str(row.id), "title": row.title, "content_type": row.content_type}
            for row in sample_result.all()
        ],
    }


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


@router.post("/{brain_id}/adopt-unassigned")
async def adopt_unassigned_content(brain_id: str, db: AsyncSession = Depends(get_db)):
    """将旧版本未归属工作区的内容归入指定工作区。"""
    brain = await _get_brain_or_404(db, brain_id)
    result = await db.execute(
        select(Content).where(
            Content.brain_id.is_(None),
            or_(Content.is_deleted == False, Content.is_deleted.is_(None)),
        )
    )
    contents = result.scalars().all()
    for content in contents:
        content.brain_id = brain.id
        content.is_deleted = False
    await db.commit()
    return {"ok": True, "adopted": len(contents), "brain_id": str(brain.id)}


@router.get("/{brain_id}/overview")
async def get_brain_overview(brain_id: str, db: AsyncSession = Depends(get_db)):
    """查询工作区概览：内容状态、组织结构和最近更新。"""
    brain = await _get_brain_or_404(db, brain_id)

    base_content_filter = (
        Content.brain_id == brain.id,
        Content.is_deleted == False,
    )
    total_result = await db.execute(
        select(
            func.count(Content.id),
            func.coalesce(func.sum(Content.file_size), 0),
        ).where(*base_content_filter)
    )
    total_contents, storage_bytes = total_result.one()

    status_result = await db.execute(
        select(Content.processing_status, func.count(Content.id))
        .where(*base_content_filter)
        .group_by(Content.processing_status)
    )
    by_status = {status or "unknown": count for status, count in status_result.all()}

    type_result = await db.execute(
        select(Content.content_type, func.count(Content.id))
        .where(*base_content_filter)
        .group_by(Content.content_type)
    )
    by_type = {content_type or "unknown": count for content_type, count in type_result.all()}

    study_result = await db.execute(select(Content.extra_meta).where(*base_content_filter))
    study_total = 0
    study_completed = 0
    study_in_progress = 0
    for (meta,) in study_result.all():
        study_total += 1
        status = (meta or {}).get("study_status")
        if status == "completed":
            study_completed += 1
        elif status == "in_progress":
            study_in_progress += 1
    study_not_started = max(0, study_total - study_completed - study_in_progress)

    category_count = await db.scalar(select(func.count(Category.id)).where(Category.brain_id == brain.id))
    tag_count = await db.scalar(select(func.count(Tag.id)).where(Tag.brain_id == brain.id))
    collection_count = await db.scalar(select(func.count(Collection.id)).where(Collection.brain_id == brain.id))

    recent_result = await db.execute(
        select(Content)
        .where(*base_content_filter)
        .order_by(Content.updated_at.desc(), Content.created_at.desc())
        .limit(6)
    )
    recent_contents = [
        {
            "id": str(content.id),
            "title": content.title,
            "content_type": content.content_type,
            "processing_status": content.processing_status,
            "file_size": content.file_size,
            "created_at": content.created_at.isoformat() if content.created_at else None,
            "updated_at": content.updated_at.isoformat() if content.updated_at else None,
        }
        for content in recent_result.scalars().all()
    ]

    study_status_value = Content.extra_meta["study_status"].astext
    resume_result = await db.execute(
        select(Content)
        .where(
            *base_content_filter,
            or_(
                Content.extra_meta.is_(None),
                study_status_value.is_(None),
                study_status_value != "completed",
            ),
        )
        .order_by(
            case((study_status_value == "in_progress", 0), else_=1),
            Content.updated_at.desc(),
            Content.created_at.asc(),
        )
        .limit(1)
    )
    resume_content = resume_result.scalar_one_or_none()
    resume_collection_id = None
    resume_collection_name = None
    if resume_content is not None:
        resume_collection_result = await db.execute(
            select(CollectionItem.collection_id, Collection.name)
            .join(Collection, Collection.id == CollectionItem.collection_id)
            .where(
                CollectionItem.content_id == resume_content.id,
                Collection.brain_id == brain.id,
            )
            .order_by(CollectionItem.sort_order.asc(), Collection.created_at.asc())
            .limit(1)
        )
        resume_collection = resume_collection_result.first()
        if resume_collection:
            resume_collection_id = str(resume_collection.collection_id)
            resume_collection_name = resume_collection.name

    return {
        "brain": _brain_dict(brain, int(total_contents or 0)),
        "stats": {
            "total_contents": int(total_contents or 0),
            "storage_bytes": int(storage_bytes or 0),
            "by_status": by_status,
            "by_type": by_type,
            "categories": int(category_count or 0),
            "tags": int(tag_count or 0),
            "collections": int(collection_count or 0),
        },
        "study": {
            "total": study_total,
            "completed": study_completed,
            "in_progress": study_in_progress,
            "not_started": study_not_started,
            "progress_percent": round((study_completed / study_total) * 100) if study_total else 0,
        },
        "resume_content": {
            "id": str(resume_content.id),
            "title": resume_content.title,
            "content_type": resume_content.content_type,
            "processing_status": resume_content.processing_status,
            "study_status": (resume_content.extra_meta or {}).get("study_status") or "not_started",
            "collection_id": resume_collection_id,
            "collection_name": resume_collection_name,
            "updated_at": resume_content.updated_at.isoformat() if resume_content.updated_at else None,
        } if resume_content else None,
        "recent_contents": recent_contents,
    }


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

    content_result = await db.execute(select(Content).where(Content.brain_id == brain.id))
    contents = content_result.scalars().all()

    from app.api.file import _delete_content_record

    removed_files = 0
    for content in contents:
        if await _delete_content_record(content, db):
            removed_files += 1

    category_ids = select(Category.id).where(Category.brain_id == brain.id)
    tag_ids = select(Tag.id).where(Tag.brain_id == brain.id)
    collection_ids = select(Collection.id).where(Collection.brain_id == brain.id)
    await db.execute(delete(ContentCategory).where(ContentCategory.category_id.in_(category_ids)))
    await db.execute(delete(ContentTag).where(ContentTag.tag_id.in_(tag_ids)))
    await db.execute(delete(CollectionItem).where(CollectionItem.collection_id.in_(collection_ids)))
    await db.execute(delete(Collection).where(Collection.brain_id == brain.id))
    await db.execute(delete(Category).where(Category.brain_id == brain.id))
    await db.execute(delete(Tag).where(Tag.brain_id == brain.id))
    await db.execute(delete(PromptTemplate).where(PromptTemplate.brain_id == brain.id))
    await db.execute(delete(SearchLog).where(SearchLog.brain_id == brain.id))
    await db.delete(brain)
    await db.commit()
    return {"ok": True, "deleted_contents": len(contents), "removed_files": removed_files}


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
    config = {
        key: value.strip() if isinstance(value, str) else value
        for key, value in body.model_dump(exclude_none=True).items()
    }
    config = {key: value for key, value in config.items() if value not in ("", None)}
    provider_id = config.get("provider_id")
    if provider_id:
        try:
            provider_uuid = uuid.UUID(provider_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid provider_id")
        if await db.get(ProviderConfig, provider_uuid) is None:
            raise HTTPException(status_code=404, detail="Provider not found")
        config["provider_id"] = str(provider_uuid)
    brain.config = config
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
