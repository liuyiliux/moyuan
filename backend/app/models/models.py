import uuid
from datetime import datetime
from sqlalchemy import String, Text, DateTime, Boolean, Integer, BigInteger, Float, func, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector

from app.models.base import Base


class Content(Base):
    __tablename__ = "contents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    content_type: Mapped[str] = mapped_column(String(50), nullable=False)  # note, image, video, audio, pdf, doc, web
    source_type: Mapped[str] = mapped_column(String(50), default="manual")  # manual, upload, web_capture
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_size: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    file_md5: Mapped[str | None] = mapped_column(String(32), nullable=True)

    # Text content (for notes, OCR text, transcriptions)
    text_content: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Processing status: pending -> chunking -> chunked -> embedding -> completed/failed
    processing_status: Mapped[str] = mapped_column(String(20), default="pending")  # pending, chunking, chunked, embedding, processing, completed, failed
    processing_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 多模态嵌入 - 使用统一的向量空间（Qwen3-VL-Embedding-8B 输出 4096 维）
    embedding = mapped_column(Vector(4096), nullable=True)  # 统一嵌入（文本/图像/多模态）
    embedding_type: Mapped[str | None] = mapped_column(String(10), nullable=True)  # 'text' 或 'image'

    # Metadata
    extra_meta: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # 字幕切片、OCR 坐标等扩展数据

    # Organization
    is_starred: Mapped[bool] = mapped_column(Boolean, default=False)
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Brain (workspace)
    brain_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    brain_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    color: Mapped[str | None] = mapped_column(String(7), nullable=True)  # hex color
    brain_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (
        Index(
            "uq_tags_brain_name",
            "brain_id",
            "name",
            unique=True,
            postgresql_where=brain_id.isnot(None),
            sqlite_where=brain_id.isnot(None),
        ),
        Index(
            "uq_tags_global_name",
            "name",
            unique=True,
            postgresql_where=brain_id.is_(None),
            sqlite_where=brain_id.is_(None),
        ),
    )


class ContentTag(Base):
    __tablename__ = "content_tags"

    content_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("contents.id", ondelete="CASCADE"), primary_key=True)
    tag_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True)


class ContentCategory(Base):
    __tablename__ = "content_categories"

    content_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("contents.id", ondelete="CASCADE"), primary_key=True)
    category_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("categories.id", ondelete="CASCADE"), primary_key=True)


