"""搜索 API

POST /api/search          — chunk 级语义/关键词混合搜索
POST /api/search/image    — 以图搜图 / 以图搜文
GET  /api/search/history  — 搜索历史
DELETE /api/search/history/{id}
"""

import json
import base64
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import Brain
from app.services.search import search as search_service

router = APIRouter(prefix="/api/search", tags=["search"])


def _highlight(text: str, query: str) -> str:
    import re
    if not query or not text:
        return text
    words = re.split(r"(\s+)", query)
    words = [w for w in words if w.strip()]
    if not words:
        return text
    pattern = "|".join(re.escape(w) for w in words)
    return re.sub(f"({pattern})", r"<mark>\1</mark>", text, flags=re.IGNORECASE)


async def _brain_uuid_or_404(db: AsyncSession, brain_id: str | None) -> uuid.UUID | None:
    if not brain_id:
        return None
    try:
        brain_uuid = uuid.UUID(brain_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid brain_id")
    if await db.get(Brain, brain_uuid) is None:
        raise HTTPException(status_code=404, detail="Brain not found")
    return brain_uuid


# ── Chunk 级结果模型 ──

class ChunkInfo(BaseModel):
    chunk_id: str | None = None
    snippet: str = ""
    chunk_type: str | None = None
    page_number: int | None = None
    start_offset: int | None = None
    end_offset: int | None = None
    time_start: float | None = None
    time_end: float | None = None
    image_path: str | None = None
    score: float | None = None


class SearchResultItem(BaseModel):
    content_id: str
    title: str
    content_type: str
    file_size: int | None
    created_at: str | None
    score: float
    best_chunk: ChunkInfo
    match_count: int = 1
    all_chunks: list[ChunkInfo] = []


class SearchRequest(BaseModel):
    query: str
    top_k: int = 10
    content_type: str | None = None
    tag_ids: list[str] | None = None
    category_id: str | None = None
    brain_id: str | None = None
    created_after: datetime | None = None
    created_before: datetime | None = None
    enable_vector: bool = True
    enable_keyword: bool = True
    search_mode: str = "all"


class SearchResponse(BaseModel):
    results: list[SearchResultItem]
    total: int
    took_ms: float
    query: str


# ── 文本搜索 ──

@router.post("", response_model=SearchResponse)
async def search_endpoint(
    body: SearchRequest,
    db: AsyncSession = Depends(get_db),
):
    """执行 chunk 级混合搜索"""
    if not body.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    await _brain_uuid_or_404(db, body.brain_id)
    result = await search_service(
        db=db,
        query=body.query,
        top_k=body.top_k,
        content_type=body.content_type,
        tag_ids=body.tag_ids,
        category_id=body.category_id,
        brain_id=body.brain_id,
        created_after=body.created_after,
        created_before=body.created_before,
        enable_vector=body.enable_vector,
        enable_keyword=body.enable_keyword,
        search_mode=body.search_mode,
    )

    items = []
    for r in result["results"]:
        best = r.get("best_chunk", {})
        snippet = best.get("snippet", "")
        items.append(SearchResultItem(
            content_id=r["content_id"],
            title=r["title"],
            content_type=r["content_type"],
            file_size=r.get("file_size"),
            created_at=r.get("created_at"),
            score=r["score"],
            best_chunk=ChunkInfo(
                chunk_id=best.get("chunk_id"),
                snippet=snippet,
                chunk_type=best.get("chunk_type"),
                page_number=best.get("page_number"),
                start_offset=best.get("start_offset"),
                end_offset=best.get("end_offset"),
                time_start=best.get("time_start"),
                time_end=best.get("time_end"),
                image_path=best.get("image_path"),
            ),
            match_count=r.get("match_count", 1),
            all_chunks=[
                ChunkInfo(
                    chunk_id=c.get("chunk_id"),
                    snippet=c.get("snippet", ""),
                    page_number=c.get("page_number"),
                    time_start=c.get("time_start"),
                    score=c.get("score"),
                )
                for c in r.get("all_chunks", [])
            ],
        ))

    return SearchResponse(
        results=items,
        total=result["total"],
        took_ms=result["took_ms"],
        query=result["query"],
    )


# ── 以图搜图 ──

@router.post("/image", response_model=SearchResponse)
async def image_search_endpoint(
    file: UploadFile = File(...),
    top_k: int = Query(10, ge=1, le=100),
    search_mode: str = Query("all", pattern="^(all|text|image)$"),
    content_type: str | None = Query(None),
    brain_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """以图搜图 / 以图搜文"""
    await _brain_uuid_or_404(db, brain_id)
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    ext = Path(file.filename or "image.jpg").suffix.lower() or ".jpg"
    mime_map = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".png": "image/png", ".gif": "image/gif",
        ".webp": "image/webp",
    }
    mime = mime_map.get(ext, "image/jpeg")
    b64 = base64.b64encode(content).decode()
    data_url = f"data:{mime};base64,{b64}"

    from app.services.embedding import _get_embedding_binding, _get_provider, _call_openai_embedding
    from app.core.crypto import crypto_service

    binding = await _get_embedding_binding(db, brain_id)
    if binding is None:
        raise HTTPException(status_code=500, detail="未配置 embedding 提供商")

    provider = await _get_provider(db, binding["provider_id"])
    if provider is None:
        raise HTTPException(status_code=500, detail="embedding provider 不存在")

    api_key = crypto_service.decrypt(provider.api_key_encrypted) if provider.api_key_encrypted else None
    base_url = provider.base_url
    model = binding["model"]

    multimodal_input = [{"type": "image_url", "image_url": {"url": data_url}}]

    try:
        vecs = await _call_openai_embedding(api_key or "", base_url, model, multimodal_input)
        query_vec = vecs[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"图像嵌入生成失败: {str(e)}")

    result = await search_service(
        db=db,
        query="[图片搜索]",
        top_k=top_k,
        content_type=content_type,
        brain_id=brain_id,
        enable_vector=True,
        enable_keyword=False,
        search_mode=search_mode,
        query_vector=query_vec,
    )

    items = []
    for r in result["results"]:
        best = r.get("best_chunk", {})
        items.append(SearchResultItem(
            content_id=r["content_id"],
            title=r["title"],
            content_type=r["content_type"],
            file_size=r.get("file_size"),
            created_at=r.get("created_at"),
            score=r["score"],
            best_chunk=ChunkInfo(
                chunk_id=best.get("chunk_id"),
                snippet=best.get("snippet", ""),
                chunk_type=best.get("chunk_type"),
                page_number=best.get("page_number"),
                image_path=best.get("image_path"),
            ),
            match_count=r.get("match_count", 1),
        ))

    return SearchResponse(
        results=items,
        total=result["total"],
        took_ms=result["took_ms"],
        query="[图片搜索]",
    )


# ── 搜索历史 ──

@router.get("/history")
async def get_search_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    brain_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    from app.models.models import SearchLog

    brain_uuid = await _brain_uuid_or_404(db, brain_id)
    query = select(SearchLog)
    count_query = select(func.count(SearchLog.id))
    if brain_uuid:
        query = query.where(SearchLog.brain_id == brain_uuid)
        count_query = count_query.where(SearchLog.brain_id == brain_uuid)

    count_res = await db.execute(count_query)
    total = count_res.scalar() or 0

    offset = (page - 1) * page_size
    res = await db.execute(
        query.order_by(SearchLog.created_at.desc()).offset(offset).limit(page_size)
    )
    rows = res.scalars().all()

    return {
        "items": [
            {
                "id": str(r.id),
                "query": r.query,
                "result_count": r.result_count,
                "brain_id": str(r.brain_id) if r.brain_id else None,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.delete("/history/{log_id}")
async def delete_search_history(log_id: str, db: AsyncSession = Depends(get_db)):
    from app.models.models import SearchLog

    res = await db.execute(select(SearchLog).where(SearchLog.id == log_id))
    log = res.scalar_one_or_none()
    if log is None:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(log)
    await db.flush()
    return {"ok": True}
