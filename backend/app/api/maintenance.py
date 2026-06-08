"""Data maintenance and health checks."""

import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import Content, FunctionBindingConfig, ProcessingTask, ProviderConfig

router = APIRouter(prefix="/api/maintenance", tags=["maintenance"])

TEST_PROVIDER_PATTERNS = (
    re.compile(r"^pytest-"),
    re.compile(r"^restore-provider$"),
    re.compile(r"^mode-provider$"),
)
TEST_BINDING_PATTERNS = (
    re.compile(r"^backup_restore_"),
    re.compile(r"^restore_mode_binding_"),
)
STUCK_STATUSES = ("processing", "chunking", "embedding")


class MaintenanceAction(BaseModel):
    action: str


def _is_test_provider(name: str) -> bool:
    return any(pattern.match(name) for pattern in TEST_PROVIDER_PATTERNS)


def _is_test_binding(function: str) -> bool:
    return any(pattern.match(function) for pattern in TEST_BINDING_PATTERNS)


async def _test_provider_ids(db: AsyncSession) -> list:
    result = await db.execute(select(ProviderConfig))
    return [provider.id for provider in result.scalars().all() if _is_test_provider(provider.name)]


@router.get("/summary", response_model=dict)
async def get_maintenance_summary(db: AsyncSession = Depends(get_db)):
    from app.services.storage import StorageService

    orphan = await StorageService.cleanup_orphan_files(db=db, dry_run=True)
    test_provider_ids = await _test_provider_ids(db)

    bindings_result = await db.execute(select(FunctionBindingConfig))
    bindings = bindings_result.scalars().all()
    test_bindings = [binding for binding in bindings if _is_test_binding(binding.function)]
    invalid_bindings = [
        binding for binding in bindings
        if binding.provider_id is not None and binding.provider_id not in test_provider_ids
        and await db.get(ProviderConfig, binding.provider_id) is None
    ]

    unassigned_total = await db.scalar(select(func.count(Content.id)).where(Content.brain_id.is_(None))) or 0
    unassigned_active = await db.scalar(
        select(func.count(Content.id)).where(Content.brain_id.is_(None), Content.is_deleted == False)
    ) or 0
    unassigned_deleted = await db.scalar(
        select(func.count(Content.id)).where(Content.brain_id.is_(None), Content.is_deleted == True)
    ) or 0
    recycle_count = await db.scalar(select(func.count(Content.id)).where(Content.is_deleted == True)) or 0

    cutoff = datetime.now(timezone.utc) - timedelta(minutes=30)
    stuck_contents = await db.scalar(
        select(func.count(Content.id)).where(Content.processing_status.in_(STUCK_STATUSES), Content.updated_at < cutoff)
    ) or 0
    stale_tasks = await db.scalar(
        select(func.count(ProcessingTask.id)).where(ProcessingTask.status.in_(("queued", "processing")), ProcessingTask.created_at < cutoff)
    ) or 0

    return {
        "orphan_files": {
            "count": orphan["orphan_count"],
            "bytes": orphan["orphan_bytes"],
            "samples": orphan["samples"],
        },
        "test_data": {
            "providers": len(test_provider_ids),
            "bindings": len(test_bindings),
        },
        "invalid_config": {
            "bindings": len(invalid_bindings),
        },
        "unassigned": {
            "total": unassigned_total,
            "active": unassigned_active,
            "deleted": unassigned_deleted,
        },
        "recycle": {
            "deleted": recycle_count,
        },
        "processing": {
            "stuck_contents": stuck_contents,
            "stale_tasks": stale_tasks,
        },
    }


@router.post("/actions", response_model=dict)
async def run_maintenance_action(body: MaintenanceAction, db: AsyncSession = Depends(get_db)):
    if body.action == "cleanup_orphans":
        from app.services.storage import StorageService

        return await StorageService.cleanup_orphan_files(db=db, dry_run=False)

    if body.action == "cleanup_test_config":
        from app.services.provider import provider_service

        provider_ids = await _test_provider_ids(db)
        for provider_id in provider_ids:
            await provider_service.delete(db, provider_id)

        bindings_result = await db.execute(select(FunctionBindingConfig))
        deleted_bindings = 0
        for binding in bindings_result.scalars().all():
            if _is_test_binding(binding.function):
                await db.delete(binding)
                deleted_bindings += 1

        await db.commit()
        return {
            "status": "ok",
            "deleted_providers": len(provider_ids),
            "deleted_bindings": deleted_bindings,
        }

    raise HTTPException(status_code=400, detail=f"Unsupported maintenance action: {body.action}")
