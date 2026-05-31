"""语义搜索 Service

向量相似度 + 关键词 BM25 混合检索，RRF 融合排序。
"""

import json
from datetime import datetime, timezone
from typing import Any

from openai import AsyncOpenAI
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.models import Content, SearchLog
from app.core.crypto import crypto_service

settings = get_settings()

# ── 参数 ──
RRF_K = 60  # RRF 常量
VECTOR_WEIGHT = 0.7
KEYWORD_WEIGHT = 0.3
TOP_K = 20


# ── 嵌入（复用 OpenAI 兼容接口）──

async def _embed_query(query: str, db: AsyncSession) -> list[float]:
    """将查询文本转为向量，使用已配置的 embedding provider"""
    from app.services.embedding import _get_embedding_binding, _call_openai_embedding

    binding = await _get_embedding_binding(db)
    if binding is None:
        raise RuntimeError("未配置 embedding 提供商，无法执行语义搜索")

    result = await db.execute(
        select(Content).where(Content.id == "00000000-0-0-0-000000000000")
    )
    # 上面是占位，真正拿 provider
    from app.models.models import ProviderConfig
    result = await db.execute(
        select(ProviderConfig).where(ProviderConfig.id == binding["provider_id"])
    )
    provider = result.scalar_one_or_none()
    if provider is None:
        raise RuntimeError("embedding provider 不存在")

    api_key = crypto_service.decrypt(provider.api_key_encrypted) if provider.api_key_encrypted else None
    base_url = provider.base_url
    model = binding["model"]

    vecs = await _call_openai_embedding(
        api_key or "", base_url, model, [query]
    )
    return vecs[0]


# ── 向量检索 ──

def _build_vector_sql(content_type_filter: str | None, has_embedding_only: bool = True) -> str:
    base = """
        SELECT id, title, content_type, file_size, created_at,
               1 - (text_embedding <=> :query_vec) AS score
        FROM contents
        WHERE is_deleted = false
          AND text_embedding IS NOT NULL
    """
    if content_type_filter:
        base += " AND content_type = :ctype"
    base += " ORDER BY text_embedding <=> :query_vec LIMIT :top_k"
    return base


async def _vector_search(
    db: AsyncSession,
    query_vec: list[float],
    top_k: int = TOP_K,
    content_type: str | None = None,
) -> list[dict]:
    """pgvector 余弦相似度搜索"""
    vec_sql = _build_vector_sql(content_type)
    params = {
        "query_vec": str(query_vec),
        "top_k": top_k,
    }
    if content_type:
        params["ctype"] = content_type

    # 用 raw SQL（asyncpg 不直接支持 <=> 操作符的 ORM 写法）
    conn = await db.bind.raw_connection()
    try:
        result = await conn.execute(
            text(vec_sql),
            params,
        )
        rows = result.fetchall()
        return [
            {"id": str(r.id), "title": r.title, "score": float(r.score), "rank": i + 1}
            for i, r in enumerate(rows)
        ]
    finally:
        await conn.close()


# ── 关键词检索（BM25 近似）──

async def _keyword_search(
    db: AsyncSession,
    query: str,
    top_k: int = TOP_K,
    content_type: str | None = None,
) -> list[dict]:
    """ILIKE 模糊匹配 text_content，用 length 差近似 BM25"""
    from sqlalchemy import or_

    stmt = (
        select(Content.id, Content.title, Content.content_type, Content.file_size, Content.created_at, Content.text_content)
        .where(
            Content.is_deleted == False,
            or_(
                Content.title.ilike(f"%{query}%"),
                Content.text_content.ilike(f"%{query}%"),
            ),
        )
        .limit(top_k)
    )
    if content_type:
        stmt = stmt.where(Content.content_type == content_type)

    result = await db.execute(stmt)
    rows = result.all()

    # 简单评分：title 匹配 > text 匹配
    scored = []
    q_lower = query.lower()
    for i, r in enumerate(rows):
        title_score = 2.0 if q_lower in (r.title or "").lower() else 0.0
        text_score = 1.0 if r.text_content and q_lower in r.text_content.lower() else 0.0
        scored.append({
            "id": str(r.id),
            "title": r.title,
            "score": title_score + text_score,
            "rank": i + 1,
        })
    # 按 score 降序
    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:top_k]


# ── RRF 融合 ──

