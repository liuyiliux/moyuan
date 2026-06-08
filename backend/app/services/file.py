"""文件管理 Service"""

import hashlib
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from pathlib import PurePosixPath

from fastapi import UploadFile
from sqlalchemy import delete, select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.models import Content


settings = get_settings()
logger = logging.getLogger(__name__)


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


def _normalize_import_relative_path(relative_path: str | None) -> PurePosixPath | None:
    if not relative_path:
        return None
    raw = relative_path.replace("\\", "/").strip().strip("/")
    if not raw:
        return None
    path = PurePosixPath(raw)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        raise ValueError("Invalid import_relative_path")
    return path


def _normalize_import_batch_id(batch_id: str | None) -> str:
    if not batch_id:
        return uuid.uuid4().hex
    clean = "".join(ch for ch in batch_id if ch.isalnum() or ch in {"-", "_"}).strip("-_")
    return clean[:64] or uuid.uuid4().hex


class FileService:

    def __init__(self, db: AsyncSession):
        self.db = db

    async def upload(
        self,
        file: UploadFile,
        brain_id: uuid.UUID | None = None,
        import_relative_path: str | None = None,
        import_batch_id: str | None = None,
    ) -> Content:
        """上传文件：存储到磁盘 + 写入数据库"""
        storage_dir = _get_storage_dir()
        relative_import_path = _normalize_import_relative_path(import_relative_path)

        # 按日期分目录
        today = datetime.now().strftime("%Y-%m-%d")
        if relative_import_path:
            batch_id = _normalize_import_batch_id(import_batch_id)
            file_path = storage_dir / "imports" / today / batch_id / Path(*relative_import_path.parts)
            file_path.parent.mkdir(parents=True, exist_ok=True)
            if file_path.exists():
                file_path = file_path.with_name(f"{file_path.stem}-{uuid.uuid4().hex[:8]}{file_path.suffix}")
        else:
            date_dir = storage_dir / today
            date_dir.mkdir(parents=True, exist_ok=True)
            ext = Path(file.filename).suffix if file.filename else ""
            unique_name = f"{uuid.uuid4().hex}{ext}"
            file_path = date_dir / unique_name
            batch_id = None

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

        display_name = relative_import_path.name if relative_import_path else (file.filename or "unknown")
        content_type = _infer_content_type(display_name)
        title = Path(display_name).stem if display_name else "untitled"
        extra_meta = {"original_filename": file.filename} if file.filename else {}
        if relative_import_path:
            extra_meta.update({
                "import_relative_path": relative_import_path.as_posix(),
                "import_root": relative_import_path.parts[0],
                "import_batch_id": batch_id,
            })
        if not extra_meta:
            extra_meta = None

        if duplicate:
            # 复用已有文件路径，删除刚写入的重复文件
            try:
                file_path.unlink(missing_ok=True)
            except OSError as exc:
                logger.warning("Failed to remove duplicate upload temp file %s: %s", file_path, exc)

            content = Content(
                id=uuid.uuid4(),
                title=title,
                content_type=content_type,
                source_type="upload",
                file_path=duplicate.file_path,  # 复用路径
                file_size=duplicate.file_size,
                file_md5=file_md5,
                brain_id=brain_id,
                extra_meta=extra_meta,
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
                extra_meta=extra_meta,
            )

        self.db.add(content)
        await self.db.flush()
        if relative_import_path:
            collection_id = await self._attach_import_collection(content, relative_import_path.parts[0], brain_id)
            category_id = await self._attach_import_categories(content, relative_import_path.parts[:-1], brain_id)
            content.extra_meta = {
                **(content.extra_meta or {}),
                "import_collection_id": str(collection_id),
                "import_category_id": str(category_id) if category_id else None,
            }
            await self.db.flush()
        await self.db.refresh(content)

        # 不再自动加入处理队列，用户需要手动触发智能分块
        # 状态保持为 pending，等待用户手动操作

        return content

    async def _attach_import_collection(
        self,
        content: Content,
        collection_name: str,
        brain_id: uuid.UUID | None,
    ) -> uuid.UUID:
        from app.models.models import Collection, CollectionItem

        conditions = [Collection.name == collection_name]
        if brain_id is None:
            conditions.append(Collection.brain_id.is_(None))
        else:
            conditions.append(Collection.brain_id == brain_id)

        result = await self.db.execute(select(Collection).where(*conditions).limit(1))
        collection = result.scalar_one_or_none()
        if collection is None:
            collection = Collection(
                name=collection_name,
                description="Auto-created from folder import",
                brain_id=brain_id,
            )
            self.db.add(collection)
            await self.db.flush()

        existing = await self.db.execute(
            select(CollectionItem.id).where(
                CollectionItem.collection_id == collection.id,
                CollectionItem.content_id == content.id,
            )
        )
        if existing.scalar_one_or_none() is None:
            max_order = await self.db.execute(
                select(func.coalesce(func.max(CollectionItem.sort_order), 0)).where(
                    CollectionItem.collection_id == collection.id
                )
            )
            self.db.add(
                CollectionItem(
                    collection_id=collection.id,
                    content_id=content.id,
                    sort_order=(max_order.scalar() or 0) + 1,
                )
            )
        return collection.id

    async def _attach_import_categories(
        self,
        content: Content,
        folder_parts: tuple[str, ...],
        brain_id: uuid.UUID | None,
    ) -> uuid.UUID | None:
        from app.models.models import Category, ContentCategory

        parent_id: uuid.UUID | None = None
        category: Category | None = None

        for name in folder_parts:
            conditions = [Category.name == name]
            if parent_id is None:
                conditions.append(Category.parent_id.is_(None))
            else:
                conditions.append(Category.parent_id == parent_id)
            if brain_id is None:
                conditions.append(Category.brain_id.is_(None))
            else:
                conditions.append(Category.brain_id == brain_id)

            result = await self.db.execute(select(Category).where(*conditions).limit(1))
            category = result.scalar_one_or_none()
            if category is None:
                category = Category(name=name, parent_id=parent_id, brain_id=brain_id)
                self.db.add(category)
                await self.db.flush()
            parent_id = category.id

        if category is None:
            return None

        existing = await self.db.execute(
            select(ContentCategory.content_id).where(
                ContentCategory.content_id == content.id,
                ContentCategory.category_id == category.id,
            )
        )
        if existing.scalar_one_or_none() is None:
            self.db.add(ContentCategory(content_id=content.id, category_id=category.id))
        return category.id

    async def list_files(
        self,
        content_type: str | None = None,
        brain_id: uuid.UUID | None = None,
        category_id: uuid.UUID | None = None,
        processing_status: str | None = None,
        study_status: str | None = None,
        q: str | None = None,
        is_deleted: bool = False,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[Content], int]:
        """列出文件/内容"""
        from app.models.models import ContentCategory
        conditions = [Content.is_deleted == is_deleted]
        if content_type:
            conditions.append(Content.content_type == content_type)
        if processing_status:
            conditions.append(Content.processing_status == processing_status)
        if study_status:
            study_status_value = Content.extra_meta["study_status"].astext
            if study_status == "not_started":
                conditions.append(or_(
                    Content.extra_meta.is_(None),
                    study_status_value.is_(None),
                    study_status_value == "not_started",
                ))
            else:
                conditions.append(study_status_value == study_status)
        if q and q.strip():
            keyword = f"%{q.strip()}%"
            conditions.append(or_(
                Content.title.ilike(keyword),
                Content.text_content.ilike(keyword),
                Content.source_url.ilike(keyword),
                Content.file_path.ilike(keyword),
            ))
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
        if "brain_id" in data and data["brain_id"] != content.brain_id:
            await self._cleanup_links_for_brain_move(content.id, data["brain_id"])
        for key, value in data.items():
            if key == "extra_meta":
                if isinstance(value, dict):
                    content.extra_meta = {**(content.extra_meta or {}), **value}
                continue
            if key == "brain_id" or value is not None:
                setattr(content, key, value)
        await self.db.flush()
        await self.db.refresh(content)
        return content

    async def _cleanup_links_for_brain_move(self, content_id: uuid.UUID, target_brain_id: uuid.UUID | None) -> None:
        """移动内容到其他工作区时清理旧工作区的组织关系。"""
        from app.models.models import Category, Collection, CollectionItem, ContentCategory, ContentRelation, ContentTag, Tag

        if target_brain_id is None:
            category_ids = select(Category.id).where(Category.brain_id.is_not(None))
            tag_ids = select(Tag.id).where(Tag.brain_id.is_not(None))
            collection_ids = select(Collection.id).where(Collection.brain_id.is_not(None))
        else:
            category_ids = select(Category.id).where(Category.brain_id.is_not(None), Category.brain_id != target_brain_id)
            tag_ids = select(Tag.id).where(Tag.brain_id.is_not(None), Tag.brain_id != target_brain_id)
            collection_ids = select(Collection.id).where(Collection.brain_id.is_not(None), Collection.brain_id != target_brain_id)

        await self.db.execute(
            delete(ContentCategory).where(
                ContentCategory.content_id == content_id,
                ContentCategory.category_id.in_(category_ids),
            )
        )
        await self.db.execute(
            delete(ContentTag).where(
                ContentTag.content_id == content_id,
                ContentTag.tag_id.in_(tag_ids),
            )
        )
        await self.db.execute(
            delete(CollectionItem).where(
                CollectionItem.content_id == content_id,
                CollectionItem.collection_id.in_(collection_ids),
            )
        )

        relation_result = await self.db.execute(
            select(ContentRelation).where(
                (ContentRelation.source_id == content_id) | (ContentRelation.target_id == content_id)
            )
        )
        for relation in relation_result.scalars().all():
            other_id = relation.target_id if relation.source_id == content_id else relation.source_id
            other_content = await self.db.get(Content, other_id)
            if other_content is None or other_content.brain_id != target_brain_id:
                await self.db.delete(relation)
