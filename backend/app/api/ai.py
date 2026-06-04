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
from app.models.models import Content, ContentRelation, ContentChunk, FunctionBindingConfig, ProviderConfig, Question, QuestionRecord, PromptTemplate
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


class QuizRecordRequest(BaseModel):
    question_id: str
    user_answer: str
    is_correct: bool


class QuizJudgeRequest(BaseModel):
    question: str
    correct_answer: str
    user_answer: str


# ── 获取 AI provider ──

async def _get_ai_provider(db: AsyncSession, fn: str = "summarize") -> dict | None:
    """获取指定功能绑定的 AI 提供商。
    优先级：FunctionBindingConfig（设置页面显式绑定）> Provider.default_models > 无
    """
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

    provider = await _get_ai_provider(db, "summarize")
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
            return {"related": [], "content_id": content_id, "note": "No embedding available"}

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

    if not rows:
        return {"related": [], "content_id": content_id}

    # Step 2: 查询候选内容与当前内容的关系
    candidate_ids = [r[0] if isinstance(r, (tuple, list)) else r.id for r in rows]
    cid = UUID(content_id)

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
    content_results: dict[str, dict] = {}
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

# ── Prompt 模板 ──

QUIZ_SYSTEM_PROMPT = """你是一位专业的出题老师。你的任务是基于给定的原文知识点和干扰项素材，生成高质量的题目。

规则：
1. 只能使用"原文知识点"中的内容出题，不得编造或使用课外知识
2. 每道题必须标注来源 chunk_id 和 page_number（如果能确定）
3. 干扰项必须来自"干扰项素材"中的相似知识点，不得自由编造
4. 只能生成以下题型：{type_desc}，不要生成未列出的题型
5. 对错比例要均衡，不要全对或全错

输出格式为 JSON 数组，每道题格式如下：
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
    return "[" + ",".join(map(str, vec)) + "]"


# ── Scope 展开 ──

async def _expand_scope(
    db: AsyncSession,
    content_ids: list[str],
    scope_type: str,
    scope_id: str | None,
) -> list[UUID]:
    """根据 scope_type 和 scope_id 展开出题范围为 content_id 列表"""
    if scope_type == "manual" or not scope_id:
        if content_ids:
            return [UUID(cid) for cid in content_ids if cid]
        # 没传 content_ids 也没传 scope_id → 返回所有内容（"全部"范围）
        result = await db.execute(select(Content.id).where(Content.is_deleted == False))
        return [r[0] for r in result.all()]

    sid = UUID(scope_id)
    expanded: list[UUID] = []

    if scope_type == "category":
        # 递归查询分类及子分类下的所有 content
        async def _get_child_category_ids(cat_id: UUID) -> list[UUID]:
            result = await db.execute(
                select(Category.id).where(Category.parent_id == cat_id)
            )
            children = [r[0] for r in result.all()]
            for child_id in list(children):
                children.extend(await _get_child_category_ids(child_id))
            return children

        from app.models.models import Category
        cat_ids = [sid] + await _get_child_category_ids(sid)
        result = await db.execute(
            select(ContentCategory.content_id)
            .where(ContentCategory.category_id.in_(cat_ids))
            .join(Content, Content.id == ContentCategory.content_id)
            .where(Content.is_deleted == False)
        )
        expanded = [r[0] for r in result.all()]

    elif scope_type == "collection":
        from app.models.models import CollectionItem
        result = await db.execute(
            select(CollectionItem.content_id)
            .where(CollectionItem.collection_id == sid)
            .join(Content, Content.id == CollectionItem.content_id)
            .where(Content.is_deleted == False)
        )
        expanded = [r[0] for r in result.all()]

    elif scope_type == "content":
        # 单个内容直接返回其 content_id
        expanded = [sid]

    logger.info(f"[quiz] scope expansion: type={scope_type}, scope_id={scope_id}, expanded to {len(expanded)} content_ids")
    return expanded


# ── RAG 检索辅助函数 ──

async def _get_text_chunks_for_contents(
    db: AsyncSession, content_ids: list[UUID]
) -> list:
    """获取多个内容的全部有嵌入的 text chunk"""
    if not content_ids:
        return []
    result = await db.execute(
        select(ContentChunk).where(
            ContentChunk.content_id.in_(content_ids),
            ContentChunk.chunk_type == "text",
            ContentChunk.chunk_text.is_not(None),
            ContentChunk.embedding.is_not(None),
        ).order_by(ContentChunk.chunk_index)
    )
    return list(result.scalars().all())


async def _get_text_chunks_for_content(
    db: AsyncSession, content_id: UUID
) -> list:
    """获取某内容的全部有嵌入的 text chunk（单内容兼容）"""
    return await _get_text_chunks_for_contents(db, [content_id])


async def _random_pick_chunks(
    db: AsyncSession, content_ids: list[UUID], count: int
) -> list:
    """随机抽取 N 个有嵌入的 text chunk（跨内容）"""
    chunks = await _get_text_chunks_for_contents(db, content_ids)
    if len(chunks) <= count:
        return chunks
    return random.sample(chunks, count)


async def _topic_search_chunks(
    db: AsyncSession, content_ids: list[UUID], topic_vec: list[float], top_k: int
) -> list:
    """向量检索与 topic 最相关的 text chunk（跨内容）"""
    vec_str = _vec_to_str(topic_vec)
    sql = text("""
        SELECT cc.id, cc.content_id, cc.chunk_text, cc.chunk_index, cc.page_number,
               cc.embedding,
               1 - (cc.embedding <=> CAST(:query_vec AS vector)) AS score
        FROM content_chunks cc
        WHERE cc.content_id = ANY(:content_ids)
          AND cc.chunk_type = 'text'
          AND cc.chunk_text IS NOT NULL
          AND cc.embedding IS NOT NULL
        ORDER BY cc.embedding <=> CAST(:query_vec AS vector)
        LIMIT :top_k
    """)
    result = await db.execute(sql, {
        "query_vec": vec_str,
        "content_ids": [str(cid) for cid in content_ids],
        "top_k": top_k,
    })
    rows = result.all()
    return [
        {
            "id": str(r.id),
            "content_id": str(r.content_id),
            "chunk_text": r.chunk_text,
            "chunk_index": r.chunk_index,
            "page_number": r.page_number,
            "embedding": r.embedding,
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
) -> list[dict]:
    """为指定 chunk 找相似 chunk 作为干扰项素材（跨内容）"""
    vec_str = _vec_to_str(chunk_embedding)
    sql = text("""
        SELECT cc.id, cc.content_id, cc.chunk_text, cc.chunk_index, cc.page_number,
               1 - (cc.embedding <=> CAST(:query_vec AS vector)) AS score
        FROM content_chunks cc
        WHERE cc.content_id = ANY(:content_ids)
          AND cc.chunk_type = 'text'
          AND cc.chunk_text IS NOT NULL
          AND cc.embedding IS NOT NULL
          AND cc.id != :exclude_id
        ORDER BY cc.embedding <=> CAST(:query_vec AS vector)
        LIMIT :top_k
    """)
    result = await db.execute(sql, {
        "query_vec": vec_str,
        "content_ids": [str(cid) for cid in content_ids],
        "exclude_id": exclude_chunk_id,
        "top_k": top_k,
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

    # 知识点原文
    sources_text = []
    for i, chunk in enumerate(source_chunks):
        page_info = f"，第{chunk['page_number']}页" if chunk.get("page_number") else ""
        sources_text.append(
            f"[chunk_id: {chunk['id']}{page_info}]\n{chunk['chunk_text']}"
        )
    sources_combined = "\n\n---\n\n".join(sources_text)

    # 干扰项素材
    distractors_text = []
    if distractor_chunks:
        for i, dc in enumerate(distractor_chunks):
            page_info = f"，第{dc['page_number']}页" if dc.get("page_number") else ""
            distractors_text.append(
                f"[干扰素材 {i+1} - chunk_id: {dc['id']}{page_info}]\n{dc['chunk_text']}"
            )
    distractors_combined = "\n\n".join(distractors_text) if distractors_text else "（无额外干扰素材，可从原文自身不同角度出题）"

    mode_desc = f"按主题「{topic}」出题" if mode == "topic" and topic else "随机出题"

    return f"""请基于以下原文知识点，生成 {question_count} 道题目。

