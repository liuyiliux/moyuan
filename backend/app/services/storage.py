"""存储路径管理 Service"""

import os
import shutil
from pathlib import Path

from app.core.config import get_settings

settings = get_settings()


def resolve_storage_root(root: str | None = None) -> Path:
    value = root or settings.file_storage_root
    path = Path(value)
    if path.is_absolute():
        return path.resolve()
    backend_root = Path(__file__).resolve().parents[2]
    return (backend_root / path).resolve()


class StorageService:
    """管理文件存储根目录"""

    @staticmethod
    def get_config() -> dict:
        """获取当前存储配置"""
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
        """验证路径是否可用"""
        p = resolve_storage_root(path)
        result = {
            "path": str(p),
            "exists": p.exists(),
            "is_dir": p.is_dir() if p.exists() else False,
            "writable": os.access(p, os.W_OK) if p.exists() else False,
        }

        # 尝试创建目录
        if not p.exists():
            try:
                p.mkdir(parents=True, exist_ok=True)
                result["exists"] = True
                result["is_dir"] = True
                result["writable"] = True
                result["created"] = True
                p.rmdir()  # 清理测试目录
            except OSError as e:
                result["error"] = str(e)
                result["created"] = False

        return result

    @staticmethod
    def update_storage_root(new_root: str) -> dict:
        """更新存储根目录（更新 .env 或运行时配置）"""
        p = resolve_storage_root(new_root)
        if not p.exists():
            p.mkdir(parents=True, exist_ok=True)

        if not os.access(p, os.W_OK):
            raise ValueError(f"路径不可写: {p}")

        # 更新环境变量（运行时生效，需要重启应用才完全生效）
        import os as _os
        _os.environ["FILE_STORAGE_ROOT"] = str(p)

        # 使 lru_cache 失效
        from app.core.config import get_settings
        get_settings.cache_clear()

        return {"storage_root": str(p), "note": "更新后需重启应用以完全生效"}
