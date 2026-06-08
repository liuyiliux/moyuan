"""数据备份与迁移 API"""

import json
import os
import shutil
import subprocess
import tempfile
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.models.models import Brain, FunctionBindingConfig, ProviderConfig

router = APIRouter(prefix="/api/backup", tags=["backup"])
settings = get_settings()
BACKUP_FORMAT_VERSION = 1


def _get_backup_dir() -> Path:
    d = Path(settings.file_storage_root).parent / "backups"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _safe_backup_path(filename: str) -> Path:
    backup_dir = _get_backup_dir().resolve()
    candidate = (backup_dir / filename).resolve()
    if candidate.parent != backup_dir or candidate.suffix.lower() != ".zip":
        raise HTTPException(status_code=400, detail="Invalid backup filename")
    return candidate


def _parse_pg_url(db_url: str) -> tuple[str, str, str, str, dict]:
    url = db_url.replace("postgresql://", "")
    user_pass, host_db = url.split("@") if "@" in url else ("", url)
    user = user_pass.split(":")[0] if ":" in user_pass else ""
    password = user_pass.split(":")[1] if ":" in user_pass else ""
    host_port = host_db.split("/")[0] if "/" in host_db else "localhost"
    db_name = host_db.split("/")[1] if "/" in host_db else "moyuan"
    host = host_port.split(":")[0] if ":" in host_port else host_port
    port = host_port.split(":")[1] if ":" in host_port else "5432"
    env = os.environ.copy()
    if password:
        env["PGPASSWORD"] = password
    return host, port, user, db_name, env


def _redact_provider_api_keys_from_sql(sql_path: Path) -> int:
    if not sql_path.exists() or sql_path.stat().st_size == 0:
        return 0

    lines = sql_path.read_text(encoding="utf-8", errors="ignore").splitlines()
    redacted = 0
    in_provider_copy = False
    api_key_index: int | None = None
    output: list[str] = []

    for line in lines:
        if line.startswith("COPY ") and "provider_configs" in line and "api_key_encrypted" in line:
            columns_part = line.split("(", 1)[1].rsplit(")", 1)[0]
            columns = [col.strip().strip('"') for col in columns_part.split(",")]
            api_key_index = columns.index("api_key_encrypted") if "api_key_encrypted" in columns else None
            in_provider_copy = api_key_index is not None
            output.append(line)
            continue

        if in_provider_copy:
            if line == r"\.":
                in_provider_copy = False
                api_key_index = None
                output.append(line)
                continue
            parts = line.split("\t")
            if api_key_index is not None and api_key_index < len(parts) and parts[api_key_index] != r"\N":
                parts[api_key_index] = r"\N"
                redacted += 1
            output.append("\t".join(parts))
            continue

        output.append(line)

    if redacted:
        sql_path.write_text("\n".join(output) + "\n", encoding="utf-8")
    return redacted


def _read_backup_json(zf: zipfile.ZipFile, name: str):
    try:
        return json.loads(zf.read(name).decode("utf-8"))
    except KeyError:
        return None
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail=f"Invalid JSON in backup member: {name}")


def _inspect_backup_zip(zip_path: Path) -> dict:
    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            names = zf.namelist()
            root = Path("_backup").resolve()
            for member in zf.infolist():
                target = (root / member.filename).resolve()
                try:
                    target.relative_to(root)
                except ValueError:
                    raise HTTPException(status_code=400, detail="Unsafe backup archive path")

            manifest = _read_backup_json(zf, "manifest.json")
            providers = _read_backup_json(zf, "config/providers.json") or []
            bindings = _read_backup_json(zf, "config/function_bindings.json") or []
            brains = _read_backup_json(zf, "config/brains.json") or []
            database_info = zf.getinfo("database.sql") if "database.sql" in names else None

            return {
                "filename": zip_path.name,
                "size": zip_path.stat().st_size,
                "created_at": datetime.fromtimestamp(zip_path.stat().st_mtime, tz=timezone.utc).isoformat(),
                "format_version": manifest.get("format_version") if isinstance(manifest, dict) else None,
                "manifest": manifest,
                "has_database_sql": database_info is not None and database_info.file_size > 0,
                "file_count": sum(1 for name in names if name.startswith("files/") and not name.endswith("/")),
                "provider_configs": len(providers) if isinstance(providers, list) else 0,
                "function_bindings": len(bindings) if isinstance(bindings, list) else 0,
                "brain_configs": len(brains) if isinstance(brains, list) else 0,
                "api_keys_included": (
                    bool(manifest.get("security", {}).get("api_keys_included"))
                    if isinstance(manifest, dict)
                    else None
                ),
            }
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Invalid backup archive")


