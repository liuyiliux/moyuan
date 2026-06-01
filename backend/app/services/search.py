"""语义搜索 Service

在 content_chunks 表上执行 chunk 级向量检索 + 关键词检索，
RRF 融合排序，返回精确位置（页码/时间戳）支持前端跳转。
"""

import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, func, text, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.models import Content, ContentChunk, SearchLog

settings = get_settings()

RRF_K = 60
VECTOR_WEIGHT = 0.7
KEYWORD_WEIGHT = 0.3
TOP_K = 20


# ── 向量检索（chunk 粒度）──

async def _vector_search(
    db: AsyncSession,
    query_vec: list[float],
    top_k: int = TOP_K,
    content_type: str | None = None,
    search_mode: str = "all",
) -> list[dict]:
    """在 content_chunks 表上执行 pgvector 余弦相似度搜索

    search_mode:
    - "all": 搜索所有 chunks
    - "text": 只搜索文本 chunks
    - "image": 只搜索图片 chunks
    """
    import logging
    logger = logging.getLogger(__name__)
    
    logger.info(f"开始向量搜索: query_vec 长度={len(query_vec)}, top_k={top_k}, search_mode={search_mode}")
    
    base = """
        SELECT cc.id AS chunk_id, cc.content_id, cc.chunk_text, cc.chunk_type,
               cc.page_number, cc.start_offset, cc.end_offset,
               cc.time_start, cc.time_end, cc.image_path,
               c.title, c.content_type, c.file_size, c.created_at,
               1 - (cc.embedding <=> :query_vec) AS score
        FROM content_chunks cc
        JOIN contents c ON c.id = cc.content_id
        WHERE c.is_deleted = false
          AND cc.embedding IS NOT NULL
    """
    if content_type:
        base += " AND c.content_type = :ctype"
    if search_mode == "text":
        base += " AND cc.embedding_type = 'text'"
    elif search_mode == "image":
        base += " AND cc.embedding_type = 'image'"
    base += " ORDER BY cc.embedding <=> :query_vec LIMIT :top_k"

    params = {"query_vec": query_vec, "top_k": top_k}
    if content_type:
        params["ctype"] = content_type

    try:
        # 使用 db.execute 而不是 raw_connection
        result = await db.execute(text(base), params)
        rows = result.all()
        logger.info(f"向量搜索返回 {len(rows)} 个结果")
        return [
            {
                "chunk_id": str(r.chunk_id),
                "content_id": str(r.content_id),
                "chunk_text": r.chunk_text,
                "chunk_type": r.chunk_type,
                "page_number": r.page_number,
                "start_offset": r.start_offset,
                "end_offset": r.end_offset,
                "time_start": float(r.time_start) if r.time_start is not None else None,
                "time_end": float(r.time_end) if r.time_end is not None else None,
                "image_path": r.image_path,
                "title": r.title,
                "content_type": r.content_type,
                "file_size": r.file_size,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "score": float(r.score),
                "rank": i + 1,
            }
            for i, r in enumerate(rows)
        ]
    except Exception as e:
        logger.error(f"向量搜索错误: {e}", exc_info=True)
        raise


# ── 关键词检索（chunk 粒度）──

async def _keyword_search(
    db: AsyncSession,
    query: str,
    top_k: int = TOP_K,
    content_type: str | None = None,
) -> list[dict]:
    """在 chunk_text 上执行 ILIKE 模糊匹配"""
    stmt = (
        select(
            ContentChunk.id.label("chunk_id"),
            ContentChunk.content_id,
            ContentChunk.chunk_text,
            ContentChunk.chunk_type,
            ContentChunk.page_number,
            ContentChunk.start_offset,
            ContentChunk.end_offset,
            ContentChunk.time_start,
            ContentChunk.time_end,
            ContentChunk.image_path,
            Content.title,
            Content.content_type,
            Content.file_size,
            Content.created_at,
        )
        .join(Content, Content.id == ContentChunk.content_id)
        .where(
            Content.is_deleted == False,
            ContentChunk.chunk_text.ilike(f"%{query}%"),
        )
        .limit(top_k)
    )
    if content_type:
        stmt = stmt.where(Content.content_type == content_type)

    result = await db.execute(stmt)
    rows = result.all()

    scored = []
    q_lower = query.lower()
    for i, r in enumerate(rows):
        chunk_text = r.chunk_text or ""
        score = 1.0 if q_lower in chunk_text.lower() else 0.0
        scored.append({
            "chunk_id": str(r.chunk_id),
            "content_id": str(r.content_id),
            "chunk_text": r.chunk_text,
            "chunk_type": r.chunk_type,
            "page_number": r.page_number,
            "start_offset": r.start_offset,
            "end_offset": r.end_offset,
            "time_start": float(r.time_start) if r.time_start is not None else None,
            "time_end": float(r.time_end) if r.time_end is not None else None,
            "image_path": r.image_path,
            "title": r.title,
            "content_type": r.content_type,
            "file_size": r.file_size,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "score": score,
            "rank": i + 1,
        })
    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:top_k]


