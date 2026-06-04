"""文件管理 Service"""

import hashlib
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.models import Content


settings = get_settings()


def _compute_md5(file_path: Path) -> str:
    """计算文件 MD5"""
    h = hashlib.md5()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def _get_storage_dir() -> Path:
    """获取存储根目录并确保存在"""
    root = Path(settings.file_storage_root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def _infer_content_type(filename: str) -> str:
    """根据扩展名推断内容类型"""
    ext = Path(filename).suffix.lower()
    image_exts = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".heic", ".heif"}
    video_exts = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv", ".wmv"}
    audio_exts = {".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a", ".wma"}
    pdf_exts = {".pdf"}
    doc_exts = {".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".md", ".txt", ".csv", ".json", ".xml", ".html", ".htm"}

    if ext in image_exts:
        return "image"
    if ext in video_exts:
        return "video"
    if ext in audio_exts:
        return "audio"
    if ext in pdf_exts:
        return "pdf"
    if ext in doc_exts:
        return "doc"
    return "other"


class FileService:

    def __init__(self, db: AsyncSession):
        self.db = db

    async def upload(self, file: UploadFile, brain_id: uuid.UUID | None = None) -> Content:
        """上传文件：存储到磁盘 + 写入数据库"""
        storage_dir = _get_storage_dir()

        # 按日期分目录
        today = datetime.now().strftime("%Y-%m-%d")
        date_dir = storage_dir / today
        date_dir.mkdir(parents=True, exist_ok=True)

        # 生成唯一文件名
        ext = Path(file.filename).suffix if file.filename else ""
        unique_name = f"{uuid.uuid4().hex}{ext}"
        file_path = date_dir / unique_name

        # 写入磁盘
        content_bytes = await file.read()
        file_path.write_bytes(content_bytes)
        file_size = len(content_bytes)

        # 计算 MD5
        file_md5 = _compute_md5(file_path)

        # MD5 去重：查找已存在的相同文件
        existing = await self.db.execute(
            select(Content).where(
                Content.file_md5 == file_md5,
                Content.is_deleted == False,
            ).limit(1)
        )
        duplicate = existing.scalar_one_or_none()

        content_type = _infer_content_type(file.filename or "unknown")
        title = Path(file.filename).stem if file.filename else "untitled"

        if duplicate:
            # 复用已有文件路径，删除刚写入的重复文件
            file_path.unlink(missing_ok=True)

            content = Content(
                id=uuid.uuid4(),
                title=title,
                content_type=content_type,
                source_type="upload",
                file_path=duplicate.file_path,  # 复用路径
                file_size=duplicate.file_size,
                file_md5=file_md5,
                brain_id=brain_id,
            )
        else:
            content = Content(
                id=uuid.uuid4(),
                title=title,
                content_type=content_type,
                source_type="upload",
                file_path=str(file_path.relative_to(storage_dir)),
                file_size=file_size,
                file_md5=file_md5,
                brain_id=brain_id,
            )

        self.db.add(content)
        await self.db.flush()
        await self.db.refresh(content)

        # 不再自动加入处理队列，用户需要手动触发智能分块
        # 状态保持为 pending，等待用户手动操作

        return content

    async def list_files(
        self,
        content_type: str | None = None,
        brain_id: uuid.UUID | None = None,
        category_id: uuid.UUID | None = None,
        is_deleted: bool = False,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[Content], int]:
        """列出文件/内容"""
        from app.models.models import ContentCategory
        conditions = [Content.is_deleted == is_deleted]
        if content_type:
            conditions.append(Content.content_type == content_type)
        if brain_id is not None:
            conditions.append(Content.brain_id == brain_id)

        # category 过滤：JOIN content_categories 表
        base_query = select(Content)
        if category_id is not None:
            base_query = base_query.join(
                ContentCategory, Content.id == ContentCategory.content_id
            ).where(ContentCategory.category_id == category_id)

        # 总数
        count_query = select(func.count(Content.id))
        if category_id is not None:
            count_query = count_query.join(
                ContentCategory, Content.id == ContentCategory.content_id
            ).where(ContentCategory.category_id == category_id)
        count_query = count_query.where(*conditions)
        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0

        # 分页
        query = (
            base_query
            .where(*conditions)
            .order_by(Content.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        result = await self.db.execute(query)
        items = list(result.scalars().all())

        return items, total

    async def get_by_id(self, content_id: uuid.UUID) -> Content | None:
        """按 ID 获取内容"""
        result = await self.db.execute(
            select(Content).where(Content.id == content_id)
        )
        return result.scalar_one_or_none()

    async def soft_delete(self, content_id: uuid.UUID) -> Content | None:
        """软删除内容"""
        content = await self.get_by_id(content_id)
        if content is None:
            return None
        content.is_deleted = True
        content.deleted_at = datetime.now(timezone.utc)
        await self.db.flush()
        await self.db.refresh(content)
        return content

    async def create_content(self, data: dict) -> Content:
        """创建内容条目（笔记等非上传场景）"""
        content = Content(
            id=uuid.uuid4(),
            **data,
        )
        self.db.add(content)
        await self.db.flush()
        await self.db.refresh(content)
        return content

    async def update_content(self, content_id: uuid.UUID, data: dict) -> Content | None:
        """更新内容"""
        content = await self.get_by_id(content_id)
        if content is None:
            return None
        for key, value in data.items():
            if value is not None:
                setattr(content, key, value)
        await self.db.flush()
        await self.db.refresh(content)
        return content