def _read_backup_config_lists(zip_path: Path) -> tuple[list, list, list]:
    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            providers = _read_backup_json(zf, "config/providers.json") or []
            bindings = _read_backup_json(zf, "config/function_bindings.json") or []
            brains = _read_backup_json(zf, "config/brains.json") or []
            return (
                providers if isinstance(providers, list) else [],
                bindings if isinstance(bindings, list) else [],
                brains if isinstance(brains, list) else [],
            )
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Invalid backup archive")


async def _preview_sanitized_config_restore(zip_path: Path, db: AsyncSession) -> dict:
    providers, bindings, brains = _read_backup_config_lists(zip_path)
    preview = {
        "providers": {"new": 0, "overwrite": 0, "invalid": 0},
        "function_bindings": {"new": 0, "overwrite": 0, "invalid": 0},
        "brains": {"new": 0, "overwrite": 0, "invalid": 0},
    }

    for item in providers:
        if not isinstance(item, dict):
            preview["providers"]["invalid"] += 1
            continue
        provider_id = _parse_backup_uuid(item.get("id"))
        name = str(item.get("name") or "").strip()
        provider_type = str(item.get("provider_type") or "").strip()
        if provider_id is None or not name or not provider_type:
            preview["providers"]["invalid"] += 1
            continue
        if await db.get(ProviderConfig, provider_id) is None:
            preview["providers"]["new"] += 1
        else:
            preview["providers"]["overwrite"] += 1

    for item in bindings:
        if not isinstance(item, dict):
            preview["function_bindings"]["invalid"] += 1
            continue
        function = str(item.get("function") or "").strip()
        if not function:
            preview["function_bindings"]["invalid"] += 1
            continue
        result = await db.execute(select(FunctionBindingConfig).where(FunctionBindingConfig.function == function))
        if result.scalar_one_or_none() is None:
            preview["function_bindings"]["new"] += 1
        else:
            preview["function_bindings"]["overwrite"] += 1

    for item in brains:
        if not isinstance(item, dict):
            preview["brains"]["invalid"] += 1
            continue
        brain_id = _parse_backup_uuid(item.get("id"))
        name = str(item.get("name") or "").strip()
        if brain_id is None or not name:
            preview["brains"]["invalid"] += 1
            continue
        if await db.get(Brain, brain_id) is None:
            preview["brains"]["new"] += 1
        else:
            preview["brains"]["overwrite"] += 1

    return preview


def _load_extracted_json(tmp_path: Path, relative_path: str):
    path = tmp_path / relative_path
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail=f"Invalid JSON in backup member: {relative_path}")
    return data if isinstance(data, list) else []


def _parse_backup_uuid(value) -> uuid.UUID | None:
    if not value:
        return None
    try:
        return uuid.UUID(str(value))
    except ValueError:
        return None


async def _restore_sanitized_config(tmp_path: Path, db: AsyncSession) -> dict:
    providers = _load_extracted_json(tmp_path, "config/providers.json")
    bindings = _load_extracted_json(tmp_path, "config/function_bindings.json")
    brains = _load_extracted_json(tmp_path, "config/brains.json")
    restored = {"providers": 0, "function_bindings": 0, "brains": 0}

    for item in providers:
        if not isinstance(item, dict):
            continue
        provider_id = _parse_backup_uuid(item.get("id"))
        name = str(item.get("name") or "").strip()
        provider_type = str(item.get("provider_type") or "").strip()
        if provider_id is None or not name or not provider_type:
            continue
        provider = await db.get(ProviderConfig, provider_id)
        if provider is None:
            provider = ProviderConfig(id=provider_id, name=name, provider_type=provider_type)
            db.add(provider)
        provider.name = name
        provider.provider_type = provider_type
        provider.base_url = item.get("base_url")
        provider.default_models = item.get("default_models")
        provider.extra_params = item.get("extra_params")
        provider.is_active = bool(item.get("is_active", True))
        restored["providers"] += 1

    await db.flush()

    for item in bindings:
        if not isinstance(item, dict):
            continue
        function = str(item.get("function") or "").strip()
        if not function:
            continue
        provider_id = _parse_backup_uuid(item.get("provider_id"))
        if provider_id is not None and await db.get(ProviderConfig, provider_id) is None:
            provider_id = None
        result = await db.execute(select(FunctionBindingConfig).where(FunctionBindingConfig.function == function))
        binding = result.scalar_one_or_none()
        if binding is None:
            binding_id = _parse_backup_uuid(item.get("id")) or uuid.uuid4()
            binding = FunctionBindingConfig(id=binding_id, function=function)
            db.add(binding)
        binding.provider_id = provider_id
        binding.model = item.get("model")
        binding.extra_params = item.get("extra_params")
        restored["function_bindings"] += 1

    for item in brains:
        if not isinstance(item, dict):
            continue
        brain_id = _parse_backup_uuid(item.get("id"))
        name = str(item.get("name") or "").strip()
        if brain_id is None or not name:
            continue
        brain = await db.get(Brain, brain_id)
        if brain is None:
            brain = Brain(id=brain_id, name=name)
            db.add(brain)
        brain.name = name
        brain.description = item.get("description")
        brain.icon = item.get("icon")
        brain.is_default = bool(item.get("is_default", False))
        brain.archived = bool(item.get("archived", False))
        brain.config = item.get("config")
        restored["brains"] += 1

    await db.commit()
    return restored


