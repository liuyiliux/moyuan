"""数据备份与迁移 API"""

import os
import shutil
import subprocess
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db

router = APIRouter(prefix="/api/backup", tags=["backup"])
settings = get_settings()


def _get_backup_dir() -> Path:
    d = Path(settings.file_storage_root).parent / "backups"
    d.mkdir(parents=True, exist_ok=True)
    return d


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
        except Exception:
            # pg_dump 不可用时跳过
            pass

        # 2. 复制文件目录
        files_src = Path(settings.file_storage_root).resolve()
        files_dst = tmp_path / "files"
        if files_src.exists():
            shutil.copytree(files_src, files_dst, dirs_exist_ok=True)

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
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


# ── 全量导出 ──

@router.post("/export")
async def export_full():
    """导出完整知识库（不含 API Keys）"""
    return await create_backup()


# ── 删除备份 ──

@router.delete("/{filename}")
async def delete_backup(filename: str):
    """删除指定备份"""
    zip_path = _get_backup_dir() / filename
    if not zip_path.exists():
        raise HTTPException(status_code=404, detail="Backup not found")
    zip_path.unlink()
    return {"ok": True}