def _rrf_merge(vector_results: list[dict], keyword_results: list[dict], k: int = RRF_K) -> list[dict]:
    """Reciprocal Rank Fusion"""
    scores: dict[str, float] = {}
    meta: dict[str, dict] = {}

    for r in vector_results:
        doc_id = r["id"]
        scores[doc_id] = scores.get(doc_id, 0.0) + VECTOR_WEIGHT * (1 / (k + r["rank"]))
        meta[doc_id] = {"title": r["title"], "score": r.get("score", 0)}

    for r in keyword_results:
        doc_id = r["id"]
        scores[doc_id] = scores.get(doc_id, 0.0) + KEYWORD_WEIGHT * (1 / (k + r["rank"]))
        if doc_id not in meta:
            meta[doc_id] = {"title": r["title"], "score": r.get("score", 0)}

    # 排序
    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    return [
        {
            "id": doc_id,
            "title": meta[doc_id]["title"],
            "rrf_score": round(score, 6),
            "vector_score": meta[doc_id].get("score", 0),
        }
        for doc_id, score in ranked
    ]


# ── 高亮片段提取 ──

async def _fetch_snippets(db: AsyncSession, doc_ids: list[str], query: str) -> dict[str, str]:
    """为每个结果提取匹配文本片段"""
    if not doc_ids:
        return {}

    result = await db.execute(
        select(Content.id, Content.text_content, Content.title).where(
            Content.id.in_(doc_ids)
        )
    )
    rows = result.all()
    q_lower = query.lower()
    snippets: dict[str, str] = {}

    for r in rows:
        text = r.text_content or ""
        title = r.title or ""
        # 优先在 text_content 里找
        idx = text.lower().find(q_lower)
        if idx >= 0:
            start = max(0, idx - 30)
            end = min(len(text), idx + len(query) + 80)
            snippet = text[start:end]
            if start > 0:
                snippet = "..." + snippet
            if end < len(text):
                snippet = snippet + "..."
            snippets[str(r.id)] = snippet
        elif query.lower() in title.lower():
            snippets[str(r.id)] = title
        else:
            # 取前 100 字符
            snippets[str(r.id)] = (text[:100] + "...") if len(text) > 100 else text

    return snippets


# ── 主搜索接口 ──

async def search(
    db: AsyncSession,
    query: str,
    top_k: int = 10,
    content_type: str | None = None,
    tag_ids: list[str] | None = None,
    category_id: str | None = None,
    brain_id: str | None = None,
    enable_vector: bool = True,
    enable_keyword: bool = True,
) -> dict:
    """执行混合搜索，返回结果 + 元信息"""
    import time
    t0 = time.time()

    vector_results: list[dict] = []
    keyword_results: list[dict] = []

    if enable_vector:
        try:
            query_vec = await _embed_query(query, db)
            vector_results = await _vector_search(db, query_vec, top_k=top_k * 2, content_type=content_type)
        except Exception:
            enable_vector = False

    if enable_keyword:
        keyword_results = await _keyword_search(db, query, top_k=top_k * 2, content_type=content_type)

    if not vector_results and not keyword_results:
        return {"results": [], "total": 0, "took_ms": round((time.time() - t0) * 1000, 1), "query": query}

    # RRF 融合
    merged = _rrf_merge(vector_results, keyword_results)

    # 截取 top_k
    top = merged[:top_k]

    # 拿 snippet
    doc_ids = [r["id"] for r in top]
    snippets = await _fetch_snippets(db, doc_ids, query)

    # 组装结果
    results = []
    for r in top:
        res = await db.execute(select(Content).where(Content.id == r["id"]))
        content = res.scalar_one_or_none()
        if content is None:
            continue

        # 应用过滤条件
        skip = False
        if tag_ids:
            # 检查内容是否有这些标签
            from app.models.models import ContentTag
            tag_check = await db.execute(
                select(ContentTag).where(
                    ContentTag.content_id == content.id,
                    ContentTag.tag_id.in_(tag_ids),
                )
            )
            if not tag_check.scalar_one_or_none():
                skip = True
        if category_id:
            from app.models.models import ContentCategory
            cat_check = await db.execute(
                select(ContentCategory).where(
                    ContentCategory.content_id == content.id,
                    ContentCategory.category_id == category_id,
                )
            )
            if not cat_check.scalar_one_or_none():
                skip = True
        if brain_id and str(content.brain_id) != brain_id:
            skip = True

        if skip:
            continue

        results.append({
            "id": str(content.id),
            "title": content.title,
            "content_type": content.content_type,
            "file_size": content.file_size,
            "created_at": content.created_at.isoformat() if content.created_at else None,
            "snippet": snippets.get(str(content.id), ""),
            "score": r["rrf_score"],
            "vector_score": r.get("vector_score"),
        })

    took_ms = round((time.time() - t0) * 1000, 1)

    # 写入搜索历史
    log = SearchLog(
        query=query,
        result_count=len(results),
    )
    db.add(log)
    await db.flush()

    return {
        "results": results,
        "total": len(results),
        "took_ms": took_ms,
        "query": query,
    }
