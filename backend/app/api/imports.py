"""Import batch center APIs."""

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.file import _ensure_brain_exists, _parse_brain_uuid
from app.core.database import get_db
from app.models.models import Content

router = APIRouter(prefix="/api/imports", tags=["imports"])


class ImportBatchAction(BaseModel):
    action: str
    brain_id: str | None = None


@router.get("/batches", response_model=dict)
async def list_import_batches(
    brain_id: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    brain_uuid = _parse_brain_uuid(brain_id)
    await _ensure_brain_exists(db, brain_uuid)

    batch_id_expr = Content.extra_meta["import_batch_id"].astext
    root_expr = Content.extra_meta["import_root"].astext
    conditions = [
        Content.extra_meta.is_not(None),
        batch_id_expr.is_not(None),
    ]
    if brain_uuid:
        conditions.append(Content.brain_id == brain_uuid)

    total_result = await db.execute(
        select(func.count()).select_from(
            select(batch_id_expr.label("batch_id"))
            .where(*conditions)
            .group_by(batch_id_expr)
            .subquery()
        )
    )
    total = total_result.scalar() or 0

    rows_result = await db.execute(
        select(
            batch_id_expr.label("batch_id"),
            func.min(root_expr).label("import_root"),
            func.count(Content.id).label("total"),
            func.count(case((Content.is_deleted == False, 1))).label("active"),
            func.count(case((Content.is_deleted == True, 1))).label("deleted"),
            func.count(case((Content.processing_status == "failed", 1))).label("failed"),
            func.count(case((Content.processing_status == "pending", 1))).label("pending"),
            func.count(case((Content.processing_status.in_(("chunked", "partial")), 1))).label("ready_to_embed"),
            func.count(case((Content.processing_status.in_(("processing", "chunking", "embedding")), 1))).label("processing"),
            func.count(case((Content.processing_status == "completed", 1))).label("completed"),
            func.min(Content.created_at).label("created_at"),
            func.max(Content.updated_at).label("updated_at"),
        )
        .where(*conditions)
        .group_by(batch_id_expr)
        .order_by(func.max(Content.updated_at).desc(), func.min(Content.created_at).desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )

    batches = []
    for row in rows_result.all():
        sample_result = await db.execute(
            select(Content.id, Content.title, Content.content_type, Content.processing_status)
            .where(*conditions, batch_id_expr == row.batch_id)
            .order_by(Content.created_at.asc())
            .limit(100)
        )
        batches.append({
            "batch_id": row.batch_id,
            "import_root": row.import_root,
            "total": row.total or 0,
            "active": row.active or 0,
            "deleted": row.deleted or 0,
            "failed": row.failed or 0,
            "pending": row.pending or 0,
            "ready_to_embed": row.ready_to_embed or 0,
            "processing": row.processing or 0,
            "completed": row.completed or 0,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
            "samples": [
                {
                    "id": str(item.id),
                    "title": item.title,
                    "content_type": item.content_type,
                    "processing_status": item.processing_status,
                }
                for item in sample_result.all()
            ],
        })

    return {"items": batches, "total": total, "page": page, "page_size": page_size}


@router.post("/batches/{batch_id}/actions", response_model=dict)
async def run_import_batch_action(
    batch_id: str,
    body: ImportBatchAction,
    db: AsyncSession = Depends(get_db),
):
    from app.services.task_queue import enqueue

    brain_uuid = _parse_brain_uuid(body.brain_id)
    await _ensure_brain_exists(db, brain_uuid)

    batch_id_expr = Content.extra_meta["import_batch_id"].astext
    conditions = [
        Content.extra_meta.is_not(None),
        batch_id_expr == batch_id,
        Content.is_deleted == False,
    ]
    if brain_uuid:
        conditions.append(Content.brain_id == brain_uuid)

    if body.action == "chunk_pending":
        conditions.append(Content.processing_status.in_(("pending", "failed")))
        task_type = "chunk"
        priority = 0
    elif body.action == "embed_ready":
        conditions.append(Content.processing_status.in_(("chunked", "partial")))
        task_type = "embed"
        priority = 1
    else:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail=f"Unsupported import batch action: {body.action}")

    result = await db.execute(select(Content.id).where(*conditions))
    content_ids = [str(row[0]) for row in result.all()]
    failed: list[dict] = []
    success = 0
    for content_id in content_ids:
        try:
            await enqueue(content_id, task_type=task_type, priority=priority, db=db)
            success += 1
        except Exception as exc:
            failed.append({"content_id": content_id, "error": str(exc)})

    return {
        "status": "queued",
        "action": body.action,
        "total": len(content_ids),
        "success": success,
        "failed": failed,
    }
