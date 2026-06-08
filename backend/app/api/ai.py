"""AI 辅助 API：摘要、推荐、题库"""

import json
import random
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession
from openai import AsyncOpenAI

from app.core.database import get_db
from app.models.models import Brain, Content, ContentRelation, ContentChunk, FunctionBindingConfig, ProviderConfig, Question, QuestionRecord, PromptTemplate, Collection
from app.core.crypto import crypto_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ai", tags=["ai"])


# ── Schemas ──

class SummarizeRequest(BaseModel):
    content_id: str
    max_length: int = 500


class QuizRequest(BaseModel):
    content_ids: list[str]
    question_count: int = 5
    mode: str = "random"  # "random" | "topic"
    topic: str | None = None  # 按主题出题时的关键词
    question_types: list[str] = ["single", "multiple", "truefalse", "open"]  # 题型列表
    scope_type: str = "manual"  # "manual" | "category" | "collection"
    scope_id: str | None = None  # category_id 或 collection_id
    min_difficulty: int | None = None  # 最低难度 1-5
    max_difficulty: int | None = None  # 最高难度 1-5
    brain_id: str | None = None


class WrongQuizRequest(BaseModel):
    wrong_question_texts: list[str]
    question_count: int = 5
    scope_type: str = "manual"  # "category" | "collection" | "content"
    scope_id: str | None = None
    question_types: list[str] = ["single", "multiple", "truefalse", "open"]
    brain_id: str | None = None


class QuizRecordRequest(BaseModel):
    question_id: str
    user_answer: str
    is_correct: bool


class QuizJudgeRequest(BaseModel):
    question: str
    correct_answer: str
    user_answer: str


class AskRequest(BaseModel):
    question: str
    top_k: int = 5
    scope_type: str | None = None  # "category" | "collection" | "content"
    scope_id: str | None = None
    brain_id: str | None = None


# ── 获取 AI provider ──

