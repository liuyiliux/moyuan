"""文件管理 Schemas"""

import uuid
from datetime import datetime
from pydantic import BaseModel, Field


class FileUploadResponse(BaseModel):
    """文件上传响应"""
    content_id: uuid.UUID
    title: str
    content_type: str
    file_path: str | None
    file_size: int | None
    file_md5: str | None
    is_duplicate: bool = False  # MD5 去重标记

    model_config = {"from_attributes": True}


class FileListParams(BaseModel):
    """文件列表查询参数"""
    content_type: str | None = None  # image, video, audio, pdf, doc, web
    brain_id: uuid.UUID | None = None
    is_deleted: bool = False
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)


class FileResponse(BaseModel):
    """文件/内容详情"""
    id: uuid.UUID
    title: str
    content_type: str
    source_type: str
    source_url: str | None
    file_path: str | None
    file_size: int | None
    file_md5: str | None
    text_content: str | None
    embedding: list[float] | None = None
    embedding_type: str | None = None
    processing_status: str
    is_starred: bool
    is_pinned: bool
    is_deleted: bool
    deleted_at: datetime | None = None
    brain_id: uuid.UUID | None
    extra_meta: dict | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class FileListResponse(BaseModel):
    """文件列表响应"""
    items: list[FileResponse]
    total: int
    page: int
    page_size: int


class ContentCreate(BaseModel):
    """内容创建请求"""
    title: str = Field(..., min_length=1, max_length=500)
    content_type: str = Field(default="note", pattern=r"^(note|image|video|audio|pdf|doc|web)$")
    source_type: str = Field(default="manual", pattern=r"^(manual|upload|web_capture)$")
    source_url: str | None = None
    file_path: str | None = None
    file_size: int | None = None
    file_md5: str | None = None
    text_content: str | None = None
    brain_id: uuid.UUID | None = None
    extra_meta: dict | None = None


class ContentUpdate(BaseModel):
    """内容更新请求"""
    title: str | None = Field(None, min_length=1, max_length=500)
    text_content: str | None = None
    is_starred: bool | None = None
    is_pinned: bool | None = None
    brain_id: uuid.UUID | None = None
    extra_meta: dict | None = None
