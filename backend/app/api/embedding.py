"""向量嵌入管理 API"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import Content, ProviderConfig

router = APIRouter(prefix="/api/embeddings", tags=["embeddings"])


# ── 嵌入统计 ──

@router.get("/stats")
async def get_embedding_stats(db: AsyncSession = Depends(get_db)):
    """获取嵌入统计信息"""
    # 总数
    total_result = await db.execute(
        select(func.count(Content.id)).where(
            Content.is_deleted == False,
            Content.text_content.isnot(None),
        )
    )
    total_text = total_result.scalar() or 0

    # 已有文本嵌入
    embedded_result = await db.execute(
        select(func.count(Content.id)).where(
            Content.is_deleted == False,
            Content.text_embedding.isnot(None),
        )
    )
    embedded = embedded_result.scalar() or 0

    # 已有图像嵌入
    image_result = await db.execute(
        select(func.count(Content.id)).where(
            Content.is_deleted == False,
            Content.image_embedding.isnot(None),
        )
    )
    image_embedded = image_result.scalar() or 0

    # 嵌入维度
    dim_result = await db.execute(
        select(Content.text_embedding).where(
            Content.is_deleted == False,
            Content.text_embedding.isnot(None),
        ).limit(1)
    )
    first = dim_result.scalar_one_or_none()
    dim = len(first) if first is not None else 0

    return {
        "total_text_contents": total_text,
        "text_embedded": embedded,
        "text_pending": max(0, total_text - embedded),
        "image_embedded": image_embedded,
        "embedding_dimension": dim,
    }


# ── 重新嵌入 ──

@router.post("/reindex")
async def reindex_embeddings(
    db: AsyncSession = Depends(get_db),
):
    """批量重新嵌入：
    1. 清空现有 text_embedding
    2. 创建任务入队重新处理（通过 task queue）
    """
    from app.services.task_queue import enqueue_embed

    # 获取所有有文本内容的内容
    result = await db.execute(
        select(Content.id).where(
            Content.is_deleted == False,
            Content.text_content.isnot(None),
        )
    )
    items = result.scalars().all()

    # 清空现有嵌入
    cleared = 0
    for content_id in items:
        cid = str(content_id)
        await db.execute(
            update(Content)
            .where(Content.id == content_id)
            .values(text_embedding=None)
        )
        cleared += 1

    await db.commit()

    # 入队重新嵌入（低优先级，批量）
    count = 0
    for content_id in items:
        await enqueue_embed(str(content_id), priority=5)
        count += 1
        if count >= 100:  # 限制单次触发数量
            break

    return {
        "status": "reindexing",
        "cleared": cleared,
        "queued": count,
        "total": len(items),
    }


# ── 图像嵌入 ──

@router.post("/image/{content_id}")
async def generate_image_embedding(
    content_id: str,
    db: AsyncSession = Depends(get_db),
):
    """为图片内容生成图像嵌入（调用文本嵌入作为 fallback）"""
    c_result = await db.execute(
        select(Content).where(Content.id == content_id)
    )
    content = c_result.scalar_one_or_none()
    if content is None:
        raise HTTPException(status_code=404, detail="Content not found")

    # 如果没有文本内容，使用标题
    input_text = content.text_content or content.title or "image"

    # 调用文本嵌入作为图像 embedding 的 fallback
    from app.services.embedding import embed_content
    success = await embed_content(db, content_id)

    if success:
        # 将文本嵌入也复制到 image_embedding（简化处理）
        if content.text_embedding is not None:
            content.image_embedding = content.text_embedding
            await db.commit()

        return {
            "status": "completed",
            "content_id": content_id,
            "dimension": len(content.text_embedding) if content.text_embedding else 0,
            "note": "Using text embedding as image embedding fallback",
        }

    return {
        "status": "skipped",
        "content_id": content_id,
        "note": "No embedding provider configured",
    }
