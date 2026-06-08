"""数据统计面板 API"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession
from pathlib import Path
from datetime import datetime

from app.core.database import get_db
from app.core.config import get_settings
from app.models.models import Brain, Content, Tag, ContentTag, SearchLog

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


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


@router.get("/overview")
async def overview(brain_id: str | None = Query(None), db: AsyncSession = Depends(get_db)):
    """统计汇总：各类型内容数量和存储"""
    brain_uuid = await _brain_uuid_or_404(db, brain_id)
    conditions = [Content.is_deleted == False]
    if brain_uuid:
        conditions.append(Content.brain_id == brain_uuid)
    # 各类型数量
    type_counts = {}
    total_size = 0
    total_embed = 0
    res = await db.execute(
        select(Content.content_type, func.count(Content.id), func.sum(Content.file_size))
        .where(*conditions)
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
        .where(*conditions, Content.embedding.isnot(None))
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
async def tag_distribution(
    limit: int = 20,
    brain_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """标签分布统计 Top-N"""
    brain_uuid = await _brain_uuid_or_404(db, brain_id)
    brain_filter = ""
    params = {"limit": limit}
    if brain_uuid:
        brain_filter = "WHERE t.brain_id = CAST(:brain_id AS uuid) AND (c.id IS NULL OR c.brain_id = CAST(:brain_id AS uuid))"
        params["brain_id"] = str(brain_uuid)
    res = await db.execute(text("""
        SELECT t.name, t.color, COUNT(ct.content_id) as cnt
        FROM tags t
        LEFT JOIN content_tags ct ON t.id = ct.tag_id
        LEFT JOIN contents c ON c.id = ct.content_id
        """ + brain_filter + """
        GROUP BY t.id, t.name, t.color
        ORDER BY cnt DESC
        LIMIT :limit
    """), params)
    return {
        "tags": [
            {"name": r.name, "color": r.color, "count": r.cnt}
            for r in res.fetchall()
        ]
    }


@router.get("/search-trends")
async def search_trends(
    limit: int = 20,
    days: int = Query(30, ge=1, le=365),
    brain_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """检索热度统计"""
    brain_uuid = await _brain_uuid_or_404(db, brain_id)
    brain_filter = ""
    params = {"limit": limit, "days": days}
    if brain_uuid:
        brain_filter = " AND brain_id = CAST(:brain_id AS uuid)"
        params["brain_id"] = str(brain_uuid)
    res = await db.execute(text("""
        SELECT query, COUNT(*) as cnt
        FROM search_logs
        WHERE created_at >= NOW() - (:days * INTERVAL '1 day')
        """ + brain_filter + """
        GROUP BY query
        ORDER BY cnt DESC
        LIMIT :limit
    """), params)
    trend_res = await db.execute(text("""
        SELECT DATE_TRUNC('day', created_at) as day, COUNT(*) as cnt
        FROM search_logs
        WHERE created_at >= NOW() - (:days * INTERVAL '1 day')
        """ + brain_filter + """
        GROUP BY day
        ORDER BY day ASC
    """), params)
    return {
        "trends": [
            {"query": r.query, "count": r.cnt}
            for r in res.fetchall()
        ],
        "daily": [
            {"day": str(r.day), "count": r.cnt}
            for r in trend_res.fetchall()
        ],
        "days": days,
    }


@router.get("/growth")
async def growth_stats(brain_id: str | None = Query(None), db: AsyncSession = Depends(get_db)):
    """内容增长趋势（按周统计）"""
    brain_uuid = await _brain_uuid_or_404(db, brain_id)
    brain_filter = ""
    params = {}
    if brain_uuid:
        brain_filter = " AND brain_id = CAST(:brain_id AS uuid)"
        params["brain_id"] = str(brain_uuid)
    res = await db.execute(text("""
        SELECT DATE_TRUNC('week', created_at) as week, COUNT(*) as cnt
        FROM contents
        WHERE is_deleted = false
        """ + brain_filter + """
        GROUP BY week
        ORDER BY week DESC
        LIMIT 12
    """), params)
    return {
        "growth": [
            {"week": str(r.week), "count": r.cnt}
            for r in res.fetchall()
        ]
    }


@router.get("/logs")
async def get_logs(
    lines: int = Query(100, ge=1, le=1000),
    content_id: str | None = Query(None),
):
    """获取应用日志
    
    :param lines: 返回的行数（默认100，最多1000）
    :param content_id: 可选，只显示指定内容ID相关的日志
    """
    settings = get_settings()
    log_dir = Path(settings.log_dir)
    
    main_log = log_dir / "moyuan.log"
    if not main_log.exists():
        raise HTTPException(status_code=404, detail="日志文件不存在")
    
    # 读取最后 N 行
    try:
        with open(main_log, "r", encoding="utf-8", errors="ignore") as f:
            all_lines = f.readlines()
            last_lines = all_lines[-lines:]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"读取日志失败: {str(e)}")
    
    # 如果指定了 content_id，过滤相关日志
    if content_id:
        filtered = [
            line for line in last_lines 
            if content_id.lower() in line.lower()
        ]
        # 如果过滤后为空，返回原始日志
        if not filtered:
            filtered = last_lines[:20]
    else:
        filtered = last_lines
    
    return {
        "logs": filtered,
        "total_lines": len(all_lines),
        "returned_lines": len(filtered),
        "timestamp": datetime.now().isoformat(),
    }
