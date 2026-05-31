"""数据统计面板 API"""

from fastapi import APIRouter, Depends
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import Content, Tag, ContentTag, SearchLog

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/overview")
async def overview(db: AsyncSession = Depends(get_db)):
    """统计汇总：各类型内容数量和存储"""
    # 各类型数量
    type_counts = {}
    total_size = 0
    total_embed = 0
    res = await db.execute(
        select(Content.content_type, func.count(Content.id), func.sum(Content.file_size))
        .where(Content.is_deleted == False)
        .group_by(Content.content_type)
    )
    for row in res.all():
        ct, cnt, sz = row
        type_counts[ct] = cnt
        total_size += sz or 0
        total_embed += cnt

    # 嵌入统计
    embed_res = await db.execute(
        select(func.count(Content.id))
        .where(Content.is_deleted == False, Content.text_embedding.isnot(None))
    )
    embedded = embed_res.scalar() or 0

    return {
        "total_contents": total_embed,
        "total_storage_bytes": total_size,
        "total_storage_mb": round(total_size / 1024 / 1024, 1) if total_size else 0,
        "embedded": embedded,
        "by_type": type_counts,
    }


@router.get("/tags")
async def tag_distribution(limit: int = 20, db: AsyncSession = Depends(get_db)):
    """标签分布统计 Top-N"""
    res = await db.execute(text("""
        SELECT t.name, t.color, COUNT(ct.content_id) as cnt
        FROM tags t
        LEFT JOIN content_tags ct ON t.id = ct.tag_id
        GROUP BY t.id, t.name, t.color
        ORDER BY cnt DESC
        LIMIT :limit
    """), {"limit": limit})
    return {
        "tags": [
            {"name": r.name, "color": r.color, "count": r.cnt}
            for r in res.fetchall()
        ]
    }


@router.get("/search-trends")
async def search_trends(limit: int = 20, db: AsyncSession = Depends(get_db)):
    """检索热度统计"""
    res = await db.execute(text("""
        SELECT query, COUNT(*) as cnt
        FROM search_logs
        GROUP BY query
        ORDER BY cnt DESC
        LIMIT :limit
    """), {"limit": limit})
    return {
        "trends": [
            {"query": r.query, "count": r.cnt}
            for r in res.fetchall()
        ]
    }


@router.get("/growth")
async def growth_stats(db: AsyncSession = Depends(get_db)):
    """内容增长趋势（按周统计）"""
    res = await db.execute(text("""
        SELECT DATE_TRUNC('week', created_at) as week, COUNT(*) as cnt
        FROM contents
        WHERE is_deleted = false
        GROUP BY week
        ORDER BY week DESC
        LIMIT 12
    """))
    return {
        "growth": [
            {"week": str(r.week), "count": r.cnt}
            for r in res.fetchall()
        ]
    }
