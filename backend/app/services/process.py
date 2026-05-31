"""内容处理管道 Service

负责将上传的原始文件解析为可检索的文本内容：
- PDF  →  PyMuPDF 提取文字
- 图片  →  预留 CLIP 嵌入 + OCR（腾讯云 OCR）
- 音频  →  预留转写接口（OpenAI Whisper 或其他）
- Office  →  python-docx / openpyxl 提取文字
- 网页  →  trafilatura 提取正文
"""

import asyncio
import io
import os
import traceback
from datetime import datetime, timezone
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.models import Content

settings = get_settings()


# ── 文本分块 ──

def _chunk_text(text: str, max_chars: int = 2000, overlap: int = 200) -> list[str]:
    """将长文本分块，保留 overlap 避免截断语义"""
    if len(text) <= max_chars:
        return [text]
    chunks = []
    start = 0
    while start < len(text):
        end = start + max_chars
        # 尽量在句号/换行处截断
        if end < len(text):
            for sep in ["\n\n", "。", "\n", ". "]:
                pos = text.rfind(sep, start, end)
                if pos != -1:
                    end = pos + len(sep)
                    break
        chunks.append(text[start:end].strip())
        start = max(start + 1, end - overlap)
    return [c for c in chunks if c]


# ── PDF 解析 ──

def _extract_pdf(path: Path) -> str:
    import fitz  # PyMuPDF

    doc = fitz.open(path)
    parts = []
    for page in doc:
        parts.append(page.get_text())
    doc.close()
    return "\n".join(parts)


# ── Office 文档解析 ──

def _extract_docx(path: Path) -> str:
    from docx import Document

    doc = Document(str(path))
    return "\n".join(p.text for p in doc.paragraphs if p.text.strip())


def _extract_xlsx(path: Path) -> str:
    from openpyxl import load_workbook

    wb = load_workbook(path, read_only=True)
    parts = []
    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        for row in ws.iter_rows(values_only=True):
            cells = [str(c) for c in row if c is not None]
            if cells:
                parts.append(" | ".join(cells))
    wb.close()
    return "\n".join(parts)


# ── 图片 OCR（预留）──

async def _ocr_image(path: Path, provider_service: "ProviderService | None" = None) -> str:
    """预留 OCR 接口，优先使用 provider-config 中 tencent_ocr 配置"""
    # TODO: Phase 5 实现腾讯云 OCR 接入
    return ""


# ── 音频转写（预留）──

async def _transcribe_audio(path: Path, provider_service: "ProviderService | None" = None) -> str:
    """预留音频转写接口，使用 OpenAI Whisper 或配置中的 transcription 模型"""
    # TODO: Phase 5 实现
    return ""


# ── 网页抓取 ──

async def _extract_web(url: str) -> str:
    import trafilatura

    downloaded = trafilatura.fetch_url(url)
    if not downloaded:
        return ""
    result = trafilatura.extract(downloaded)
    return result or ""


# ── 主处理类 ──

class ContentProcessService:
    """内容处理管道：将 Content 的原始文件解析为 text_content"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def process(self, content_id: str | None = None, content: Content | None = None) -> Content:
        """处理单个 Content，更新 text_content 和 processing_status"""
        if content is None:
            from sqlalchemy import select

            result = await self.db.execute(select(Content).where(Content.id == content_id))
            content = result.scalar_one_or_none()
            if content is None:
                raise ValueError(f"Content {content_id} not found")

        content.processing_status = "processing"
        await self.db.flush()

        try:
            text = await self._dispatch(content)
            content.text_content = text
            content.processing_status = "completed"
            await self.db.flush()
            # 处理完成后自动生成嵌入
            await self._generate_embedding(content)
        except Exception as exc:
            content.processing_status = "failed"
            content.processing_error = traceback.format_exc()
            await self.db.flush()
            raise
        await self.db.flush()
        await self.db.refresh(content)
        return content

    async def _dispatch(self, content: Content) -> str:
        """根据 content_type 分发到对应解析器"""
        ct = content.content_type

        if ct == "note":
            # 纯文本笔记，内容直接在 text_content 中
            return content.text_content or ""

        if ct == "pdf":
            path = self._resolve_path(content.file_path)
            return await asyncio.to_thread(_extract_pdf, path)

        if ct == "doc":
            path = self._resolve_path(content.file_path)
            ext = Path(path).suffix.lower()
            if ext in {".docx", ".doc"}:
                return await asyncio.to_thread(_extract_docx, path)
            if ext in {".xlsx", ".xls"}:
                return await asyncio.to_thread(_extract_xlsx, path)
            # fallback: try as plain text
            return Path(path).read_text(encoding="utf-8", errors="ignore")

        if ct == "image":
            path = self._resolve_path(content.file_path)
            # Phase 5: 先存文本占位，后续接入 OCR
            ocr_text = await _ocr_image(path)
            return ocr_text

        if ct == "audio":
            path = self._resolve_path(content.file_path)
            transcript = await _transcribe_audio(path)
            return transcript

        if ct == "video":
            # Phase 5: 提取音频后转写，当前返回描述占位
            return f"[视频文件: {content.title}]"

        if ct == "web" and content.source_url:
            return await _extract_web(content.source_url)

        # fallback
        if content.file_path:
            path = self._resolve_path(content.file_path)
            if Path(path).exists():
                return Path(path).read_text(encoding="utf-8", errors="ignore")
        return ""

    def _resolve_path(self, file_path: str | None) -> str:
        """将相对路径解析为绝对路径"""
        if not file_path:
            raise ValueError("file_path is empty")
        root = Path(settings.file_storage_root).resolve()
        full = root / file_path
        if not full.exists():
            raise FileNotFoundError(f"File not found: {full}")
        return str(full)

    async def get_status(self, content_id: str) -> dict:
        """获取处理状态"""
        from sqlalchemy import select

        result = await self.db.execute(select(Content).where(Content.id == content_id))
        content = result.scalar_one_or_none()
        if content is None:
            raise ValueError(f"Content {content_id} not found")
        return {
            "id": str(content.id),
            "processing_status": content.processing_status,
            "processing_error": content.processing_error,
            "has_text": bool(content.text_content),
            "text_length": len(content.text_content or ""),
            "has_embedding": content.text_embedding is not None,
        }

    async def _generate_embedding(self, content: Content) -> None:
        """处理完成后为内容生成文本嵌入向量"""
        if not content.text_content or content.text_embedding is not None:
            return
        try:
            from app.services.embedding import embed_content
            await embed_content(self.db, str(content.id))
        except Exception:
            # 嵌入失败不阻断主流程，后续可重试
            pass
