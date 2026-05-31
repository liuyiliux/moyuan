"""搜索 API

POST /api/search          — 语义/关键词混合搜索
GET  /api/search/history — 搜索历史
DELETE /api/search/history/{id} — 删除单条历史
"""

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.search import search as search_service

router = APIRouter(prefix="/api/search", tags=["search"])


# ── Helpers ──

def _highlight(text: str, query: str) -> str:
    """在文本中高亮查询关键词"""
    import re
    if not query or not text:
        return text
    # 按词拆分（中文按字符，英文按词）
    words = re.split(r"(\s+)", query)
    words = [w for w in words if w.strip()]
    if not words:
        return text
    pattern = "|".join(re.escape(w) for w in words)
    return re.sub(f"({pattern})", r"<mark>\1</mark>", text, flags=re.IGNORECASE)


# ── Request / Response ──

class SearchRequest(BaseModel):
    query: str
    top_k: int = 10
    content_type: str | None = None
    tag_ids: list[str] | None = None
    category_id: str | None = None
    brain_id: str | None = None
    enable_vector: bool = True
    enable_keyword: bool = True


class SearchResultItem(BaseModel):
    id: str
    title: str
    content_type: str
    file_size: int | None
    created_at: str | None
    snippet: str
    highlighted_snippet: str | None = None
    score: float
    vector_score: float | None = None


class SearchResponse(BaseModel):
    results: list[SearchResultItem]
    total: int
    took_ms: float
    query: str


class SearchHistoryItem(BaseModel):
    id: str
    query: str
    result_count: int
    took_ms: float
    created_at: str


# ── Routes ──

@router.post("", response_model=SearchResponse)
async def search_endpoint(
    body: SearchRequest,
    db: AsyncSession = Depends(get_db),
):
    """执行混合搜索"""
    if not body.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    result = await search_service(
        db=db,
        query=body.query,
        top_k=body.top_k,
        content_type=body.content_type,
        tag_ids=body.tag_ids,
        category_id=body.category_id,
        brain_id=body.brain_id,
        enable_vector=body.enable_vector,
        enable_keyword=body.enable_keyword,
    )

    # 转换 datetime 为 isoformat，并生成高亮片段
    items = []
    for r in result["results"]:
        snippet = r.get("snippet", "")
        items.append(SearchResultItem(
            id=r["id"],
            title=r["title"],
            content_type=r["content_type"],
            file_size=r.get("file_size"),
            created_at=r.get("created_at"),
            snippet=snippet,
            highlighted_snippet=_highlight(snippet, body.query) if snippet else None,
            score=r["score"],
            vector_score=r.get("vector_score"),
        ))

    return SearchResponse(
        results=items,
        total=result["total"],
        took_ms=result["took_ms"],
        query=result["query"],
    )


@router.get("/history")
async def get_search_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """获取搜索历史"""
    from app.models.models import SearchLog

    # 总数
    count_res = await db.execute(select(func.count(SearchLog.id)))
    total = count_res.scalar() or 0

    # 分页
    offset = (page - 1) * page_size
    res = await db.execute(
        select(SearchLog)
        .order_by(SearchLog.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    rows = res.scalars().all()

    return {
        "items": [
            {
                "id": str(r.id),
                "query": r.query,
                "result_count": r.result_count,
                "took_ms": r.took_ms,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.delete("/history/{log_id}")
async def delete_search_history(
    log_id: str,
    db: AsyncSession = Depends(get_db),
):
    """删除单条搜索历史"""
    from app.models.models import SearchLog

    res = await db.execute(select(SearchLog).where(SearchLog.id == log_id))
    log = res.scalar_one_or_none()
    if log is None:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(log)
    await db.flush()
    return {"ok": True}