async def _write_sanitized_export_metadata(tmp_path: Path, db: AsyncSession, backup_name: str, created_at: str) -> dict:
    providers_result = await db.execute(select(ProviderConfig).order_by(ProviderConfig.created_at))
    providers = providers_result.scalars().all()
    bindings_result = await db.execute(select(FunctionBindingConfig).order_by(FunctionBindingConfig.function))
    bindings = bindings_result.scalars().all()
    brains_result = await db.execute(select(Brain).order_by(Brain.created_at, Brain.name))
    brains = brains_result.scalars().all()

    config_dir = tmp_path / "config"
    config_dir.mkdir(parents=True, exist_ok=True)
    providers_payload = [
        {
            "id": str(provider.id),
            "name": provider.name,
            "provider_type": provider.provider_type,
            "base_url": provider.base_url,
            "api_key": None,
            "api_key_encrypted": None,
            "default_models": provider.default_models,
            "extra_params": provider.extra_params,
            "is_active": provider.is_active,
            "created_at": provider.created_at.isoformat() if provider.created_at else None,
            "updated_at": provider.updated_at.isoformat() if provider.updated_at else None,
        }
        for provider in providers
    ]
    bindings_payload = [
        {
            "id": str(binding.id),
            "function": binding.function,
            "provider_id": str(binding.provider_id) if binding.provider_id else None,
            "model": binding.model,
            "extra_params": binding.extra_params,
            "created_at": binding.created_at.isoformat() if binding.created_at else None,
            "updated_at": binding.updated_at.isoformat() if binding.updated_at else None,
        }
        for binding in bindings
    ]
    brains_payload = [
        {
            "id": str(brain.id),
            "name": brain.name,
            "description": brain.description,
            "icon": brain.icon,
            "is_default": brain.is_default,
            "archived": brain.archived,
            "config": brain.config,
            "created_at": brain.created_at.isoformat() if brain.created_at else None,
            "updated_at": brain.updated_at.isoformat() if brain.updated_at else None,
        }
        for brain in brains
    ]
    (config_dir / "providers.json").write_text(
        json.dumps(providers_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (config_dir / "function_bindings.json").write_text(
        json.dumps(bindings_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (config_dir / "brains.json").write_text(
        json.dumps(brains_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    manifest = {
        "app": "moyuan",
        "backup_name": backup_name,
        "format_version": BACKUP_FORMAT_VERSION,
        "created_at": created_at,
        "contains": {
            "database_sql": True,
            "files": True,
            "sanitized_config": True,
            "brain_configs": True,
        },
        "security": {
            "api_keys_included": False,
            "provider_api_keys_redacted": True,
        },
    }
    (tmp_path / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return manifest


# ── 备份列表 ──

@router.get("")
async def list_backups():
    """列出所有备份"""
    backup_dir = _get_backup_dir()
    files = sorted(backup_dir.glob("*.zip"), key=lambda f: f.stat().st_mtime, reverse=True)
    return {
        "backups": [
            {
                "filename": f.name,
                "size": f.stat().st_size,
                "created_at": datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc).isoformat(),
            }
            for f in files
        ]
    }


# ── 创建备份 ──

@router.post("")
async def create_backup(db: AsyncSession = Depends(get_db)):
    """创建完整备份（数据库 + 文件）"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_name = f"moyuan_backup_{timestamp}"
    backup_dir = _get_backup_dir()
    zip_path = backup_dir / f"{backup_name}.zip"
    created_at = datetime.now(timezone.utc).isoformat()

    # 读取数据库 URL
    db_url = settings.database_url_sync  # 同步版本用于 pg_dump

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)

        # 1. pg_dump
        sql_path = tmp_path / "database.sql"
        try:
            # 解析 URL 获取参数
            # format: postgresql://user:pass@host:port/db
            url = db_url.replace("postgresql://", "")
            user_pass, host_db = url.split("@") if "@" in url else ("", url)
            user = user_pass.split(":")[0] if ":" in user_pass else ""
            password = user_pass.split(":")[1] if ":" in user_pass else ""
            host_port = host_db.split("/")[0] if "/" in host_db else "localhost"
            db_name = host_db.split("/")[1] if "/" in host_db else "moyuan"
            host = host_port.split(":")[0] if ":" in host_port else host_port
            port = host_port.split(":")[1] if ":" in host_port else "5432"

            env = os.environ.copy()
            if password:
                env["PGPASSWORD"] = password

            subprocess.run(
                ["pg_dump", "-h", host, "-p", port, "-U", user, "-d", db_name, "-f", str(sql_path)],
                env=env, check=False, capture_output=True, timeout=60,
            )
            _redact_provider_api_keys_from_sql(sql_path)
        except Exception:
            # pg_dump 不可用时跳过
            pass

        # 2. 复制文件目录
        files_src = Path(settings.file_storage_root).resolve()
        files_dst = tmp_path / "files"
        if files_src.exists():
            shutil.copytree(files_src, files_dst, dirs_exist_ok=True)

        manifest = await _write_sanitized_export_metadata(tmp_path, db, backup_name, created_at)

        # 3. 打包
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for f in tmp_path.rglob("*"):
                if f.is_file():
                    zf.write(f, f.relative_to(tmp_path))

    size = zip_path.stat().st_size
    return {
        "status": "created",
        "filename": zip_path.name,
        "size": size,
        "created_at": created_at,
        "format_version": manifest["format_version"],
        "api_keys_included": False,
    }


# ── 全量导出 ──

@router.post("/export")
async def export_full(db: AsyncSession = Depends(get_db)):
    """导出完整知识库（不含 API Keys）"""
    return await create_backup(db)


# ── 删除备份 ──

@router.get("/{filename}/inspect")
async def inspect_backup(filename: str, db: AsyncSession = Depends(get_db)):
    """Inspect backup manifest and sanitized config metadata before restore."""
    zip_path = _safe_backup_path(filename)
    if not zip_path.exists():
        raise HTTPException(status_code=404, detail="Backup not found")
    info = _inspect_backup_zip(zip_path)
    info["config_preview"] = await _preview_sanitized_config_restore(zip_path, db)
    return info


@router.post("/{filename}/restore")
async def restore_backup(
    filename: str,
    mode: str = Query("all", pattern="^(all|files|config)$"),
    db: AsyncSession = Depends(get_db),
):
    """Restore files and optional database.sql from a backup archive."""
    zip_path = _safe_backup_path(filename)
    if not zip_path.exists():
        raise HTTPException(status_code=404, detail="Backup not found")

    restored_files = 0
    database_status = "missing" if mode == "all" else "skipped"
    database_detail = None
    config_status = "skipped"
    restored_config = {"providers": 0, "function_bindings": 0, "brains": 0}

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp).resolve()
        with zipfile.ZipFile(zip_path, "r") as zf:
            for member in zf.infolist():
                target = (tmp_path / member.filename).resolve()
                try:
                    target.relative_to(tmp_path)
                except ValueError:
                    raise HTTPException(status_code=400, detail="Unsafe backup archive path")
            zf.extractall(tmp_path)

        files_src = tmp_path / "files"
        files_dst = Path(settings.file_storage_root).resolve()
        if mode in {"all", "files"} and files_src.exists():
            files_dst.mkdir(parents=True, exist_ok=True)
            for item in files_src.rglob("*"):
                if item.is_file():
                    rel = item.relative_to(files_src)
                    target = files_dst / rel
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(item, target)
                    restored_files += 1

        sql_path = tmp_path / "database.sql"
        if mode == "all" and sql_path.exists() and sql_path.stat().st_size > 0:
            try:
                host, port, user, db_name, env = _parse_pg_url(settings.database_url_sync)
                result = subprocess.run(
                    ["psql", "-h", host, "-p", port, "-U", user, "-d", db_name, "-f", str(sql_path)],
                    env=env,
                    check=False,
                    capture_output=True,
                    timeout=120,
                )
                database_status = "restored" if result.returncode == 0 else "failed"
                if result.returncode != 0:
                    database_detail = (result.stderr or result.stdout).decode("utf-8", errors="ignore")[:500]
            except Exception as exc:
                database_status = "failed"
                database_detail = str(exc)[:500]

        if mode == "config" or (mode == "all" and database_status != "restored"):
            restored_config = await _restore_sanitized_config(tmp_path, db)
            config_status = "restored" if any(restored_config.values()) else "missing"

    return {
        "status": "restored",
        "filename": zip_path.name,
        "mode": mode,
        "restored_files": restored_files,
        "database_status": database_status,
        "database_detail": database_detail,
        "config_status": config_status,
        "restored_config": restored_config,
        "storage_root": str(Path(settings.file_storage_root).resolve()),
    }


@router.delete("/{filename}")
async def delete_backup(filename: str):
    """删除指定备份"""
    zip_path = _safe_backup_path(filename)
    if not zip_path.exists():
        raise HTTPException(status_code=404, detail="Backup not found")
    zip_path.unlink()
    return {"ok": True}