# ── RRF 融合 ──

def _rrf_merge(vector_results: list[dict], keyword_results: list[dict], k: int = RRF_K) -> list[dict]:
    scores: dict[str, float] = {}
    meta: dict[str, dict] = {}

    for r in vector_results:
        cid = r["chunk_id"]
        scores[cid] = scores.get(cid, 0.0) + VECTOR_WEIGHT * (1 / (k + r["rank"]))
        meta[cid] = r

    for r in keyword_results:
        cid = r["chunk_id"]
        scores[cid] = scores.get(cid, 0.0) + KEYWORD_WEIGHT * (1 / (k + r["rank"]))
        if cid not in meta:
            meta[cid] = r

    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    results = []
    for cid, score in ranked:
        m = meta[cid]
        m["rrf_score"] = round(score, 6)
        results.append(m)
    return results


# ── 文档级聚合 ──

def _aggregate_by_content(results: list[dict]) -> list[dict]:
    """将 chunk 级结果按 content_id 聚合为文档级结果"""
    docs: dict[str, dict] = {}

    for r in results:
        cid = r["content_id"]
        if cid not in docs:
            docs[cid] = {
                "content_id": cid,
                "title": r["title"],
                "content_type": r["content_type"],
                "file_size": r.get("file_size"),
                "created_at": r.get("created_at"),
                "best_score": r.get("rrf_score", 0),
                "best_chunk": r,
                "chunks": [],
            }
        docs[cid]["chunks"].append(r)
        if r.get("rrf_score", 0) > docs[cid]["best_score"]:
            docs[cid]["best_score"] = r["rrf_score"]
            docs[cid]["best_chunk"] = r

    aggregated = sorted(docs.values(), key=lambda x: x["best_score"], reverse=True)
    return aggregated


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
    search_mode: str = "all",
    query_vector: list[float] | None = None,
) -> dict:
    """执行 chunk 级混合搜索

    search_mode: "all" / "text" / "image"
    query_vector: 预计算的查询向量（图搜图时传入）
    """
    import time
    import logging
    logger = logging.getLogger(__name__)
    
    t0 = time.time()
    logger.info(f"开始搜索: query='{query}', enable_vector={enable_vector}, enable_keyword={enable_keyword}, search_mode={search_mode}")

    vector_results: list[dict] = []
    keyword_results: list[dict] = []

    if enable_vector:
        try:
            if query_vector is not None:
                qv = query_vector
            else:
                from app.services.embedding import embed_query
                qv = await embed_query(db, query)
            if qv is not None:
                logger.info(f"查询向量生成成功，长度={len(qv)}")
                vector_results = await _vector_search(
                    db, qv, top_k=top_k * 2,
                    content_type=content_type,
                    search_mode=search_mode,
                )
                logger.info(f"向量搜索结果数量: {len(vector_results)}")
            else:
                logger.warning("查询向量生成失败，跳过向量搜索")
        except Exception as e:
            logger.error(f"向量搜索异常: {e}", exc_info=True)

    if enable_keyword:
        keyword_results = await _keyword_search(
            db, query, top_k=top_k * 2,
            content_type=content_type,
        )
        logger.info(f"关键词搜索结果数量: {len(keyword_results)}")

    if not vector_results and not keyword_results:
        return {"results": [], "total": 0, "took_ms": round((time.time() - t0) * 1000, 1), "query": query}

    merged = _rrf_merge(vector_results, keyword_results)

    aggregated = _aggregate_by_content(merged)

    results = []
    for doc in aggregated[:top_k]:
        best = doc["best_chunk"]
        snippet = (best.get("chunk_text") or "")[:200]

        results.append({
            "content_id": doc["content_id"],
            "title": doc["title"],
            "content_type": doc["content_type"],
            "file_size": doc.get("file_size"),
            "created_at": doc.get("created_at"),
            "score": doc["best_score"],
            "best_chunk": {
                "chunk_id": best.get("chunk_id"),
                "snippet": snippet,
                "chunk_type": best.get("chunk_type"),
                "page_number": best.get("page_number"),
                "start_offset": best.get("start_offset"),
                "end_offset": best.get("end_offset"),
                "time_start": best.get("time_start"),
                "time_end": best.get("time_end"),
                "image_path": best.get("image_path"),
            },
            "match_count": len(doc["chunks"]),
            "all_chunks": [
                {
                    "chunk_id": c.get("chunk_id"),
                    "snippet": (c.get("chunk_text") or "")[:200],
                    "page_number": c.get("page_number"),
                    "time_start": c.get("time_start"),
                    "score": c.get("rrf_score"),
                }
                for c in doc["chunks"][:5]
            ],
        })

    took_ms = round((time.time() - t0) * 1000, 1)

    log = SearchLog(query=query, result_count=len(results))
    db.add(log)
    await db.flush()

    return {
        "results": results,
        "total": len(results),
        "took_ms": took_ms,
        "query": query,
    }