出题模式：{mode_desc}
题型要求：{type_desc}
请均匀分配各题型。

── 原文知识点 ──
{sources_combined}

── 干扰项素材（选择题/判断题的干扰项和错误陈述 MUST 从此素材中提取）──
{distractors_combined}

请严格遵循系统指令中的规则，输出 JSON 数组格式的题目。"""


@router.post("/quiz")
async def generate_quiz(body: QuizRequest, db: AsyncSession = Depends(get_db)):
    """AI 题库生成（RAG 检索出题）

    支持两种模式 + 三种范围：
    - mode: random / topic
    - scope: manual(单书/多书) / category(按分类) / collection(按合集)

    干扰项从向量召回的相似 chunk 中提取，而非 AI 编造。
    """
    # 展开出题范围（scope_type/mode 会替换 content_ids）
    content_ids = await _expand_scope(db, body.content_ids, body.scope_type, body.scope_id)
    if not content_ids:
        # 区分：scope 展开后为空 vs 根本没传任何范围
        if not body.content_ids and (body.scope_type == "manual" or not body.scope_id):
            raise HTTPException(status_code=400, detail="No content_ids provided")
        return {"questions": [], "note": "所选范围内没有可用的内容"}

    logger.info(f"[quiz] start quiz generation: content_ids={[str(c) for c in content_ids[:5]]}..., mode={body.mode}, topic={body.topic}, question_count={body.question_count}, scope={body.scope_type}")

    # 检查是否有 text chunk
    text_chunks = await _get_text_chunks_for_contents(db, content_ids)
    logger.info(f"[quiz] text_chunks count={len(text_chunks)}")
    if not text_chunks:
        return {
            "questions": [],
            "note": "所选范围内暂无文本分块可供出题，图片 PDF 需要 OCR 支持",
        }

    # 根据模式检索出题 chunk
    source_count = min(body.question_count, 10)
    logger.info(f"[quiz] retrieving source chunks, mode={body.mode}, source_count={source_count}")
    if body.mode == "topic" and body.topic:
        from app.services.embedding import embed_texts
        topic_vecs = await embed_texts(db, [body.topic])
        topic_vec = topic_vecs[0] if topic_vecs else None
        if topic_vec is None:
            return {"questions": [], "error": "无法为关键词生成嵌入向量，请检查 embedding 配置"}

        search_results = await _topic_search_chunks(db, content_ids, topic_vec, max(source_count, 10))
        source_chunks = search_results[:source_count]
    else:
        picked = await _random_pick_chunks(db, content_ids, source_count)
        source_chunks = [
            {
                "id": str(c.id),
                "content_id": str(c.content_id),
                "chunk_text": c.chunk_text,
                "chunk_index": c.chunk_index,
                "page_number": c.page_number,
                "embedding": c.embedding,
            }
            for c in picked
        ]

    if not source_chunks:
        logger.info("[quiz] no source_chunks found")
        return {"questions": [], "note": "暂无符合条件的文本分块可供出题"}

    # 对每个出题 chunk 找相似 chunk 作为干扰项素材
    logger.info(f"[quiz] source_chunks count={len(source_chunks)}, fetching distractors...")
    distractor_chunks: list[dict] = []
    for source in source_chunks:
        if source.get("embedding") is not None:
            similars = await _find_similar_chunks(
                db, content_ids, source["embedding"], UUID(source["id"]), top_k=3
            )
            for s in similars:
                if s["id"] not in {d["id"] for d in distractor_chunks}:
                    distractor_chunks.append(s)
    logger.info(f"[quiz] distractor_chunks count={len(distractor_chunks)}")

    # 组装 Prompt 并调用 AI
    question_types = body.question_types or ["single", "multiple", "truefalse", "open"]

    # 构建模板变量
    type_desc = _build_question_types_desc(question_types)
    mode_desc = f"按主题「{body.topic}」出题" if body.mode == "topic" and body.topic else "随机出题"

    # 知识点原文
    sources_text = []
    for i, chunk in enumerate(source_chunks):
        page_info = f"，第{chunk['page_number']}页" if chunk.get("page_number") else ""
        sources_text.append(
            f"[chunk_id: {chunk['id']}{page_info}]\n{chunk['chunk_text']}"
        )
    sources_combined = "\n\n---\n\n".join(sources_text)

    # 干扰项素材
    distractors_text = []
    if distractor_chunks:
        for i, dc in enumerate(distractor_chunks):
            page_info = f"，第{dc['page_number']}页" if dc.get("page_number") else ""
            distractors_text.append(
                f"[干扰素材 {i+1} - chunk_id: {dc['id']}{page_info}]\n{dc['chunk_text']}"
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

    # 尝试加载模板；失败则使用硬编码 Prompt（向后兼容）
    provider = await _get_ai_provider(db, "quiz")
    logger.info(f"[quiz] AI provider={'found (' + provider['model'] + ')' if provider else 'not found (fallback)'}")

    # 确定 content 的 brain_id（从第一个 content 获取）
    brain_id = None
    first_cid = content_ids[0]
    content_res = await db.execute(select(Content).where(Content.id == first_cid))
    content = content_res.scalar_one_or_none()
    if content and content.brain_id:
        brain_id = content.brain_id

    template = await _get_or_create_quiz_template(db, brain_id)
    if template:
        system_prompt = _render_template(template.system_prompt, template_vars)
        user_prompt = _render_template(template.user_prompt_template, template_vars)
        logger.info(f"[quiz] using template: {template.name}, user_prompt length={len(user_prompt)}")
    else:
        # 回退到硬编码 Prompt
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
                    "question": f"请基于以下知识点回答问题",
                    "answer": source_chunks[0]["chunk_text"][:200] if source_chunks else "",
                    "sources": [
                        {"chunk_id": source_chunks[0]["id"], "page_number": source_chunks[0].get("page_number")}
                    ] if source_chunks else [],
                }
            ],
            "note": "fallback mode (no AI provider configured for quiz)",
        }

    try:
        client = AsyncOpenAI(
            api_key=provider["api_key"] or "no-key",
            base_url=provider["base_url"],
        )
        logger.info("[quiz] calling AI API...")
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
        # 兼容 AI 可能返回的中文键名
        questions = None
        if isinstance(data, dict):
            for key in ("questions", "考试题目", "题目", "quiz"):
                if key in data:
                    questions = data[key]
                    break
            if questions is None:
                # 如果 dict 里没有已知键，尝试取第一个数组值
                for v in data.values():
                    if isinstance(v, list):
                        questions = v
                        break
        if questions is None:
            questions = data if isinstance(data, list) else []
        logger.info(f"[quiz] parsed {len(questions)} questions from AI response, data type={type(data)}, keys={list(data.keys()) if isinstance(data, dict) else 'list'}")

        # 2.7: 解析 AI 返回，提取 sources
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

        # 2.8: 题目落库
        if parsed_questions:
            default_content_id = content_ids[0]
            logger.info(f"[quiz] saving {len(parsed_questions)} questions to DB...")
            await _save_questions(db, default_content_id, source_chunks, parsed_questions)
            logger.info("[quiz] questions saved")

        logger.info(f"[quiz] done, returning {len(parsed_questions)} questions")
        return {
            "questions": parsed_questions,
            "model": provider["model"],
            "mode": body.mode,
        }
    except Exception as e:
        logger.exception("RAG quiz generation failed")
        return {"questions": [], "error": str(e)}


async def _save_questions(
    db: AsyncSession, default_content_id: UUID, source_chunks: list[dict], questions: list[dict]
):
    """将生成的题目写入 questions 表"""
    # 构建 chunk_id → content_id 映射（用于跨内容出题场景）
    chunk_content_map: dict[str, UUID] = {}
    for sc in source_chunks:
        if sc.get("id"):
            chunk_content_map[sc["id"]] = UUID(sc.get("content_id", str(default_content_id)))

    for q in questions:
        source_chunk_id = None
        page_number = None
        content_id = default_content_id
        if q.get("sources"):
            first_source = q["sources"][0] if isinstance(q["sources"], list) else q["sources"]
            if isinstance(first_source, dict) and first_source.get("chunk_id"):
                try:
                    source_chunk_id = UUID(first_source["chunk_id"])
                    # 使用 source chunk 对应的 content_id
                    if str(source_chunk_id) in chunk_content_map:
                        content_id = chunk_content_map[str(source_chunk_id)]
                except (ValueError, TypeError):
                    pass
                page_number = first_source.get("page_number")

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
        )
        db.add(question)
    await db.commit()


# 2.9: 查询历史题目
def _question_to_dict(q: Question) -> dict:
    return {
        "id": str(q.id),
        "type": q.q_type,
        "question": q.question,
        "options": q.options,
        "answer": q.answer,
        "explanation": q.explanation,
        "sources": [
            {
                "chunk_id": str(q.source_chunk_id) if q.source_chunk_id else None,
                "page_number": q.page_number,
            }
        ],
        "difficulty": q.difficulty,
        "content_id": str(q.content_id) if q.content_id else None,
        "created_at": q.created_at.isoformat() if q.created_at else None,
    }


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
        # 自动更新为最新的默认模板
        if (template.system_prompt != quiz_default["system_prompt"] or
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


@router.get("/quiz-template")
async def get_quiz_template(db: AsyncSession = Depends(get_db)):
    """获取当前工作区的默认 quiz 模板"""
    result = await db.execute(
        select(PromptTemplate).where(
            PromptTemplate.template_type == "quiz",
            PromptTemplate.is_default == True,
        ).order_by(PromptTemplate.brain_id.nulls_first())
    )
    template_row = result.first()
    if template_row is None:
        from app.api.brains import DEFAULT_PROMPT_TEMPLATES
        quiz_default = DEFAULT_PROMPT_TEMPLATES.get("quiz", {})
        return {
            "template": {
                "system_prompt": quiz_default.get("system_prompt", ""),
                "user_prompt_template": quiz_default.get("user_prompt_template", ""),
            },
            "note": "using system default (no template in DB)",
        }
    t = template_row[0]
    return {
        "template": {
            "id": str(t.id),
            "brain_id": str(t.brain_id) if t.brain_id else None,
            "name": t.name,
            "description": t.description,
            "system_prompt": t.system_prompt,
            "user_prompt_template": t.user_prompt_template,
        }
    }


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
    result = await db.execute(
        select(PromptTemplate).where(
            PromptTemplate.template_type == "quiz",
            PromptTemplate.is_default == True,
        )
    )
    template = result.scalar_one_or_none()

    if template is None:
        template = PromptTemplate(
            brain_id=None,
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
        "template": {
            "id": str(template.id),
            "system_prompt": template.system_prompt,
            "user_prompt_template": template.user_prompt_template,
        },
        "message": "Template saved",
    }


@router.post("/quiz-template/reset")
async def reset_quiz_template(db: AsyncSession = Depends(get_db)):
    """恢复为系统默认模板"""
    from app.api.brains import DEFAULT_PROMPT_TEMPLATES
    quiz_default = DEFAULT_PROMPT_TEMPLATES.get("quiz", {})

    result = await db.execute(
        select(PromptTemplate).where(
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
            brain_id=None,
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
        "template": {
            "id": str(template.id),
            "system_prompt": template.system_prompt,
            "user_prompt_template": template.user_prompt_template,
        },
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