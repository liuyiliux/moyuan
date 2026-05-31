"""向量嵌入管理 API"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import Content, ProviderConfig

router = APIRouter(prefix="/api/embeddings", tags=["embeddings"])


@router.get("/stats")
async def get_embedding_stats(db: AsyncSession = Depends(get_db)):
    """获取嵌入统计信息"""
    total_result = await db.execute(
        select(func.count(Content.id)).where(
            Content.is_deleted == False,
        )
    )
    total = total_result.scalar() or 0

    embedded_result = await db.execute(
        select(func.count(Content.id)).where(
            Content.is_deleted == False,
            Content.embedding.isnot(None),
        )
    )
    embedded = embedded_result.scalar() or 0

    text_result = await db.execute(
        select(func.count(Content.id)).where(
            Content.is_deleted == False,
            Content.embedding_type == "text",
        )
    )
    text_embedded = text_result.scalar() or 0

    image_result = await db.execute(
        select(func.count(Content.id)).where(
            Content.is_deleted == False,
            Content.embedding_type == "image",
        )
    )
    image_embedded = image_result.scalar() or 0

    dim_result = await db.execute(
        select(Content.embedding).where(
            Content.is_deleted == False,
            Content.embedding.isnot(None),
        ).limit(1)
    )
    first = dim_result.scalar_one_or_none()
    dim = len(first) if first is not None else 0

    return {
        "total": total,
        "embedded": embedded,
        "pending": max(0, total - embedded),
        "text_embedded": text_embedded,
        "image_embedded": image_embedded,
        "embedding_dimension": dim,
    }


@router.post("/reindex")
async def reindex_embeddings(
    db: AsyncSession = Depends(get_db),
):
    """批量重新嵌入（清除旧 chunks 和嵌入后重新处理）"""
    from app.services.task_queue import enqueue_embed
    from app.models.models import ContentChunk
    from sqlalchemy import delete as sql_delete

    result = await db.execute(
        select(Content.id).where(Content.is_deleted == False)
    )
    items = result.scalars().all()

    await db.execute(sql_delete(ContentChunk))

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