class Collection(Base):
    __tablename__ = "collections"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    enable: Mapped[bool] = mapped_column(Boolean, default=True)
    brain_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class CollectionItem(Base):
    __tablename__ = "collection_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    collection_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("collections.id", ondelete="CASCADE"), nullable=False)
    content_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("contents.id", ondelete="CASCADE"), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class ProviderConfig(Base):
    __tablename__ = "provider_configs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    provider_type: Mapped[str] = mapped_column(String(50), nullable=False)  # openai, custom
    base_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    api_key_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    default_models: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # {"summarize": "gpt-4o", "embedding": "text-embedding-3-small", ...}
    extra_params: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class FunctionBindingConfig(Base):
    __tablename__ = "function_binding_configs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    function: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    provider_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("provider_configs.id", ondelete="SET NULL"), nullable=True)
    model: Mapped[str | None] = mapped_column(String(200), nullable=True)
    extra_params: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Brain(Base):
    __tablename__ = "brains"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class SearchLog(Base):
    __tablename__ = "search_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    query: Mapped[str] = mapped_column(Text, nullable=False)
    result_count: Mapped[int] = mapped_column(Integer, default=0)
    brain_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ProcessingTask(Base):
    """异步处理任务表：追踪内容处理队列"""
    __tablename__ = "processing_tasks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    content_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("contents.id", ondelete="CASCADE"), nullable=False)
    task_type: Mapped[str] = mapped_column(String(50), nullable=False)  # parse, ocr, transcribe, embed, web_capture
    status: Mapped[str] = mapped_column(String(20), default="queued")  # queued, processing, completed, failed, cancelled
    priority: Mapped[int] = mapped_column(Integer, default=0)  # 越小越优先
    progress: Mapped[int] = mapped_column(Integer, default=0)   # 0-100
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ContentRelation(Base):
    """内容关系表：建立内容之间的关联（引用、系列、相似）"""
    __tablename__ = "content_relations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("contents.id", ondelete="CASCADE"), nullable=False)
    target_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("contents.id", ondelete="CASCADE"), nullable=False)
    relation_type: Mapped[str] = mapped_column(String(20), nullable=False)  # reference, series, similar
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    extra_meta: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Annotation(Base):
    """批注表：记录用户对内容的文字批注"""
    __tablename__ = "annotations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    content_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("contents.id", ondelete="CASCADE"), nullable=False, index=True)
    selected_text: Mapped[str] = mapped_column(Text, nullable=False)
    start_offset: Mapped[int] = mapped_column(Integer, nullable=False)
    end_offset: Mapped[int] = mapped_column(Integer, nullable=False)
    annotation_text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ContentChunk(Base):
    """内容分块表：将长文档切分为语义连贯的小块，每块独立向量化"""
    __tablename__ = "content_chunks"
    __table_args__ = (
        Index("ix_chunks_content_id", "content_id"),
        # IVFFlat 索引限制 2000 维，4096 维向量无法使用，数据量小时全表扫描即可
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    content_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("contents.id", ondelete="CASCADE"), nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    chunk_type: Mapped[str] = mapped_column(String(10), nullable=False, default="text")  # text / image
    chunk_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    embedding = mapped_column(Vector(4096), nullable=True)
    embedding_type: Mapped[str | None] = mapped_column(String(10), nullable=True)  # 'text' 或 'image'

    # Quiz filtering controls
    disable_quiz: Mapped[bool] = mapped_column(Boolean, default=False)  # true = 禁止参与出题
    difficulty: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 难度 1-5

    page_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    start_offset: Mapped[int | None] = mapped_column(Integer, nullable=True)
    end_offset: Mapped[int | None] = mapped_column(Integer, nullable=True)
    time_start: Mapped[float | None] = mapped_column(Float, nullable=True)
    time_end: Mapped[float | None] = mapped_column(Float, nullable=True)
    image_path: Mapped[str | None] = mapped_column(Text, nullable=True)

    extra_meta: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Question(Base):
    """题目表：RAG 题库生成结果持久化，支持溯源和错题收集"""
    __tablename__ = "questions"
    __table_args__ = (
        Index("ix_questions_content_id", "content_id"),
        Index("ix_questions_source_chunk_id", "source_chunk_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    content_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("contents.id", ondelete="CASCADE"), nullable=False)
    q_type: Mapped[str] = mapped_column(String(20), nullable=False)  # single / multiple / truefalse / open
    question: Mapped[str] = mapped_column(Text, nullable=False)
    options: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # 选项列表 ["A选项", "B选项", ...]
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)  # 解析
    source_chunk_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("content_chunks.id", ondelete="SET NULL"), nullable=True)
    page_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    difficulty: Mapped[str | None] = mapped_column(String(10), nullable=True)  # easy / medium / hard

    # Quiz optimization: question-level embedding for dedup, multi-source tracking
    embedding = mapped_column(Vector(4096), nullable=True)  # 题目文本向量，用于入库前查重
    source_chunk_ids: Mapped[list | None] = mapped_column(JSONB, nullable=True)  # 关联来源切块 ID 列表
    source_content_ids: Mapped[list | None] = mapped_column(JSONB, nullable=True)  # 关联原 PDF 知识库 ID 列表

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PromptTemplate(Base):
    """Prompt 模板表：各 AI 功能可编辑的 Prompt 模板，按 template_type 区分用途"""
    __tablename__ = "prompt_templates"
    __table_args__ = (
        Index("ix_prompt_templates_brain_type", "brain_id", "template_type"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    brain_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("brains.id", ondelete="CASCADE"), nullable=True)
    template_type: Mapped[str] = mapped_column(String(50), nullable=False)  # quiz / summarize / recommend
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    system_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    user_prompt_template: Mapped[str] = mapped_column(Text, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class QuestionRecord(Base):
    """答题记录表：记录用户对题目的作答结果，支撑错题本功能"""
    __tablename__ = "question_records"
    __table_args__ = (
        Index("ix_question_records_question_id", "question_id"),
        Index("ix_question_records_is_correct", "is_correct"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    question_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("questions.id", ondelete="CASCADE"), nullable=False)
    user_answer: Mapped[str] = mapped_column(Text, nullable=False)
    is_correct: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    answered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
