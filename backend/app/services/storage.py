"""Storage root management and file migration."""

import os
import shutil
from pathlib import Path

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.models import Content, ContentChunk

settings = get_settings()


def resolve_storage_root(root: str | None = None) -> Path:
    value = root or settings.file_storage_root
    path = Path(value)
    if path.is_absolute():
        return path.resolve()
    backend_root = Path(__file__).resolve().parents[2]
    return (backend_root / path).resolve()


class StorageService:
    """Manage local file storage configuration."""

    @staticmethod
    def get_config() -> dict:
        root = resolve_storage_root()
        exists = root.exists()

        total, used, free = 0, 0, 0
        if exists:
            usage = shutil.disk_usage(root)
            total, used, free = usage.total, usage.used, usage.free

        return {
            "storage_root": str(root),
            "exists": exists,
            "disk_total": total,
            "disk_used": used,
            "disk_free": free,
        }

    @staticmethod
    def validate_path(path: str) -> dict:
        p = resolve_storage_root(path)
        result = {
            "path": str(p),
            "exists": p.exists(),
            "is_dir": p.is_dir() if p.exists() else False,
            "writable": os.access(p, os.W_OK) if p.exists() else False,
        }

        if not p.exists():
            try:
                p.mkdir(parents=True, exist_ok=True)
                result["exists"] = True
                result["is_dir"] = True
                result["writable"] = True
                result["created"] = True
                p.rmdir()
            except OSError as e:
                result["error"] = str(e)
                result["created"] = False

        return result

    @staticmethod
    def update_storage_root(new_root: str) -> dict:
        p = resolve_storage_root(new_root)
        if not p.exists():
            p.mkdir(parents=True, exist_ok=True)

        if not os.access(p, os.W_OK):
            raise ValueError(f"Storage path is not writable: {p}")

        os.environ["FILE_STORAGE_ROOT"] = str(p)
        from app.core.config import get_settings

        get_settings.cache_clear()

        return {"storage_root": str(p), "note": "Storage path updated. Restart the app if any worker still uses the old path."}

    @staticmethod
    def _relative_storage_path(path_value: str, root: Path) -> str | None:
        path_value = path_value.strip()
        if not path_value:
            return None

        candidate = Path(path_value)
        if candidate.is_absolute():
            try:
                return candidate.resolve().relative_to(root).as_posix()
            except ValueError:
                return candidate.name

        normalized = Path(*candidate.parts).as_posix()
        if normalized.startswith("../") or normalized == "..":
            return None
        return normalized

    @staticmethod
    def _safe_join(root: Path, relative_path: str) -> Path | None:
        target = (root / relative_path).resolve()
        try:
            target.relative_to(root)
        except ValueError:
            return None
        return target

    @staticmethod
    def _copy_one(source_root: Path, target_root: Path, relative_path: str) -> str:
        source = StorageService._safe_join(source_root, relative_path)
        target = StorageService._safe_join(target_root, relative_path)
        if source is None or target is None:
            return "unsafe"
        if not source.exists() or not source.is_file():
            return "missing"
        if target.exists() and target.stat().st_size == source.stat().st_size:
            return "skipped"

        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        return "copied"

    @staticmethod
    async def migrate_files(db: AsyncSession, new_root: str, old_root: str | None = None) -> dict:
        """Copy referenced files to a new root and keep DB paths relative.

        The old files are deliberately left in place. Users can remove the old
        directory manually after checking the migration result.
        """
        source_root = resolve_storage_root(old_root).resolve()
        target_root = resolve_storage_root(new_root).resolve()
        if source_root == target_root:
            raise ValueError("Source and target storage paths are the same")

        target_root.mkdir(parents=True, exist_ok=True)
        if not os.access(target_root, os.W_OK):
            raise ValueError(f"Storage path is not writable: {target_root}")

        copied = skipped = missing = unsafe = updated_paths = 0
        errors: list[dict] = []
        seen: set[str] = set()

        def queue_copy(path_value: str | None) -> str | None:
            nonlocal copied, skipped, missing, unsafe
            if not path_value:
                return None

            relative_path = StorageService._relative_storage_path(path_value, source_root)
            if relative_path is None:
                unsafe += 1
                errors.append({"path": path_value, "error": "unsafe path"})
                return None

            if relative_path not in seen:
                seen.add(relative_path)
                try:
                    status = StorageService._copy_one(source_root, target_root, relative_path)
                    if status == "copied":
                        copied += 1
                    elif status == "skipped":
                        skipped += 1
                    elif status == "missing":
                        missing += 1
                    else:
                        unsafe += 1
                        errors.append({"path": path_value, "error": status})
                except OSError as exc:
                    errors.append({"path": path_value, "error": str(exc)})

            return relative_path

        contents_result = await db.execute(
            select(Content.id, Content.file_path).where(Content.file_path.is_not(None))
        )
        for content_id, file_path in contents_result.all():
            normalized = queue_copy(file_path)
            if normalized and normalized != file_path:
                await db.execute(
                    update(Content)
                    .where(Content.id == content_id)
                    .values(file_path=normalized)
                )
                updated_paths += 1

        chunks_result = await db.execute(
            select(ContentChunk.id, ContentChunk.image_path).where(ContentChunk.image_path.is_not(None))
        )
        for chunk_id, image_path in chunks_result.all():
            normalized = queue_copy(image_path)
            if normalized and normalized != image_path:
                await db.execute(
                    update(ContentChunk)
                    .where(ContentChunk.id == chunk_id)
                    .values(image_path=normalized)
                )
                updated_paths += 1

        await db.commit()
        config = StorageService.update_storage_root(str(target_root))

        return {
            "status": "ok",
            "source_root": str(source_root),
            "storage_root": config["storage_root"],
            "copied": copied,
            "skipped": skipped,
            "missing": missing,
            "unsafe": unsafe,
            "updated_paths": updated_paths,
            "total_referenced": len(seen),
            "errors": errors[:20],
            "note": "Files were copied to the new storage path. Original files were kept in place.",
        }

    @staticmethod
    async def cleanup_orphan_files(db: AsyncSession, *, dry_run: bool = True) -> dict:
        """Find or delete files under storage root that are not referenced by DB rows."""
        root = resolve_storage_root().resolve()
        if not root.exists():
            return {
                "status": "ok",
                "storage_root": str(root),
                "dry_run": dry_run,
                "orphan_count": 0,
                "orphan_bytes": 0,
                "deleted_count": 0,
                "deleted_bytes": 0,
                "errors": [],
                "samples": [],
            }

        referenced: set[str] = set()
        contents_result = await db.execute(
            select(Content.file_path).where(Content.file_path.is_not(None))
        )
        for (file_path,) in contents_result.all():
            normalized = StorageService._relative_storage_path(file_path, root)
            if normalized:
                referenced.add(normalized)

        chunks_result = await db.execute(
            select(ContentChunk.image_path).where(ContentChunk.image_path.is_not(None))
        )
        for (image_path,) in chunks_result.all():
            normalized = StorageService._relative_storage_path(image_path, root)
            if normalized:
                referenced.add(normalized)

        orphan_count = orphan_bytes = deleted_count = deleted_bytes = 0
        errors: list[dict] = []
        samples: list[dict] = []

        for path in root.rglob("*"):
            if not path.is_file():
                continue
            try:
                rel = path.resolve().relative_to(root).as_posix()
            except ValueError:
                continue
            if rel in referenced:
                continue

            size = path.stat().st_size
            orphan_count += 1
            orphan_bytes += size
            if len(samples) < 20:
                samples.append({"path": rel, "size": size})

            if dry_run:
                continue
            try:
                path.unlink()
                deleted_count += 1
                deleted_bytes += size
            except OSError as exc:
                errors.append({"path": rel, "error": str(exc)})

        if not dry_run:
            for directory in sorted(
                (p for p in root.rglob("*") if p.is_dir()),
                key=lambda p: len(p.parts),
                reverse=True,
            ):
                try:
                    directory.rmdir()
                except OSError:
                    pass

        return {
            "status": "ok",
            "storage_root": str(root),
            "dry_run": dry_run,
            "orphan_count": orphan_count,
            "orphan_bytes": orphan_bytes,
            "deleted_count": deleted_count,
            "deleted_bytes": deleted_bytes,
            "errors": errors[:20],
            "samples": samples,
        }
