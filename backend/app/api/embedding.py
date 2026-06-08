"""向量嵌入管理 API"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import Brain, Content, ProviderConfig

router = APIRouter(prefix="/api/embeddings", tags=["embeddings"])


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


def _brain_filter(query, brain_id: uuid.UUID | None):
    if brain_id:
        return query.where(Content.brain_id == brain_id)
    return query


@router.get("/stats")
async def get_embedding_stats(
    brain_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """获取嵌入统计信息"""
    brain_uuid = await _brain_uuid_or_404(db, brain_id)
    total_result = await db.execute(
        _brain_filter(
            select(func.count(Content.id)).where(Content.is_deleted == False),
            brain_uuid,
        )
    )
    total = total_result.scalar() or 0

    embedded_result = await db.execute(
        _brain_filter(
            select(func.count(Content.id)).where(
                Content.is_deleted == False,
                Content.embedding.isnot(None),
            ),
            brain_uuid,
        )
    )
    embedded = embedded_result.scalar() or 0

    text_result = await db.execute(
        _brain_filter(
            select(func.count(Content.id)).where(
                Content.is_deleted == False,
                Content.embedding_type == "text",
            ),
            brain_uuid,
        )
    )
    text_embedded = text_result.scalar() or 0

    total_text_result = await db.execute(
        _brain_filter(
            select(func.count(Content.id)).where(
                Content.is_deleted == False,
                Content.text_content.isnot(None),
            ),
            brain_uuid,
        )
    )
    total_text_contents = total_text_result.scalar() or 0

    image_result = await db.execute(
        _brain_filter(
            select(func.count(Content.id)).where(
                Content.is_deleted == False,
                Content.embedding_type == "image",
            ),
            brain_uuid,
        )
    )
    image_embedded = image_result.scalar() or 0

    dim_result = await db.execute(
        _brain_filter(
            select(Content.embedding).where(
                Content.is_deleted == False,
                Content.embedding.isnot(None),
            ),
            brain_uuid,
        ).limit(1)
    )
    first = dim_result.scalar_one_or_none()
    dim = len(first) if first is not None else 0

    return {
        "total": total,
        "embedded": embedded,
        "pending": max(0, total - embedded),
        "total_text_contents": total_text_contents,
        "text_embedded": text_embedded,
        "text_pending": max(0, total_text_contents - text_embedded),
        "image_embedded": image_embedded,
        "embedding_dimension": dim,
    }


@router.post("/reindex")
async def reindex_embeddings(
    brain_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """批量重新嵌入（清除旧 chunks 和嵌入后重新处理）"""
    from app.services.task_queue import enqueue_embed
    from app.models.models import ContentChunk
    from sqlalchemy import delete as sql_delete

    brain_uuid = await _brain_uuid_or_404(db, brain_id)
    content_query = select(Content.id).where(Content.is_deleted == False)
    if brain_uuid:
        content_query = content_query.where(Content.brain_id == brain_uuid)
    result = await db.execute(
        content_query
    )
    items = result.scalars().all()

    if items:
        await db.execute(sql_delete(ContentChunk).where(ContentChunk.content_id.in_(items)))

    cleared = 0
    for content_id in items:
        await db.execute(
            update(Content)
            .where(Content.id == content_id)
            .values(embedding=None, embedding_type=None)
        )
        cleared += 1

    await db.commit()

    count = 0
    for content_id in items:
        await enqueue_embed(str(content_id), priority=5)
        count += 1
        if count >= 100:
            break

    return {
        "status": "reindexing",
        "cleared": cleared,
        "queued": count,
        "total": len(items),
    }
