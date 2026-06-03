"""AI 辅助 API：摘要、推荐、题库"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import Content, ContentRelation, ContentChunk, FunctionBindingConfig, ProviderConfig
from app.core.crypto import crypto_service

router = APIRouter(prefix="/api/ai", tags=["ai"])


# ── Schemas ──

class SummarizeRequest(BaseModel):
    content_id: str
    max_length: int = 500


class QuizRequest(BaseModel):
    content_ids: list[str]
    question_count: int = 5


# ── 获取 AI provider ──

async def _get_ai_provider(db: AsyncSession, fn: str = "summarize") -> dict | None:
    """获取指定功能绑定的 AI 提供商"""
    result = await db.execute(
        select(ProviderConfig).where(ProviderConfig.is_active == True)
    )
    for p in result.scalars().all():
        models = p.default_models or {}
        if fn in models:
            api_key = crypto_service.decrypt(p.api_key_encrypted) if p.api_key_encrypted else None
            return {
                "provider_id": str(p.id),
                "model": models[fn],
                "api_key": api_key,
                "base_url": p.base_url,
            }

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
            api_key = crypto_service.decrypt(p.api_key_encrypted) if p.api_key_encrypted else None
            return {
                "provider_id": str(p.id),
                "model": binding.model,
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

@router.post("/quiz")
async def generate_quiz(body: QuizRequest, db: AsyncSession = Depends(get_db)):
    """AI 题库生成"""
    if not body.content_ids:
        raise HTTPException(status_code=400, detail="No content_ids provided")

    texts = []
    for cid in body.content_ids:
        res = await db.execute(select(Content).where(Content.id == cid))
        c = res.scalar_one_or_none()
        if c and c.text_content:
            texts.append(f"[{c.title}]\n{c.text_content[:2000]}")

    combined = "\n\n".join(texts)
    if not combined:
        return {"questions": [], "note": "所选内容暂无文本"}

    provider = await _get_ai_provider(db, "quiz")
    if provider is None:
        return {
            "questions": [
                {"type": "open", "question": f"总结以下内容的核心要点", "answer": combined[:200]},
            ],
            "note": "fallback mode (no AI provider configured)",
        }

    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=provider["api_key"] or "", base_url=provider["base_url"])
        prompt = f"""基于以下内容生成{body.question_count}道题目，包含多种题型。
输出 JSON 数组格式：{{"type": "single|multiple|open", "question": "...", "options": ["..."]（仅选择题）, "answer": "..."}}

内容：
{combined[:6000]}"""

        response = await client.chat.completions.create(
            model=provider["model"],
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            max_tokens=2000,
        )
        import json
        data = json.loads(response.choices[0].message.content or "{}")
        return {"questions": data.get("questions", []), "model": provider["model"]}
    except Exception as e:
        return {"questions": [], "error": str(e)}