async def _brain_uuid_or_404(db: AsyncSession, brain_id: str | UUID | None) -> UUID | None:
    if brain_id is None:
        return None
    try:
        brain_uuid = brain_id if isinstance(brain_id, UUID) else UUID(str(brain_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid brain_id")
    if await db.get(Brain, brain_uuid) is None:
        raise HTTPException(status_code=404, detail="Brain not found")
    return brain_uuid


async def _get_ai_provider(db: AsyncSession, fn: str = "summarize", brain_id: UUID | str | None = None) -> dict | None:
    """获取指定功能绑定的 AI 提供商。
    优先级：Brain.config > FunctionBindingConfig（设置页面显式绑定）> Provider.default_models > 无
    """
    if brain_id:
        provider = await _get_brain_ai_provider(db, brain_id, fn)
        if provider:
            return provider

    # 1. 优先检查 FunctionBindingConfig（设置页面的功能绑定，优先级最高）
    binding_result = await db.execute(
        select(FunctionBindingConfig).where(FunctionBindingConfig.function == fn)
    )
    binding = binding_result.scalar_one_or_none()
    if binding and binding.provider_id and binding.model:
        provider_result = await db.execute(
            select(ProviderConfig).where(
                ProviderConfig.id == binding.provider_id,
                ProviderConfig.is_active == True,
            )
        )
        p = provider_result.scalar_one_or_none()
        if p:
            try:
                api_key = crypto_service.decrypt(p.api_key_encrypted) if p.api_key_encrypted else None
            except Exception:
                logger.warning(f"Failed to decrypt API key for bound provider {p.id} ({p.name})")
                return None
            logger.info(f"[provider] using FunctionBinding: {fn} -> {binding.model} (provider={p.name})")
            return {
                "provider_id": str(p.id),
                "model": binding.model,
                "api_key": api_key,
                "base_url": p.base_url,
            }

    # 2. 回退到 Provider.default_models（编辑 Provider 时设置的功能模型）
    result = await db.execute(
        select(ProviderConfig).where(ProviderConfig.is_active == True)
    )
    for p in result.scalars().all():
        models = p.default_models or {}
        if fn in models:
            try:
                api_key = crypto_service.decrypt(p.api_key_encrypted) if p.api_key_encrypted else None
            except Exception:
                logger.warning(f"Failed to decrypt API key for provider {p.id} ({p.name}), skipping")
                continue
            logger.info(f"[provider] using default_models: {fn} -> {models[fn]} (provider={p.name})")
            return {
                "provider_id": str(p.id),
                "model": models[fn],
                "api_key": api_key,
                "base_url": p.base_url,
            }
    return None


async def _get_brain_ai_provider(db: AsyncSession, brain_id: UUID | str, fn: str) -> dict | None:
    """从工作区配置读取指定功能的 provider/model。"""
    try:
        uid = brain_id if isinstance(brain_id, UUID) else UUID(str(brain_id))
    except ValueError:
        return None

    brain = await db.get(Brain, uid)
    config = brain.config if brain else None
    if not isinstance(config, dict):
        return None

    provider_id = config.get("provider_id")
    if not provider_id:
        return None
    try:
        provider_uuid = UUID(str(provider_id))
    except ValueError:
        return None

    model_key = f"{fn}_model"
    model = config.get(model_key)
    if fn == "qa":
        model = model or config.get("summarize_model")
    if fn == "judge":
        model = model or config.get("quiz_model")

    provider_result = await db.execute(
        select(ProviderConfig).where(
            ProviderConfig.id == provider_uuid,
            ProviderConfig.is_active == True,
        )
    )
    p = provider_result.scalar_one_or_none()
    if not p:
        return None

    models = p.default_models or {}
    model = model or models.get(fn)
    if fn == "qa":
        model = model or models.get("summarize")
    if fn == "judge":
        model = model or models.get("quiz")
    if not model:
        return None

    try:
        api_key = crypto_service.decrypt(p.api_key_encrypted) if p.api_key_encrypted else None
    except Exception:
        logger.warning(f"Failed to decrypt API key for brain provider {p.id} ({p.name})")
        return None
    logger.info(f"[provider] using Brain.config: brain={brain_id}, {fn} -> {model} (provider={p.name})")
    return {
        "provider_id": str(p.id),
        "model": model,
        "api_key": api_key,
        "base_url": p.base_url,
    }


# ── 摘要 ──

@router.post("/summarize")
async def summarize(body: SummarizeRequest, db: AsyncSession = Depends(get_db)):
    """AI 摘要生成"""
    res = await db.execute(select(Content).where(Content.id == body.content_id))
    content = res.scalar_one_or_none()
    if content is None:
        raise HTTPException(status_code=404, detail="Content not found")

    text = content.text_content or ""
    if not text.strip():
        return {"summary": "暂无文本内容可供摘要", "content_id": body.content_id}

    provider = await _get_ai_provider(db, "summarize", content.brain_id)
    if provider is None:
        # Fallback: 简单提取前 N 个字符
        return {
            "summary": text[:body.max_length] + ("..." if len(text) > body.max_length else ""),
            "content_id": body.content_id,
            "model": "fallback",
        }

    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(
            api_key=provider["api_key"] or "no-key",
            base_url=provider["base_url"],
        )
        response = await client.chat.completions.create(
            model=provider["model"],
            messages=[
                {"role": "system", "content": f"请用简洁的中文总结以下内容，不超过{body.max_length}字。保留关键信息和逻辑结构。"},
                {"role": "user", "content": text[:8000]},
            ],
            max_tokens=min(body.max_length, 1000),
        )
        return {
            "summary": response.choices[0].message.content,
            "content_id": body.content_id,
            "model": provider["model"],
        }
    except Exception as e:
        # Fallback
        return {
            "summary": text[:body.max_length] + ("..." if len(text) > body.max_length else ""),
            "content_id": body.content_id,
            "model": "fallback",
            "error": str(e),
        }


# ── 关联推荐 ──

@router.get("/related/{content_id}")
async def get_related(
    content_id: str,
    top_k: int = Query(10, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
):
    """基于向量相似度 + 图谱关系权重的关联内容推荐

    策略：
    1. 优先使用内容级向量检索
    2. 若无内容级向量，使用分块级向量检索（取相似度最高的分块）
    3. 查询这些内容与当前内容的关系（reference/series 关系给予排序提升）
    4. 关系权重：series(0.3) > reference(0.2) > similar(0.1)
    5. 综合得分 = similarity + relation_bonus
    6. 返回 Top-K
    """
    from uuid import UUID

    res = await db.execute(select(Content).where(Content.id == content_id))
    content = res.scalar_one_or_none()
    if content is None:
        raise HTTPException(status_code=404, detail="Content not found")

    RELATION_WEIGHTS = {
        "series": 0.3,
        "reference": 0.2,
        "similar": 0.1,
    }
    cid = UUID(content_id)
    explicit_relation_result = await db.execute(
        select(ContentRelation, Content)
        .join(
            Content,
            ((ContentRelation.source_id == cid) & (Content.id == ContentRelation.target_id))
            | ((ContentRelation.target_id == cid) & (Content.id == ContentRelation.source_id)),
        )
        .where(
            ContentRelation.relation_type.in_(["series", "reference"]),
            Content.is_deleted == False,
        )
    )
    explicit_related: dict[str, dict] = {}
    for rel, related_content in explicit_relation_result.all():
        related_id = str(related_content.id)
        weight = RELATION_WEIGHTS.get(rel.relation_type, 0)
        existing = explicit_related.get(related_id)
        if existing is None or weight > existing["relation_bonus"]:
            explicit_related[related_id] = {
                "id": related_id,
                "title": related_content.title,
                "content_type": related_content.content_type,
                "similarity": 0.0,
                "relation_bonus": weight,
                "relation_type": rel.relation_type,
                "score": weight,
                "matched_chunk": None,
            }

    # Step 1: 获取候选内容
    # 优先使用内容级向量，否则使用分块级向量
    if content.embedding is not None:
        vec_str = str(content.embedding)
        sql = text("""
            SELECT id, title, content_type, NULL as chunk_id, NULL as chunk_index, NULL as page_number, NULL as image_path,
                   1 - (embedding <=> :query_vec) AS similarity
            FROM contents
            WHERE is_deleted = false
              AND id != :exclude_id
              AND embedding IS NOT NULL
            ORDER BY embedding <=> :query_vec
            LIMIT :candidate_k
        """)

        candidate_k = max(top_k * 2, 20)
        conn = await db.bind.raw_connection()
        try:
            result = await conn.execute(sql, {
                "query_vec": vec_str,
                "exclude_id": content_id,
                "candidate_k": candidate_k,
            })
            rows = result.fetchall()
        finally:
            await conn.close()
    else:
        chunk_res = await db.execute(
            select(ContentChunk).where(
                ContentChunk.content_id == content_id,
                ContentChunk.embedding.is_not(None)
            )
        )
        current_chunks = chunk_res.scalars().all()
        
        if not current_chunks:
            return {
                "related": sorted(explicit_related.values(), key=lambda x: x["score"], reverse=True)[:top_k],
                "content_id": content_id,
                "note": "No embedding available",
            }

        query_chunk = current_chunks[0]
        vec_str = str(query_chunk.embedding)

        sql = text("""
            SELECT c.id as content_id, c.title, c.content_type,
                   cc.id as chunk_id, cc.chunk_index, cc.page_number, cc.image_path,
                   1 - (cc.embedding <=> :query_vec) AS similarity
            FROM content_chunks cc
            JOIN contents c ON cc.content_id = c.id
            WHERE c.is_deleted = false
              AND cc.content_id != :exclude_id
              AND cc.embedding IS NOT NULL
            ORDER BY cc.embedding <=> :query_vec
            LIMIT :candidate_k
        """)

        candidate_k = max(top_k * 2, 20)
        conn = await db.bind.raw_connection()
        try:
            result = await conn.execute(sql, {
                "query_vec": vec_str,
                "exclude_id": content_id,
                "candidate_k": candidate_k,
            })
            rows = result.fetchall()
        finally:
            await conn.close()

    if not rows and not explicit_related:
        return {"related": [], "content_id": content_id}

    # Step 2: 查询候选内容与当前内容的关系
    candidate_ids = [r[0] if isinstance(r, (tuple, list)) else r.id for r in rows]
    relations_result = await db.execute(
        select(ContentRelation).where(
            (ContentRelation.relation_type.in_(["series", "reference", "similar"]))
            & (
                ((ContentRelation.source_id == cid) & (ContentRelation.target_id.in_(candidate_ids)))
                | ((ContentRelation.target_id == cid) & (ContentRelation.source_id.in_(candidate_ids)))
            )
        )
    )
    relations = relations_result.scalars().all()

    relation_bonus: dict[str, float] = {}
    relation_types: dict[str, str] = {}
    for rel in relations:
        related_id = str(rel.target_id if rel.source_id == cid else rel.source_id)
        weight = RELATION_WEIGHTS.get(rel.relation_type, 0)
        if related_id not in relation_bonus or weight > relation_bonus[related_id]:
            relation_bonus[related_id] = weight
            relation_types[related_id] = rel.relation_type

    # Step 3: 综合排序（按 content_id 聚合，取最高相似度）
    content_results: dict[str, dict] = dict(explicit_related)
    for r in rows:
        if isinstance(r, (tuple, list)):
            rid = str(r[0])
            title = r[1]
            content_type = r[2]
            chunk_id = r[3]
            chunk_index = r[4]
            page_number = r[5]
            image_path = r[6]
            sim = round(float(r[7]), 4)
        else:
            rid = str(r.id)
            title = r.title
            content_type = r.content_type
            chunk_id = None
            chunk_index = None
            page_number = None
            image_path = None
            sim = round(float(r.similarity), 4)

        if rid not in content_results or sim > content_results[rid]["similarity"]:
            bonus = relation_bonus.get(rid, 0.0)
            total_score = round(sim + bonus, 4)
            
            matched_chunk = None
            if chunk_id is not None:
                matched_chunk = {
                    "chunk_id": str(chunk_id),
                    "chunk_index": chunk_index,
                    "page_number": page_number,
                    "image_path": image_path,
                }
            
            content_results[rid] = {
                "id": rid,
                "title": title,
                "content_type": content_type,
                "similarity": sim,
                "relation_bonus": bonus,
                "relation_type": relation_types.get(rid),
                "score": total_score,
                "matched_chunk": matched_chunk,
            }

    scored_items = sorted(content_results.values(), key=lambda x: x["score"], reverse=True)

    return {
        "related": scored_items[:top_k],
        "content_id": content_id,
    }


# ── 题库生成 ──

# ── 常量 ──

SIM_THRESHOLD = 0.75  # 干扰项相似度阈值（余弦相似度 ≥ 0.75）
QUESTION_DEDUP_THRESHOLD = 0.9  # 题目查重阈值（余弦相似度 > 0.9 判定重复）
MAX_SOURCE_CHUNKS = 10  # 源块硬上限
MAX_TOTAL_CHUNKS = 40  # 总切块硬上限（源块 + 干扰块）

# ── Prompt 模板 ──

QUIZ_SYSTEM_PROMPT = """你是一位专业的出题老师。你的任务是基于给定的原文知识点和干扰项素材，生成高质量的题目。

【一、出题质量规范】
优先依据原文生成概念、定义、原理、方法类考题，规避细碎边角无效考题；严格匹配用户指定难度等级。

【二、素材强制约束】
1. 题干与正确答案100%取自【原文知识点】区块内容，禁止AI凭空编造知识点；
2. 单选/多选错误选项仅能从【干扰项素材】提取内容；
3. 每题标注来源chunk_id、页码，可溯源至原PDF文档；
4. 严格遵循指定题型：{type_desc}。
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
}"""


def _build_question_types_desc(question_types: list[str]) -> str:
    """构建题型描述文本"""
    type_names = {
        "single": "单选题",
        "multiple": "多选题",
        "truefalse": "判断题",
        "open": "简答题",
    }
    names = [type_names.get(t, t) for t in question_types]
    return "、".join(names)


def _vec_to_str(vec) -> str:
    """将 pgvector 向量转为字符串格式 [x, y, z]"""
    if vec is None:
        return "[]"
    # 原始 SQL 返回的向量已经是字符串（如 '[0.01,0.02,...]'），直接使用
    if isinstance(vec, str):
        return vec
    # ORM 返回的是 Vector/list 对象，需要拼接
    return "[" + ",".join(map(str, vec)) + "]"


# ── Scope 展开 ──

from app.core.scope_cache import load_scope_from_cache, save_scope_to_cache, invalidate_scope_cache


async def _expand_scope(
    db: AsyncSession,
    content_ids: list[str],
    scope_type: str,
    scope_id: str | None,
    brain_id: str | None = None,
) -> list[UUID]:
    """根据 scope_type 和 scope_id 展开出题范围为 content_id 列表"""
    brain_uuid = UUID(brain_id) if brain_id else None
    if scope_type == "manual" or not scope_id:
        if content_ids:
            manual_ids = [UUID(cid) for cid in content_ids if cid]
            if brain_uuid is None:
                return manual_ids
            result = await db.execute(
                select(Content.id, Content.brain_id)
                .where(Content.id.in_(manual_ids), Content.is_deleted == False)
            )
            rows = result.all()
            wrong_workspace = [cid for cid, row_brain_id in rows if row_brain_id != brain_uuid]
            if wrong_workspace:
                raise HTTPException(status_code=400, detail="Content does not belong to this Brain")
            return [cid for cid, _ in rows]
        # 没传 content_ids 也没传 scope_id → 返回所有内容（"全部"范围）
        query = select(Content.id).where(Content.is_deleted == False)
        if brain_uuid:
            query = query.where(Content.brain_id == brain_uuid)
        result = await db.execute(query)
        return [r[0] for r in result.all()]

    sid = UUID(scope_id)
    expanded: list[UUID] = []

    if scope_type == "category":
        from app.models.models import Category, ContentCategory

        category = await db.get(Category, sid)
        if category is None:
            return []
        if brain_uuid is not None and category.brain_id != brain_uuid:
            raise HTTPException(status_code=400, detail="Category does not belong to this Brain")

        cache_key = f"quiz:scope:category:{brain_uuid or 'global'}:{sid}"
        cached = await load_scope_from_cache(cache_key)
        if cached is not None:
            logger.info(f"[quiz] scope cache HIT: category={sid}, {len(cached)} content_ids")
            return [UUID(cid) for cid in cached]

        async def _get_child_category_ids(cat_id: UUID) -> list[UUID]:
            child_query = select(Category.id).where(Category.parent_id == cat_id)
            if brain_uuid is not None:
                child_query = child_query.where(Category.brain_id == brain_uuid)
            result = await db.execute(child_query)
            children = [r[0] for r in result.all()]
            for child_id in list(children):
                children.extend(await _get_child_category_ids(child_id))
            return children

        cat_ids = [sid] + await _get_child_category_ids(sid)
        result = await db.execute(
            select(ContentCategory.content_id)
            .where(ContentCategory.category_id.in_(cat_ids))
            .join(Content, Content.id == ContentCategory.content_id)
            .where(Content.is_deleted == False)
        )
        if brain_uuid is not None:
            result = await db.execute(
                select(ContentCategory.content_id)
                .where(ContentCategory.category_id.in_(cat_ids))
                .join(Content, Content.id == ContentCategory.content_id)
                .where(Content.is_deleted == False, Content.brain_id == brain_uuid)
            )
        expanded = [r[0] for r in result.all()]
        await save_scope_to_cache(cache_key, expanded)

    elif scope_type == "collection":
        # 检查合集是否启用
        coll_result = await db.execute(select(Collection).where(Collection.id == sid))
        coll = coll_result.scalar_one_or_none()
        if coll is None:
            return []
        if brain_uuid is not None and coll.brain_id != brain_uuid:
            raise HTTPException(status_code=400, detail="Collection does not belong to this Brain")
        if not getattr(coll, 'enable', True):
            logger.info(f"[quiz] collection {sid} is disabled, returning empty scope")
            return []

        cache_key = f"quiz:scope:collection:{brain_uuid or 'global'}:{sid}"
        cached = await load_scope_from_cache(cache_key)
        if cached is not None:
            logger.info(f"[quiz] scope cache HIT: collection={sid}, {len(cached)} content_ids")
            return [UUID(cid) for cid in cached]

        from app.models.models import CollectionItem
        result = await db.execute(
            select(CollectionItem.content_id)
            .where(CollectionItem.collection_id == sid)
            .join(Content, Content.id == CollectionItem.content_id)
            .where(Content.is_deleted == False)
        )
        if brain_uuid is not None:
            result = await db.execute(
                select(CollectionItem.content_id)
                .where(CollectionItem.collection_id == sid)
                .join(Content, Content.id == CollectionItem.content_id)
                .where(Content.is_deleted == False, Content.brain_id == brain_uuid)
            )
        expanded = [r[0] for r in result.all()]
        await save_scope_to_cache(cache_key, expanded)

    elif scope_type == "content":
        if brain_uuid is not None:
            content = await db.get(Content, sid)
            if content is None or content.is_deleted:
                return []
            if content.brain_id != brain_uuid:
                raise HTTPException(status_code=400, detail="Content does not belong to this Brain")
        expanded = [sid]

    logger.info(f"[quiz] scope expansion: type={scope_type}, scope_id={scope_id}, expanded to {len(expanded)} content_ids")
    return expanded


# ── RAG 检索辅助函数 ──

def _build_chunk_filter_clauses(content_ids: list[UUID], min_difficulty: int | None = None, max_difficulty: int | None = None):
    """构建切块通用过滤条件的 SQL WHERE 片段和参数字典"""
    clauses = [
        "cc.content_id = ANY(:content_ids)",
        "cc.chunk_type = 'text'",
        "cc.chunk_text IS NOT NULL",
        "cc.embedding IS NOT NULL",
        "cc.disable_quiz = false",
    ]
    params: dict = {"content_ids": [str(cid) for cid in content_ids]}
    if min_difficulty is not None:
        clauses.append("cc.difficulty >= :min_diff")
        params["min_diff"] = min_difficulty
    if max_difficulty is not None:
        clauses.append("cc.difficulty <= :max_diff")
        params["max_diff"] = max_difficulty
    return " AND ".join(clauses), params


async def _get_text_chunks_for_contents(
    db: AsyncSession, content_ids: list[UUID],
    min_difficulty: int | None = None, max_difficulty: int | None = None,
) -> list:
    """获取多个内容的有嵌入的 text chunk（应用禁出和难度过滤）"""
    if not content_ids:
        return []
    query = select(ContentChunk).where(
        ContentChunk.content_id.in_(content_ids),
        ContentChunk.chunk_type == "text",
        ContentChunk.chunk_text.is_not(None),
        ContentChunk.embedding.is_not(None),
        ContentChunk.disable_quiz == False,
    )
    if min_difficulty is not None:
        query = query.where(ContentChunk.difficulty >= min_difficulty)
    if max_difficulty is not None:
        query = query.where(ContentChunk.difficulty <= max_difficulty)
    result = await db.execute(query.order_by(ContentChunk.chunk_index))
    return list(result.scalars().all())


async def _get_text_chunks_for_content(
    db: AsyncSession, content_id: UUID
) -> list:
    """获取某内容的全部有嵌入的 text chunk（单内容兼容）"""
    return await _get_text_chunks_for_contents(db, [content_id])


async def _random_pick_chunks(
    db: AsyncSession, content_ids: list[UUID], count: int,
    min_difficulty: int | None = None, max_difficulty: int | None = None,
) -> list:
    """随机抽取 N 个有嵌入的 text chunk（跨内容，应用过滤）"""
    chunks = await _get_text_chunks_for_contents(db, content_ids, min_difficulty, max_difficulty)
    if len(chunks) <= count:
        return chunks
    return random.sample(chunks, count)


async def _topic_search_chunks(
    db: AsyncSession, content_ids: list[UUID], topic_vec: list[float], top_k: int,
    min_difficulty: int | None = None, max_difficulty: int | None = None,
) -> list:
    """向量检索与 topic 最相关的 text chunk（跨内容，应用过滤）"""
    vec_str = _vec_to_str(topic_vec)
    filter_clause, params = _build_chunk_filter_clauses(content_ids, min_difficulty, max_difficulty)
    sql = text(f"""
        SELECT cc.id, cc.content_id, cc.chunk_text, cc.chunk_index, cc.page_number,
               cc.embedding, cc.difficulty,
               1 - (cc.embedding <=> CAST(:query_vec AS vector)) AS score
        FROM content_chunks cc
        WHERE {filter_clause}
        ORDER BY cc.embedding <=> CAST(:query_vec AS vector)
        LIMIT :top_k
    """)
    params["query_vec"] = vec_str
    params["top_k"] = top_k
    result = await db.execute(sql, params)
    rows = result.all()
    return [
        {
            "id": str(r.id),
            "content_id": str(r.content_id),
            "chunk_text": r.chunk_text,
            "chunk_index": r.chunk_index,
            "page_number": r.page_number,
            "embedding": r.embedding,
            "difficulty": r.difficulty,
            "score": float(r.score),
        }
        for r in rows
    ]


async def _find_similar_chunks(
    db: AsyncSession,
    content_ids: list[UUID],
    chunk_embedding,
    exclude_chunk_id: UUID,
    top_k: int,
    min_similar: float = SIM_THRESHOLD,
) -> list[dict]:
    """为指定 chunk 找相似 chunk 作为干扰项素材（跨内容），应用相似度阈值"""
    vec_str = _vec_to_str(chunk_embedding)
    min_dist = 1.0 - min_similar  # 余弦距离 ≤ (1-0.75) = 0.25
    sql = text("""
        SELECT cc.id, cc.content_id, cc.chunk_text, cc.chunk_index, cc.page_number,
               1 - (cc.embedding <=> CAST(:query_vec AS vector)) AS score
        FROM content_chunks cc
        WHERE cc.content_id = ANY(:content_ids)
          AND cc.chunk_type = 'text'
          AND cc.chunk_text IS NOT NULL
          AND cc.embedding IS NOT NULL
          AND cc.disable_quiz = false
          AND cc.id != :exclude_id
          AND (cc.embedding <=> CAST(:query_vec AS vector)) <= :min_dist
        ORDER BY cc.embedding <=> CAST(:query_vec AS vector)
        LIMIT :top_k
    """)
    result = await db.execute(sql, {
        "query_vec": vec_str,
        "content_ids": [str(cid) for cid in content_ids],
        "exclude_id": exclude_chunk_id,
        "top_k": top_k,
        "min_dist": min_dist,
    })
    rows = result.all()
    return [
        {
            "id": str(r.id),
            "content_id": str(r.content_id),
            "chunk_text": r.chunk_text,
            "chunk_index": r.chunk_index,
            "page_number": r.page_number,
            "score": float(r.score),
        }
        for r in rows
    ]


def _build_quiz_prompt(
    source_chunks: list[dict],
    distractor_chunks: list[dict],
    question_count: int,
    question_types: list[str],
    mode: str,
    topic: str | None,
) -> str:
    """组装出题 Prompt"""
    type_desc = _build_question_types_desc(question_types)

    # 知识点原文（增强溯源标注格式）
    sources_text = []
    for i, chunk in enumerate(source_chunks):
        page_info = f"第{chunk['page_number']}页｜" if chunk.get("page_number") else ""
        diff = chunk.get("difficulty", "?")
        content_id_short = str(chunk.get("content_id", "?"))[:8]
        sources_text.append(
            f"[chunk_id:{chunk['id'][:8]}｜{page_info}diff:{diff}｜content_id:{content_id_short}]\n{chunk['chunk_text']}"
        )
    sources_combined = "\n\n---\n\n".join(sources_text)

    # 干扰项素材
    distractors_text = []
    if distractor_chunks:
        for i, dc in enumerate(distractor_chunks):
            page_info = f"第{dc['page_number']}页｜" if dc.get("page_number") else ""
            distractors_text.append(
                f"[干扰素材 {i+1} - chunk_id:{dc['id'][:8]}｜{page_info}content_id:{str(dc.get('content_id', '?'))[:8]}]\n{dc['chunk_text']}"
            )
    distractors_combined = "\n\n".join(distractors_text) if distractors_text else "（无额外干扰素材，可从原文自身不同角度出题）"

    mode_desc = f"按主题「{topic}」出题" if mode == "topic" and topic else "随机出题"

    return f"""请基于以下原文知识点，生成 {question_count} 道题目。

出题模式：{mode_desc}
题型要求：{type_desc}
请均匀分配各题型。

── 原文知识点（正确答案出处）──
{sources_combined}

── 干扰项素材（仅用于生成错误选项，不可作为正确答案）──
{distractors_combined}

请严格遵循系统指令中的规则，输出 JSON 数组格式的题目。"""


async def _call_llm_with_retry(
    provider: dict, system_prompt: str, user_prompt: str, max_retries: int = 1
) -> dict | None:
    """调用 LLM 并解析 JSON，支持一次重试"""
    client = AsyncOpenAI(
        api_key=provider["api_key"] or "no-key",
        base_url=provider["base_url"],
    )
    for attempt in range(max_retries + 1):
        try:
            logger.info(f"[quiz] calling AI API (attempt {attempt + 1}/{max_retries + 1})...")
            response = await client.chat.completions.create(
                model=provider["model"],
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt[:12000]},
                ],
                response_format={"type": "json_object"},
                max_tokens=4096,
            )
            logger.info(f"[quiz] AI response received, tokens={response.usage}")
            raw = response.choices[0].message.content or "{}"
            logger.info(f"[quiz] AI raw response (first 500 chars): {raw[:500]}")
            data = json.loads(raw)
            return data
        except (json.JSONDecodeError, Exception) as e:
            logger.warning(f"[quiz] LLM call failed (attempt {attempt + 1}): {e}")
            if attempt >= max_retries:
                logger.error(f"[quiz] LLM call failed after {max_retries + 1} attempts")
                return None
    return None


@router.post("/quiz")
async def generate_quiz(body: QuizRequest, db: AsyncSession = Depends(get_db)):
    """AI 题库生成（RAG 检索出题）v2

    支持两种模式 + 三种范围 + 难度过滤：
    - mode: random / topic
    - scope: manual(单书/多书) / category(按分类) / collection(按合集)
    - 干扰项增加相似度阈值 0.75，题目入库前向量查重
    """
    requested_brain_id = await _brain_uuid_or_404(db, body.brain_id)
    # 展开出题范围
    content_ids = await _expand_scope(db, body.content_ids, body.scope_type, body.scope_id, body.brain_id)
    if not content_ids:
        if not body.content_ids and (body.scope_type == "manual" or not body.scope_id):
            raise HTTPException(status_code=400, detail="No content_ids provided")
        return {"questions": [], "note": "所选范围内没有可用的内容"}

    brain_id = requested_brain_id
    if brain_id is None and content_ids:
        content_res = await db.execute(select(Content).where(Content.id == content_ids[0]))
        content = content_res.scalar_one_or_none()
        if content and content.brain_id:
            brain_id = content.brain_id

    logger.info(f"[quiz] start quiz generation: content_ids={[str(c) for c in content_ids[:5]]}..., mode={body.mode}, topic={body.topic}, question_count={body.question_count}, scope={body.scope_type}")

    # 检查可用 text chunk（应用过滤）
    min_diff = getattr(body, 'min_difficulty', None)
    max_diff = getattr(body, 'max_difficulty', None)
    text_chunks = await _get_text_chunks_for_contents(db, content_ids, min_diff, max_diff)
    logger.info(f"[quiz] text_chunks count={len(text_chunks)} (filters: min_diff={min_diff}, max_diff={max_diff})")
    if not text_chunks:
        return {
            "questions": [],
            "note": "所选范围内暂无文本分块可供出题，图片 PDF 需要 OCR 支持",
        }

    # 根据模式检索出题 chunk
    source_count = min(body.question_count, MAX_SOURCE_CHUNKS)
    logger.info(f"[quiz] retrieving source chunks, mode={body.mode}, source_count={source_count}")

    if body.mode == "topic" and body.topic:
        from app.services.embedding import embed_texts
        topic_vecs = await embed_texts(db, [body.topic], brain_id=brain_id)
        topic_vec = topic_vecs[0] if topic_vecs else None
        if topic_vec is None:
            return {"questions": [], "error": "无法为关键词生成嵌入向量，请检查 embedding 配置"}

        # 冗余召回 top_k = max(source_count * 2, 12)
        top_k = max(source_count * 2, 12)
        search_results = await _topic_search_chunks(db, content_ids, topic_vec, top_k, min_diff, max_diff)

        if not search_results:
            # 降级：向量检索无结果 → 随机抽取
            logger.info("[quiz] topic search returned no results, falling back to random pick")
            picked = await _random_pick_chunks(db, content_ids, source_count, min_diff, max_diff)
            source_chunks = [
                {
                    "id": str(c.id), "content_id": str(c.content_id),
                    "chunk_text": c.chunk_text, "chunk_index": c.chunk_index,
                    "page_number": c.page_number, "embedding": c.embedding,
                    "difficulty": c.difficulty,
                }
                for c in picked
            ]
        else:
            source_chunks = search_results[:source_count]
    else:
        picked = await _random_pick_chunks(db, content_ids, source_count, min_diff, max_diff)
        source_chunks = [
            {
                "id": str(c.id), "content_id": str(c.content_id),
                "chunk_text": c.chunk_text, "chunk_index": c.chunk_index,
                "page_number": c.page_number, "embedding": c.embedding,
                "difficulty": c.difficulty,
            }
            for c in picked
        ]

    if not source_chunks:
        logger.info("[quiz] no source_chunks found")
        return {"questions": [], "note": "暂无符合条件的文本分块可供出题"}

    # 对每个出题 chunk 找相似 chunk 作为干扰项素材（含相似度阈值）
    logger.info(f"[quiz] source_chunks count={len(source_chunks)}, fetching distractors (threshold={SIM_THRESHOLD})...")
    distractor_chunks: list[dict] = []
    for source in source_chunks:
        if source.get("embedding") is not None:
            similars = await _find_similar_chunks(
                db, content_ids, source["embedding"], UUID(source["id"]), top_k=3, min_similar=SIM_THRESHOLD
            )
            for s in similars:
                if s["id"] not in {d["id"] for d in distractor_chunks}:
                    distractor_chunks.append(s)
        else:
            logger.info(f"[quiz] source chunk {source.get('id', '?')[:8]} has no embedding, skipping distractor search")

    # Token 总量控制：总切块 ≤ 40
    total_chunks = len(source_chunks) + len(distractor_chunks)
    if total_chunks > MAX_TOTAL_CHUNKS:
        logger.info(f"[quiz] total chunks {total_chunks} exceeds limit {MAX_TOTAL_CHUNKS}, trimming distractors...")
        # 按源块均匀削减干扰块
        max_dist_per_source = max(0, (MAX_TOTAL_CHUNKS - len(source_chunks)) // len(source_chunks))
        trimmed = []
        for source in source_chunks:
            src_id = str(source.get("id", ""))
            src_distractors = [d for d in distractor_chunks if src_id in str(d.get("id", "")) or True]
            trimmed.extend(src_distractors[:max_dist_per_source])
        # 去重
        seen = set()
        distractor_chunks = []
        for d in trimmed:
            if d["id"] not in seen:
                seen.add(d["id"])
                distractor_chunks.append(d)
        total_chunks = len(source_chunks) + len(distractor_chunks)
    logger.info(f"[quiz] distractor_chunks count={len(distractor_chunks)}, total_chunks={total_chunks}, est_tokens~{total_chunks * 325}")

    # 组装 Prompt
    question_types = body.question_types or ["single", "multiple", "truefalse", "open"]
    type_desc = _build_question_types_desc(question_types)
    mode_desc = f"按主题「{body.topic}」出题" if body.mode == "topic" and body.topic else "随机出题"

    # 用户 Prompt 构建（增强溯源标注）
    sources_text = []
    for i, chunk in enumerate(source_chunks):
        diff = chunk.get("difficulty", "?")
        page_info = f"第{chunk['page_number']}页｜" if chunk.get('page_number') else ""
        content_id_short = str(chunk.get("content_id", "?"))[:8]
        sources_text.append(
            f"[chunk_id:{chunk['id'][:8]}｜{page_info}diff:{diff}｜content_id:{content_id_short}]\n{chunk['chunk_text']}"
        )
    sources_combined = "\n\n---\n\n".join(sources_text)

    distractors_text = []
    if distractor_chunks:
        for i, dc in enumerate(distractor_chunks):
            page_info = f"第{dc['page_number']}页｜" if dc.get("page_number") else ""
            distractors_text.append(
                f"[干扰素材 {i+1} - chunk_id:{dc['id'][:8]}｜{page_info}content_id:{str(dc.get('content_id', '?'))[:8]}]\n{dc['chunk_text']}"
            )
    distractors_combined = "\n\n".join(distractors_text) if distractors_text else "（无额外干扰素材，可从原文自身不同角度出题）"

    template_vars = {
        "sources": sources_combined,
        "distractors": distractors_combined,
        "question_count": str(body.question_count),
        "question_types": type_desc,
        "type_desc": type_desc,
        "mode_desc": mode_desc,
        "topic": body.topic or "",
    }

    # 加载模板
    provider = await _get_ai_provider(db, "quiz", brain_id)
    logger.info(f"[quiz] AI provider={'found (' + provider['model'] + ')' if provider else 'not found (fallback)'}")

    template = await _get_or_create_quiz_template(db, brain_id)
    if template:
        system_prompt = _render_template(template.system_prompt, template_vars)
        user_prompt = _render_template(template.user_prompt_template, template_vars)
        logger.info(f"[quiz] using template: {template.name}, user_prompt length={len(user_prompt)}")
    else:
        system_prompt = QUIZ_SYSTEM_PROMPT.format(type_desc=type_desc)
        user_prompt = _build_quiz_prompt(
            source_chunks, distractor_chunks,
            body.question_count, question_types,
            body.mode, body.topic,
        )
        logger.info(f"[quiz] falling back to hardcoded prompt, length={len(user_prompt)}")

    if provider is None:
        return {
            "questions": [
                {
                    "type": "open",
                    "question": "请基于以下知识点回答问题",
                    "answer": source_chunks[0]["chunk_text"][:200] if source_chunks else "",
                    "sources": [
                        {"chunk_id": source_chunks[0]["id"][:8], "page_number": source_chunks[0].get("page_number")}
                    ] if source_chunks else [],
                }
            ],
            "note": "fallback mode (no AI provider configured for quiz)",
        }

    # 调用 LLM + 重试
    data = await _call_llm_with_retry(provider, system_prompt, user_prompt, max_retries=1)
    if data is None:
        return {"questions": [], "error": "AI 返回格式异常，已重试失败"}

    # 解析题目
    questions = None
    if isinstance(data, dict):
        for key in ("questions", "考试题目", "题目", "quiz"):
            if key in data:
                questions = data[key]
                break
        if questions is None:
            for v in data.values():
                if isinstance(v, list):
                    questions = v
                    break
    if questions is None:
        questions = data if isinstance(data, list) else []

    logger.info(f"[quiz] parsed {len(questions)} questions")

    parsed_questions = []
    for q in questions:
        parsed_questions.append({
            "type": q.get("type", "open"),
            "question": q.get("question", ""),
            "options": q.get("options"),
            "answer": q.get("answer", ""),
            "explanation": q.get("explanation"),
            "sources": q.get("sources", []),
            "difficulty": q.get("difficulty", "medium"),
        })

    # 题目落库（含向量查重）
    if parsed_questions:
        default_content_id = content_ids[0]
        logger.info(f"[quiz] saving {len(parsed_questions)} questions to DB (with dedup)...")
        await _save_questions(db, default_content_id, source_chunks, parsed_questions)

    logger.info(f"[quiz] done, returning {len(parsed_questions)} questions")
    return {
        "questions": parsed_questions,
        "model": provider["model"],
        "mode": body.mode,
    }


async def _save_questions(
    db: AsyncSession, default_content_id: UUID, source_chunks: list[dict], questions: list[dict]
):
    """将生成的题目写入 questions 表，含向量查重和多来源追踪"""
    from app.services.embedding import embed_texts

    # 收集需要查重的内容范围
    source_content_ids: set[str] = {str(default_content_id)}
    for sc in source_chunks:
        if sc.get("content_id"):
            source_content_ids.add(str(sc["content_id"]))

    # 构建 chunk_id → content_id 映射
    chunk_content_map: dict[str, UUID] = {}
    for sc in source_chunks:
        if sc.get("id"):
            chunk_content_map[sc["id"]] = UUID(sc.get("content_id", str(default_content_id)))

    # 批量生成题目向量用于查重
    question_texts = [q.get("question", "") for q in questions if q.get("question")]
    question_embeddings: list = [None] * len(questions)
    if question_texts:
        try:
            question_embeddings = await embed_texts(db, question_texts)
        except Exception as e:
            logger.warning(f"[quiz] failed to generate question embeddings for dedup: {e}")
            question_embeddings = [None] * len(questions)

    saved_count = 0
    dup_count = 0
    for i, q in enumerate(questions):
        # ── 向量查重 ──
        q_emb = question_embeddings[i] if i < len(question_embeddings) else None
        if q_emb is not None:
            vec_str = _vec_to_str(q_emb)
            dedup_sql = text("""
                SELECT id FROM questions
                WHERE content_id = ANY(:content_ids)
                  AND embedding IS NOT NULL
                  AND (embedding <=> CAST(:query_vec AS vector)) < :min_dist
                LIMIT 1
            """)
            dedup_result = await db.execute(dedup_sql, {
                "content_ids": [cid for cid in source_content_ids],
                "query_vec": vec_str,
                "min_dist": 1.0 - QUESTION_DEDUP_THRESHOLD,
            })
            if dedup_result.scalar_one_or_none():
                logger.info(f"[quiz] duplicate question detected (similarity > {QUESTION_DEDUP_THRESHOLD}), skipping: {q.get('question', '')[:60]}...")
                dup_count += 1
                continue

        # ── 来源解析 ──
        source_chunk_id = None
        page_number = None
        content_id = default_content_id
        chunk_ids_list: list[str] = []
        content_ids_list: list[str] = []

        if q.get("sources"):
            sources = q["sources"] if isinstance(q["sources"], list) else [q["sources"]]
            for j, src in enumerate(sources):
                if isinstance(src, dict) and src.get("chunk_id"):
                    chunk_ids_list.append(str(src["chunk_id"]))
                    try:
                        cid = UUID(src["chunk_id"])
                        # 使用 chunk_content_map 获取真实 content_id
                        mapped_cid = chunk_content_map.get(str(cid))
                        if mapped_cid:
                            content_ids_list.append(str(mapped_cid))
                        if j == 0:
                            source_chunk_id = cid
                            if mapped_cid:
                                content_id = mapped_cid
                            page_number = src.get("page_number")
                    except (ValueError, TypeError):
                        pass

        if not chunk_ids_list:
            # 无来源时回退到第一个源块
            if source_chunks:
                sc0 = source_chunks[0]
                source_chunk_id = UUID(sc0["id"]) if sc0.get("id") else None
                content_id = chunk_content_map.get(sc0.get("id", ""), default_content_id)
                page_number = sc0.get("page_number")

        question = Question(
            content_id=content_id,
            q_type=q.get("type", "open"),
            question=q.get("question", ""),
            options=q.get("options"),
            answer=str(q.get("answer", "")),
            explanation=q.get("explanation"),
            source_chunk_id=source_chunk_id,
            page_number=page_number,
            difficulty=q.get("difficulty", "medium"),
            embedding=q_emb,
            source_chunk_ids=chunk_ids_list if chunk_ids_list else None,
            source_content_ids=content_ids_list if content_ids_list else None,
        )
        db.add(question)
        saved_count += 1

    await db.commit()
    logger.info(f"[quiz] saved {saved_count} questions + skipped {dup_count} duplicates")


def _question_to_dict(q: Question) -> dict:
    result = {
        "id": str(q.id),
        "type": q.q_type,
        "question": q.question,
        "options": q.options,
        "answer": q.answer,
        "explanation": q.explanation,
        "difficulty": q.difficulty,
        "content_id": str(q.content_id) if q.content_id else None,
        "created_at": q.created_at.isoformat() if q.created_at else None,
    }
    # 溯源信息：优先使用新的多来源字段，回退到旧单来源字段
    if q.source_chunk_ids:
        result["sources"] = [
            {"chunk_id": cid, "page_number": q.page_number if i == 0 else None}
            for i, cid in enumerate(q.source_chunk_ids)
        ]
    else:
        result["sources"] = [
            {
                "chunk_id": str(q.source_chunk_id) if q.source_chunk_id else None,
                "page_number": q.page_number,
            }
        ]
    if q.source_content_ids:
        result["source_content_ids"] = q.source_content_ids
    return result


@router.get("/quiz/history")
async def get_quiz_history_scoped(
    scope_type: str | None = Query(None, description="category | collection | content"),
    scope_id: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """查询历史题目，支持按范围过滤和分页"""
    from app.models.models import Category, ContentCategory, CollectionItem

    content_ids: list[UUID] | None = None
    if scope_type and scope_id:
        sid = UUID(scope_id)
        if scope_type == "category":
            async def _get_child_cat_ids(cat_id: UUID) -> list[UUID]:
                result = await db.execute(select(Category.id).where(Category.parent_id == cat_id))
                children = [r[0] for r in result.all()]
                for child_id in list(children):
                    children.extend(await _get_child_cat_ids(child_id))
                return children
            cat_ids = [sid] + await _get_child_cat_ids(sid)
            result = await db.execute(
                select(ContentCategory.content_id).where(ContentCategory.category_id.in_(cat_ids))
            )
            content_ids = [r[0] for r in result.all()]
        elif scope_type == "collection":
            result = await db.execute(
                select(CollectionItem.content_id).where(CollectionItem.collection_id == sid)
            )
            content_ids = [r[0] for r in result.all()]
        elif scope_type == "content":
            content_ids = [sid]
        if content_ids is None or len(content_ids) == 0:
            return {"questions": [], "total": 0, "page": page, "page_size": page_size}

    # 查询题目
    if content_ids is not None:
        query = select(Question).where(Question.content_id.in_(content_ids)).order_by(Question.created_at.desc())
    else:
        query = select(Question).order_by(Question.created_at.desc())

    # 统计总数
    count_query = select(func.count()).select_from(query.subquery())
    total_res = await db.execute(count_query)
    total = total_res.scalar() or 0

    # 分页
    offset = (page - 1) * page_size
    result = await db.execute(query.offset(offset).limit(page_size))
    questions = result.scalars().all()

    return {
        "questions": [_question_to_dict(q) for q in questions],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


# ── Prompt 模板辅助 ──

async def _get_or_create_quiz_template(db: AsyncSession, brain_id: UUID | None) -> PromptTemplate | None:
    """获取或创建当前 Brain 的 quiz 默认模板（兼容已有 Brain 无模板记录）"""
    from app.api.brains import DEFAULT_PROMPT_TEMPLATES
    quiz_default = DEFAULT_PROMPT_TEMPLATES.get("quiz")
    if not quiz_default:
        return None

    result = await db.execute(
        select(PromptTemplate).where(
            PromptTemplate.brain_id == brain_id,
            PromptTemplate.template_type == "quiz",
            PromptTemplate.is_default == True,
        )
    )
    template = result.scalar_one_or_none()
    if template:
        # 仅对"默认quiz模板"自动更新（用户改过名的跳过，保护自定义修改）
        if template.name == "默认quiz模板" and (
                template.system_prompt != quiz_default["system_prompt"] or
                template.user_prompt_template != quiz_default["user_prompt_template"]):
            template.system_prompt = quiz_default["system_prompt"]
            template.user_prompt_template = quiz_default["user_prompt_template"]
            await db.commit()
            logger.info(f"[quiz] updated default quiz template to latest version for brain_id={brain_id}")
        return template

    # 不存在则创建默认模板
    template = PromptTemplate(
        brain_id=brain_id,
        template_type="quiz",
        name="默认quiz模板",
        system_prompt=quiz_default["system_prompt"],
        user_prompt_template=quiz_default["user_prompt_template"],
        is_default=True,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    logger.info(f"[quiz] created default quiz template for brain_id={brain_id}")
    return template


async def _get_or_create_qa_template(db: AsyncSession, brain_id: UUID | None) -> PromptTemplate | None:
    """获取或创建当前 Brain 的 qa 默认模板"""
    from app.api.brains import DEFAULT_PROMPT_TEMPLATES
    qa_default = DEFAULT_PROMPT_TEMPLATES.get("qa")
    if not qa_default:
        return None

    result = await db.execute(
        select(PromptTemplate).where(
            PromptTemplate.brain_id == brain_id,
            PromptTemplate.template_type == "qa",
            PromptTemplate.is_default == True,
        )
    )
    template = result.scalar_one_or_none()
    if template:
        if template.name == "默认qa模板" and (
                template.system_prompt != qa_default["system_prompt"] or
                template.user_prompt_template != qa_default["user_prompt_template"]):
            template.system_prompt = qa_default["system_prompt"]
            template.user_prompt_template = qa_default["user_prompt_template"]
            await db.commit()
            logger.info(f"[qa] updated default qa template for brain_id={brain_id}")
        return template

    template = PromptTemplate(
        brain_id=brain_id,
        template_type="qa",
        name="默认qa模板",
        system_prompt=qa_default["system_prompt"],
        user_prompt_template=qa_default["user_prompt_template"],
        is_default=True,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    logger.info(f"[qa] created default qa template for brain_id={brain_id}")
    return template


def _render_template(template_str: str, variables: dict[str, str]) -> str:
    """渲染模板变量：将 {{variable}} 替换为对应值"""
    result = template_str
    for key, value in variables.items():
        result = result.replace(f"{{{{{key}}}}}", value or "")
    return result


# ── Prompt 模板 API ──

class TemplateUpdateRequest(BaseModel):
    system_prompt: str
    user_prompt_template: str
    brain_id: str | None = None


def _template_brain_uuid(brain_id: str | None) -> UUID | None:
    return UUID(brain_id) if brain_id else None


async def _ensure_template_brain_exists(db: AsyncSession, brain_id: UUID | None) -> None:
    if brain_id is None:
        return
    if await db.get(Brain, brain_id) is None:
        raise HTTPException(status_code=404, detail="Brain not found")


def _template_payload(template: PromptTemplate) -> dict:
    return {
        "id": str(template.id),
        "brain_id": str(template.brain_id) if template.brain_id else None,
        "name": template.name,
        "description": template.description,
        "system_prompt": template.system_prompt,
        "user_prompt_template": template.user_prompt_template,
    }


@router.get("/quiz-template")
async def get_quiz_template(
    brain_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """获取当前工作区的默认 quiz 模板"""
    brain_uuid = _template_brain_uuid(brain_id)
    await _ensure_template_brain_exists(db, brain_uuid)
    result = await db.execute(
        select(PromptTemplate).where(
            PromptTemplate.brain_id == brain_uuid,
            PromptTemplate.template_type == "quiz",
            PromptTemplate.is_default == True,
        )
    )
    t = result.scalar_one_or_none()
    if t is None:
        from app.api.brains import DEFAULT_PROMPT_TEMPLATES
        quiz_default = DEFAULT_PROMPT_TEMPLATES.get("quiz", {})
        return {
            "template": {
                "system_prompt": quiz_default.get("system_prompt", ""),
                "user_prompt_template": quiz_default.get("user_prompt_template", ""),
            },
            "note": "using system default (no template in DB)",
        }
    return {"template": _template_payload(t)}


@router.get("/quiz-templates")
async def list_quiz_templates(db: AsyncSession = Depends(get_db)):
    """获取当前工作区所有 quiz 模板"""
    result = await db.execute(
        select(PromptTemplate).where(
            PromptTemplate.template_type == "quiz"
        ).order_by(PromptTemplate.is_default.desc(), PromptTemplate.created_at.desc())
    )
    return {
        "templates": [
            {
                "id": str(t.id),
                "brain_id": str(t.brain_id) if t.brain_id else None,
                "name": t.name,
                "description": t.description,
                "system_prompt": t.system_prompt,
                "user_prompt_template": t.user_prompt_template,
                "is_default": t.is_default,
                "created_at": t.created_at.isoformat() if t.created_at else None,
                "updated_at": t.updated_at.isoformat() if t.updated_at else None,
            }
            for t in result.scalars().all()
        ]
    }


@router.put("/quiz-template")
async def update_quiz_template(body: TemplateUpdateRequest, db: AsyncSession = Depends(get_db)):
    """更新默认 quiz 模板"""
    brain_uuid = _template_brain_uuid(body.brain_id)
    await _ensure_template_brain_exists(db, brain_uuid)
    result = await db.execute(
        select(PromptTemplate).where(
            PromptTemplate.brain_id == brain_uuid,
            PromptTemplate.template_type == "quiz",
            PromptTemplate.is_default == True,
        )
    )
    template = result.scalar_one_or_none()

    if template is None:
        template = PromptTemplate(
            brain_id=brain_uuid,
            template_type="quiz",
            name="默认quiz模板",
            system_prompt=body.system_prompt,
            user_prompt_template=body.user_prompt_template,
            is_default=True,
        )
        db.add(template)
    else:
        template.system_prompt = body.system_prompt
        template.user_prompt_template = body.user_prompt_template

    await db.commit()
    await db.refresh(template)
    return {
        "template": _template_payload(template),
        "message": "Template saved",
    }


@router.post("/quiz-template/reset")
async def reset_quiz_template(
    brain_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """恢复为系统默认模板"""
    from app.api.brains import DEFAULT_PROMPT_TEMPLATES
    quiz_default = DEFAULT_PROMPT_TEMPLATES.get("quiz", {})
    brain_uuid = _template_brain_uuid(brain_id)
    await _ensure_template_brain_exists(db, brain_uuid)

    result = await db.execute(
        select(PromptTemplate).where(
            PromptTemplate.brain_id == brain_uuid,
            PromptTemplate.template_type == "quiz",
            PromptTemplate.is_default == True,
        )
    )
    template = result.scalar_one_or_none()

    if template:
        template.system_prompt = quiz_default.get("system_prompt", "")
        template.user_prompt_template = quiz_default.get("user_prompt_template", "")
    else:
        template = PromptTemplate(
            brain_id=brain_uuid,
            template_type="quiz",
            name="默认quiz模板",
            system_prompt=quiz_default.get("system_prompt", ""),
            user_prompt_template=quiz_default.get("user_prompt_template", ""),
            is_default=True,
        )
        db.add(template)

    await db.commit()
    await db.refresh(template)
    return {
        "template": _template_payload(template),
        "message": "Template reset to default",
    }


# ── QA 模板管理（与 quiz 模板对称）──

@router.get("/qa-template")
async def get_qa_template(
    brain_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """获取当前工作区的默认 qa 模板"""
    brain_uuid = _template_brain_uuid(brain_id)
    await _ensure_template_brain_exists(db, brain_uuid)
    result = await db.execute(
        select(PromptTemplate).where(
            PromptTemplate.brain_id == brain_uuid,
            PromptTemplate.template_type == "qa",
            PromptTemplate.is_default == True,
        )
    )
    t = result.scalar_one_or_none()
    if t is None:
        from app.api.brains import DEFAULT_PROMPT_TEMPLATES
        qa_default = DEFAULT_PROMPT_TEMPLATES.get("qa", {})
        return {
            "template": {
                "system_prompt": qa_default.get("system_prompt", ""),
                "user_prompt_template": qa_default.get("user_prompt_template", ""),
            },
            "note": "using system default (no template in DB)",
        }
    return {"template": _template_payload(t)}


@router.put("/qa-template")
async def update_qa_template(body: TemplateUpdateRequest, db: AsyncSession = Depends(get_db)):
    """更新默认 qa 模板"""
    brain_uuid = _template_brain_uuid(body.brain_id)
    await _ensure_template_brain_exists(db, brain_uuid)
    result = await db.execute(
        select(PromptTemplate).where(
            PromptTemplate.brain_id == brain_uuid,
            PromptTemplate.template_type == "qa",
            PromptTemplate.is_default == True,
        )
    )
    template = result.scalar_one_or_none()
    if template is None:
        template = PromptTemplate(
            brain_id=brain_uuid,
            template_type="qa",
            name="默认qa模板",
            system_prompt=body.system_prompt,
            user_prompt_template=body.user_prompt_template,
            is_default=True,
        )
        db.add(template)
    else:
        template.system_prompt = body.system_prompt
        template.user_prompt_template = body.user_prompt_template
    await db.commit()
    await db.refresh(template)
    return {
        "template": _template_payload(template),
        "message": "Template saved",
    }


@router.post("/qa-template/reset")
async def reset_qa_template(
    brain_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """恢复为系统默认 qa 模板"""
    from app.api.brains import DEFAULT_PROMPT_TEMPLATES
    qa_default = DEFAULT_PROMPT_TEMPLATES.get("qa", {})
    brain_uuid = _template_brain_uuid(brain_id)
    await _ensure_template_brain_exists(db, brain_uuid)
    result = await db.execute(
        select(PromptTemplate).where(
            PromptTemplate.brain_id == brain_uuid,
            PromptTemplate.template_type == "qa",
            PromptTemplate.is_default == True,
        )
    )
    template = result.scalar_one_or_none()
    if template:
        template.system_prompt = qa_default.get("system_prompt", "")
        template.user_prompt_template = qa_default.get("user_prompt_template", "")
    else:
        template = PromptTemplate(
            brain_id=brain_uuid,
            template_type="qa",
            name="默认qa模板",
            system_prompt=qa_default.get("system_prompt", ""),
            user_prompt_template=qa_default.get("user_prompt_template", ""),
            is_default=True,
        )
        db.add(template)
    await db.commit()
    await db.refresh(template)
    return {
        "template": _template_payload(template),
        "message": "Template reset to default",
    }


# ── 答题记录与错题本 ──

@router.post("/quiz/record")
async def record_quiz_answer(body: QuizRecordRequest, db: AsyncSession = Depends(get_db)):
    """记录用户对题目的作答结果"""
    qid = UUID(body.question_id)
    # 验证题目存在
    result = await db.execute(select(Question).where(Question.id == qid))
    question = result.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    record = QuestionRecord(
        question_id=qid,
        user_answer=body.user_answer,
        is_correct=body.is_correct,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return {
        "id": str(record.id),
        "question_id": str(record.question_id),
        "is_correct": record.is_correct,
        "recorded": True,
    }


@router.get("/quiz/wrong")
async def get_wrong_answers(
    scope_type: str | None = Query(None, description="category | collection | content"),
    scope_id: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """查询错题列表（最近一次答错的题目），支持按范围过滤"""
    from app.models.models import Category, ContentCategory, CollectionItem

    # 确定 content_ids 范围
    content_ids: list[UUID] | None = None
    if scope_type and scope_id:
        sid = UUID(scope_id)
        if scope_type == "category":
            async def _get_child_cat_ids(cat_id: UUID) -> list[UUID]:
                result = await db.execute(select(Category.id).where(Category.parent_id == cat_id))
                children = [r[0] for r in result.all()]
                for child_id in list(children):
                    children.extend(await _get_child_cat_ids(child_id))
                return children
            cat_ids = [sid] + await _get_child_cat_ids(sid)
            result = await db.execute(
                select(ContentCategory.content_id).where(ContentCategory.category_id.in_(cat_ids))
            )
            content_ids = [r[0] for r in result.all()]
        elif scope_type == "collection":
            result = await db.execute(
                select(CollectionItem.content_id).where(CollectionItem.collection_id == sid)
            )
            content_ids = [r[0] for r in result.all()]
        elif scope_type == "content":
            content_ids = [sid]
        if not content_ids:
            return {"questions": [], "total": 0, "page": page, "page_size": page_size}

    # 查询最近一次答错的题目（distinct on + order by answered_at desc）
    # 使用 row_number 窗口函数获取每个 question 的最新记录
    from sqlalchemy import and_, desc, over

    inner_query = (
        select(
            QuestionRecord.question_id,
            QuestionRecord.id.label("record_id"),
            QuestionRecord.is_correct,
            QuestionRecord.user_answer,
            QuestionRecord.answered_at,
            func.row_number().over(
                partition_by=QuestionRecord.question_id,
                order_by=QuestionRecord.answered_at.desc()
            ).label("rn"),
        )
        .join(Question, Question.id == QuestionRecord.question_id)
    )
    if content_ids is not None:
        inner_query = inner_query.where(Question.content_id.in_(content_ids))

    inner_query = inner_query.subquery()

    # 取每个 question 的最新记录，且 is_correct = false
    base_query = (
        select(Question, inner_query.c.user_answer, inner_query.c.answered_at)
        .join(inner_query, Question.id == inner_query.c.question_id)
        .where(inner_query.c.rn == 1, inner_query.c.is_correct == False)
    )

    # 统计总数
    count_query = select(func.count()).select_from(base_query.subquery())
    total_res = await db.execute(count_query)
    total = total_res.scalar() or 0

    # 分页
    offset = (page - 1) * page_size
    result = await db.execute(
        base_query.order_by(inner_query.c.answered_at.desc()).offset(offset).limit(page_size)
    )
    rows = result.all()

    questions = []
    for q, user_answer, answered_at in rows:
        item = _question_to_dict(q)
        item["user_answer"] = user_answer
        item["answered_at"] = answered_at.isoformat() if answered_at else None
        questions.append(item)

    return {
        "questions": questions,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.delete("/quiz/wrong/{question_id}")
async def remove_wrong_mark(
    question_id: str,
    db: AsyncSession = Depends(get_db),
):
    """移除某道题的错题标记（逻辑标记：添加一条 is_correct=True 的记录覆盖）"""
    qid = UUID(question_id)
    # 验证题目存在
    result = await db.execute(select(Question).where(Question.id == qid))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Question not found")

    # 添加一条"已纠正"记录
    record = QuestionRecord(
        question_id=qid,
        user_answer="(已纠正)",
        is_correct=True,
    )
    db.add(record)
    await db.commit()
    return {"question_id": question_id, "removed": True}


@router.get("/quiz/{content_id}")
async def get_quiz_history(
    content_id: str,
    db: AsyncSession = Depends(get_db),
):
    """查询该内容已有的历史题目（通配路由，必须放在所有具体 quiz 路由之后）"""
    cid = UUID(content_id)
    result = await db.execute(
        select(Question)
        .where(Question.content_id == cid)
        .order_by(Question.created_at.desc())
    )
    questions = result.scalars().all()
    return {
        "questions": [_question_to_dict(q) for q in questions],
        "content_id": content_id,
    }


# ── 简答题 AI 判断 ──

@router.post("/quiz/judge")
async def judge_open_answer(body: QuizJudgeRequest, db: AsyncSession = Depends(get_db)):
    """用 AI 判断简答题答案是否正确，返回 is_correct + explanation"""
    provider = await _get_ai_provider(db, "judge")
    if provider is None:
        # Fallback: 模糊匹配
        user = body.user_answer.strip().lower()
        correct = body.correct_answer.strip().lower()
        is_correct = user == correct or correct in user or user in correct
        return {"is_correct": is_correct, "explanation": "（无 AI，使用模糊匹配判断）"}

    try:
        client = AsyncOpenAI(api_key=provider["api_key"] or "no-key", base_url=provider["base_url"])
        response = await client.chat.completions.create(
            model=provider.get("model", "deepseek-chat"),
            messages=[{
                "role": "system",
                "content": "你是一位严格的阅卷老师。判断学生的简答题答案是否正确。只返回JSON：{\"is_correct\": true/false, \"explanation\": \"简短解释\"}。如果学生的答案与标准答案核心意思一致，即使措辞不同也应判定正确。"
            }, {
                "role": "user",
                "content": f"题目：{body.question}\n\n标准答案：{body.correct_answer}\n\n学生答案：{body.user_answer}"
            }],
            response_format={"type": "json_object"},
            max_tokens=200,
        )
        data = json.loads(response.choices[0].message.content or "{}")
        return {"is_correct": data.get("is_correct", False), "explanation": data.get("explanation", "")}
    except Exception as e:
        logger.warning(f"[judge] AI judgement failed: {e}, falling back to fuzzy match")
        user = body.user_answer.strip().lower()
        correct = body.correct_answer.strip().lower()
        is_correct = user == correct or correct in user or user in correct
        return {"is_correct": is_correct, "explanation": f"（AI判断失败，使用模糊匹配）"}


# ── 错题专项出题 ──

@router.post("/wrong_quiz")
async def generate_wrong_quiz(body: WrongQuizRequest, db: AsyncSession = Depends(get_db)):
    """弱知识点定向补强出题：基于错题文本向量检索相似切块，重新生成针对性题目。

    入参：
    - wrong_question_texts: 错题文本列表
    - question_count: 出题数量
    - scope_type / scope_id: 出题范围
    - question_types: 题型列表
    """
    if not body.wrong_question_texts:
        return {"questions": [], "error": "至少需要一条错题文本"}

    requested_brain_id = await _brain_uuid_or_404(db, body.brain_id)
    # 展开出题范围
    content_ids = await _expand_scope(db, [], body.scope_type, body.scope_id, body.brain_id)
    if not content_ids:
        return {"questions": [], "note": "所选范围内没有可用的内容"}

    brain_id = requested_brain_id
    if brain_id is None and content_ids:
        content_res = await db.execute(select(Content).where(Content.id == content_ids[0]))
        content = content_res.scalar_one_or_none()
        if content and content.brain_id:
            brain_id = content.brain_id

    logger.info(f"[wrong_quiz] start: wrong_texts={len(body.wrong_question_texts)}, count={body.question_count}, scope={body.scope_type}")

    # 对每条错题文本做向量化
    from app.services.embedding import embed_texts
    wrong_texts = [t for t in body.wrong_question_texts if t.strip()]
    if not wrong_texts:
        return {"questions": [], "error": "错题文本为空"}

    wrong_vecs = await embed_texts(db, wrong_texts, brain_id=brain_id)
    if not wrong_vecs:
        return {"questions": [], "error": "无法为错题文本生成嵌入向量，请检查 embedding 配置"}

    # 每条错题向量检索相似切块（合并去重）
    all_search_results: list[dict] = []
    for wv in wrong_vecs:
        top_k = max(5, body.question_count)
        results = await _topic_search_chunks(db, content_ids, wv, top_k)
        all_search_results.extend(results)
        if not results:
            logger.info("[wrong_quiz] one wrong text vector returned no results")

    # 合并去重
    seen_ids = set()
    merged_chunks: list[dict] = []
    for r in all_search_results:
        if r["id"] not in seen_ids:
            seen_ids.add(r["id"])
            merged_chunks.append(r)

    if not merged_chunks:
        # 降级：随机抽取
        logger.info("[wrong_quiz] vector search returned no results, falling back to random pick")
        source_count = min(body.question_count, MAX_SOURCE_CHUNKS)
        picked = await _random_pick_chunks(db, content_ids, source_count)
        source_chunks = [
            {
                "id": str(c.id), "content_id": str(c.content_id),
                "chunk_text": c.chunk_text, "chunk_index": c.chunk_index,
                "page_number": c.page_number, "embedding": c.embedding,
                "difficulty": c.difficulty,
            }
            for c in picked
        ]
    else:
        source_count = min(body.question_count, MAX_SOURCE_CHUNKS)
        # 按相似度排序取前 source_count 个
        merged_chunks.sort(key=lambda x: x.get("score", 0), reverse=True)
        source_chunks = merged_chunks[:source_count]

    if not source_chunks:
        return {"questions": [], "note": "该范围暂无匹配的文本分块可供出题"}

    # 复用干扰项检索（含 0.75 阈值）
    distractor_chunks: list[dict] = []
    for source in source_chunks:
        if source.get("embedding") is not None:
            similars = await _find_similar_chunks(
                db, content_ids, source["embedding"], UUID(source["id"]),
                top_k=3, min_similar=SIM_THRESHOLD,
            )
            for s in similars:
                if s["id"] not in {d["id"] for d in distractor_chunks}:
                    distractor_chunks.append(s)

    # Token 控制
    total_chunks = len(source_chunks) + len(distractor_chunks)
    if total_chunks > MAX_TOTAL_CHUNKS:
        max_dist_per_source = max(0, (MAX_TOTAL_CHUNKS - len(source_chunks)) // len(source_chunks))
        trimmed = []
        for source in source_chunks:
            src_id = str(source.get("id", ""))
            src_distractors = [d for d in distractor_chunks]
            trimmed.extend(src_distractors[:max_dist_per_source])
        seen = set()
        distractor_chunks = []
        for d in trimmed:
            if d["id"] not in seen:
                seen.add(d["id"])
                distractor_chunks.append(d)

    logger.info(f"[wrong_quiz] source={len(source_chunks)}, distractors={len(distractor_chunks)}, total={len(source_chunks)+len(distractor_chunks)}")

    # 组装 Prompt
    question_types = body.question_types or ["single", "multiple", "truefalse", "open"]
    type_desc = _build_question_types_desc(question_types)
    mode_desc = "错题专项补强出题"

    sources_text = []
    for chunk in source_chunks:
        diff = chunk.get("difficulty", "?")
        page_info = f"第{chunk['page_number']}页｜" if chunk.get('page_number') else ""
        content_id_short = str(chunk.get("content_id", "?"))[:8]
        sources_text.append(
            f"[chunk_id:{chunk['id'][:8]}｜{page_info}diff:{diff}｜content_id:{content_id_short}]\n{chunk['chunk_text']}"
        )
    sources_combined = "\n\n---\n\n".join(sources_text)

    distractors_text = []
    if distractor_chunks:
        for i, dc in enumerate(distractor_chunks):
            page_info = f"第{dc['page_number']}页｜" if dc.get("page_number") else ""
            distractors_text.append(
                f"[干扰素材 {i+1} - chunk_id:{dc['id'][:8]}｜{page_info}content_id:{str(dc.get('content_id', '?'))[:8]}]\n{dc['chunk_text']}"
            )
    distractors_combined = "\n\n".join(distractors_text) if distractors_text else "（无额外干扰素材，可从原文自身不同角度出题）"

    template_vars = {
        "sources": sources_combined,
        "distractors": distractors_combined,
        "question_count": str(body.question_count),
        "question_types": type_desc,
        "type_desc": type_desc,
        "mode_desc": mode_desc,
        "topic": "错题补强",
    }

    # 获取 provider
    provider = await _get_ai_provider(db, "quiz", brain_id)
    if provider is None:
        return {"questions": [], "error": "未配置 quiz AI 提供商"}

    # 加载模板
    template = await _get_or_create_quiz_template(db, brain_id)
    if template:
        system_prompt = _render_template(template.system_prompt, template_vars)
        user_prompt = _render_template(template.user_prompt_template, template_vars)
    else:
        system_prompt = QUIZ_SYSTEM_PROMPT.format(type_desc=type_desc)
        user_prompt = _build_quiz_prompt(
            source_chunks, distractor_chunks,
            body.question_count, question_types, "topic", "错题补强",
        )

    # 调用 LLM + 重试
    data = await _call_llm_with_retry(provider, system_prompt, user_prompt, max_retries=1)
    if data is None:
        return {"questions": [], "error": "AI 返回格式异常，已重试失败"}

    # 解析题目
    questions = None
    if isinstance(data, dict):
        for key in ("questions", "考试题目", "题目", "quiz"):
            if key in data:
                questions = data[key]
                break
        if questions is None:
            for v in data.values():
                if isinstance(v, list):
                    questions = v
                    break
    if questions is None:
        questions = data if isinstance(data, list) else []

    parsed_questions = []
    for q in questions:
        parsed_questions.append({
            "type": q.get("type", "open"),
            "question": q.get("question", ""),
            "options": q.get("options"),
            "answer": q.get("answer", ""),
            "explanation": q.get("explanation"),
            "sources": q.get("sources", []),
            "difficulty": q.get("difficulty", "medium"),
        })

    # 题目落库（含查重）
    if parsed_questions:
        default_content_id = content_ids[0]
        await _save_questions(db, default_content_id, source_chunks, parsed_questions)

    logger.info(f"[wrong_quiz] done, returning {len(parsed_questions)} questions")
    return {
        "questions": parsed_questions,
        "model": provider["model"],
        "mode": "wrong_quiz",
    }


# ── RAG 知识库问答 ──

@router.post("/ask")
async def rag_ask(body: AskRequest, db: AsyncSession = Depends(get_db)):
    """RAG 知识库问答：向量检索 + LLM 生成答案

    1. 将问题向量化
    2. pgvector 检索 Top-K 相关 chunk
    3. 加载 qa Prompt 模板
    4. 调用 LLM 生成答案
    5. 返回答案 + 引用来源
    """
    question = body.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="问题不能为空")

    requested_brain_id = await _brain_uuid_or_404(db, body.brain_id)
    # 确定检索范围
    content_ids = await _expand_scope(db, [], body.scope_type, body.scope_id, body.brain_id)
    if not content_ids and body.scope_id:
        return {"answer": "所选范围内没有可用的内容", "sources": []}
    if not content_ids and not body.scope_id:
        # 全部范围：获取所有未删除的 content_id
        all_query = select(Content.id).where(Content.is_deleted == False)
        if requested_brain_id is not None:
            all_query = all_query.where(Content.brain_id == requested_brain_id)
        result = await db.execute(all_query)
        content_ids = [r[0] for r in result.all()]
    if not content_ids:
        return {"answer": "所选范围内没有可用的内容", "sources": []}

    logger.info(f"[qa] question='{question[:60]}...', top_k={body.top_k}, scope={body.scope_type}, content_count={len(content_ids)}")

    # 1. 问题向量化
    from app.services.embedding import embed_texts
    try:
        vecs = await embed_texts(db, [question], brain_id=body.brain_id)
    except Exception as e:
        logger.warning(f"[qa] embedding failed: {e}")
        return {"answer": "无法生成问题嵌入向量，请检查 embedding 配置", "sources": []}

    query_vec = vecs[0] if vecs else None
    if query_vec is None:
        return {"answer": "嵌入向量生成失败，请检查 AI 提供商配置", "sources": []}

    # 2. pgvector 检索
    vec_str = f"[{','.join(str(v) for v in query_vec)}]"
    if content_ids:
        filter_clause = "cc.content_id = ANY(:content_ids) AND cc.chunk_type = 'text' AND cc.chunk_text IS NOT NULL AND cc.embedding IS NOT NULL AND c.is_deleted = false"
        stmt = text(f"""
            SELECT cc.id, cc.content_id, cc.chunk_text, cc.chunk_index, cc.page_number,
                   c.title AS content_title, c.content_type,
                   1 - (cc.embedding <=> CAST(:query_vec AS vector)) AS score
            FROM content_chunks cc
            JOIN contents c ON cc.content_id = c.id
            WHERE {filter_clause}
            ORDER BY cc.embedding <=> CAST(:query_vec AS vector)
            LIMIT :top_k
        """)
    else:
        stmt = text("""
            SELECT cc.id, cc.content_id, cc.chunk_text, cc.chunk_index, cc.page_number,
                   c.title AS content_title, c.content_type,
                   1 - (cc.embedding <=> CAST(:query_vec AS vector)) AS score
            FROM content_chunks cc
            JOIN contents c ON cc.content_id = c.id
            WHERE cc.chunk_type = 'text' AND cc.chunk_text IS NOT NULL
              AND cc.embedding IS NOT NULL AND c.is_deleted = false
            ORDER BY cc.embedding <=> CAST(:query_vec AS vector)
            LIMIT :top_k
        """)

    params = {"query_vec": vec_str, "top_k": body.top_k}
    if content_ids:
        params["content_ids"] = [str(cid) for cid in content_ids]

    try:
        result = await db.execute(stmt, params)
        rows = result.all()
    except Exception as e:
        logger.error(f"[qa] vector search failed: {e}")
        return {"answer": "检索失败，请稍后重试", "sources": []}

    if not rows:
        return {"answer": "知识库中暂无相关信息，建议补充相关资料后重试", "sources": []}

    # 3. 构建来源信息
    sources = []
    context_parts = []
    for i, row in enumerate(rows):
        chunk_id = str(row.id)
        content_title = row.content_title or "无题内容"
        page_info = f"，第{row.page_number}页" if row.page_number else ""
        chunk_text = row.chunk_text or ""

        sources.append({
            "chunk_id": chunk_id,
            "content_id": str(row.content_id),
            "content_title": content_title,
            "content_type": row.content_type or "",
            "page_number": row.page_number,
            "chunk_text": chunk_text[:300],  # 截断作为预览
        })
        context_parts.append(
            f"[{i + 1}] 《{content_title}》{page_info}\n{chunk_text}"
        )

    context_combined = "\n\n---\n\n".join(context_parts)
    logger.info(f"[qa] retrieved {len(rows)} chunks, context length={len(context_combined)}")

    # 4. 获取 AI provider
    provider = await _get_ai_provider(db, "qa", body.brain_id)
    if provider is None:
        provider = await _get_ai_provider(db, "summarize", body.brain_id)  # fallback to summarize provider
    if provider is None:
        return {"answer": "未配置 AI 提供商，请在设置中配置 LLM 服务", "sources": sources}

    # 5. 加载 Prompt 模板
    brain_id = requested_brain_id
    if content_ids:
        content_res = await db.execute(select(Content).where(Content.id == content_ids[0]))
        content = content_res.scalar_one_or_none()
        if brain_id is None and content and content.brain_id:
            brain_id = content.brain_id

    template = await _get_or_create_qa_template(db, brain_id)
    if template:
        system_prompt = _render_template(template.system_prompt, {
            "top_k": str(body.top_k),
            "context": context_combined,
            "question": question,
        })
        user_prompt = _render_template(template.user_prompt_template, {
            "top_k": str(body.top_k),
            "context": context_combined,
            "question": question,
        })
        logger.info(f"[qa] using template: {template.name}")
    else:
        # 回退硬编码 Prompt
        from app.api.brains import DEFAULT_PROMPT_TEMPLATES
        qa_default = DEFAULT_PROMPT_TEMPLATES.get("qa", {})
        system_prompt = qa_default.get("system_prompt", "你是一个知识库助手，基于检索内容回答用户问题。")
        user_prompt = f"""=====检索到的相关内容（共 {body.top_k} 条）=====\n\n{context_combined}\n\n=====用户问题=====\n{question}\n\n请基于以上检索内容回答用户问题。"""

    # 6. 调用 LLM
    try:
        client = AsyncOpenAI(api_key=provider["api_key"] or "no-key", base_url=provider["base_url"])
        response = await client.chat.completions.create(
            model=provider.get("model", "deepseek-chat"),
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=1000,
            temperature=0.3,
        )
        answer = response.choices[0].message.content or "AI 未返回有效答案"
    except Exception as e:
        logger.error(f"[qa] LLM call failed: {e}")
        return {"answer": f"AI 服务调用失败：{str(e)[:200]}", "sources": sources}

    logger.info(f"[qa] answer generated, length={len(answer)}, sources={len(sources)}")
    return {
        "answer": answer,
        "sources": sources,
        "model": provider.get("model", "unknown"),
    }
