"""多模态嵌入生成 Service

调用 provider-config 中配置的 embedding 提供商生成向量，
写入 contents.embedding 字段。
支持文本嵌入和图像嵌入（统一向量空间，用于文搜图、图搜图）。
"""

import base64
import hashlib
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Sequence

import httpx
from openai import AsyncOpenAI
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.models import Content, FunctionBindingConfig, ProviderConfig
from app.core.crypto import crypto_service

settings = get_settings()

_embedding_cache: dict[str, list[float]] = {}


def _cache_key(text: str, model: str) -> str:
    h = hashlib.md5(f"{model}:{text}".encode()).hexdigest()
    return h


async def _call_openai_embedding(
    api_key: str,
    base_url: str | None,
    model: str,
    inputs: list,
) -> list[list[float]]:
    """调用 OpenAI 兼容接口生成嵌入
    
    inputs 可以是:
    - list[str]: 纯文本输入
    - list[dict]: 多模态输入 [{"type": "text", "text": "..."}, {"type": "image_url", "image_url": {"url": "..."}}]
    
    针对硅基流动(SiliconFlow)等 OpenAI 兼容服务的特殊处理:
    - 硅基流动要求 batch_size <= 64
    - 需要正确处理空字符串输入
    - 需要设置 encoding_format="float"
    """
    from openai import APIError, APIConnectionError, AuthenticationError
    
    client = AsyncOpenAI(
        api_key=api_key,
        base_url=base_url,
    )
    
    filtered_inputs = [inp for inp in inputs if inp and (isinstance(inp, str) and inp.strip()) or isinstance(inp, dict)]
    
    if not filtered_inputs:
        return [[]] * len(inputs)
    
    max_batch_size = 64
    all_embeddings: list[list[float]] = []
    
    for i in range(0, len(filtered_inputs), max_batch_size):
        batch = filtered_inputs[i:i + max_batch_size]
        try:
            response = await client.embeddings.create(
                model=model,
                input=batch,
                encoding_format="float",
            )
            all_embeddings.extend([d.embedding for d in response.data])
        except AuthenticationError as e:
            error_msg = f"Embedding API authentication failed (model={model}): API Key 无效或过期"
            print(f"[Embedding] ERROR: {error_msg}")
            raise RuntimeError(error_msg) from e
        except APIConnectionError as e:
            error_msg = f"Embedding API connection failed (model={model}, base_url={base_url}): 无法连接到服务"
            print(f"[Embedding] ERROR: {error_msg}")
            raise RuntimeError(error_msg) from e
        except APIError as e:
            error_msg = f"Embedding API error (model={model}, status={e.status_code}, code={e.response.get('error', {}).get('code', 'unknown')}): {e.response.get('error', {}).get('message', str(e))}"
            print(f"[Embedding] ERROR: {error_msg}")
            raise RuntimeError(error_msg) from e
        except Exception as e:
            error_msg = f"Embedding API call failed (model={model}, batch_size={len(batch)}): {str(e)}"
            print(f"[Embedding] ERROR: {error_msg}")
            raise RuntimeError(error_msg) from e
    
    result: list[list[float] | None] = []
    input_idx = 0
    for inp in inputs:
        if inp and (isinstance(inp, str) and inp.strip()) or isinstance(inp, dict):
            result.append(all_embeddings[input_idx] if input_idx < len(all_embeddings) else None)
            input_idx += 1
        else:
            result.append(None)
    
    return result


async def _get_embedding_binding(db: AsyncSession) -> dict | None:
    """从 provider-config 读取 embedding 功能绑定

    优先级：
    1. Provider.default_models["embedding"]（数据库持久化）
    2. 功能绑定 /api/providers/bindings（内存，fallback）
    """
    result = await db.execute(
        select(ProviderConfig).where(ProviderConfig.is_active == True)
    )
    for p in result.scalars().all():
        models = p.default_models or {}
        if "embedding" in models:
            return {
                "provider_id": str(p.id),
                "model": models["embedding"],
            }

    binding_result = await db.execute(
        select(FunctionBindingConfig).where(FunctionBindingConfig.function == "embedding")
    )
    fb = binding_result.scalar_one_or_none()
    if fb and fb.provider_id and fb.model:
        return {
            "provider_id": str(fb.provider_id),
            "model": fb.model,
        }

    return None


async def _get_chunking_binding(db: AsyncSession) -> dict | None:
    """从 provider-config 读取 chunking 功能绑定

    优先级：
    1. Provider.default_models["chunking"]（数据库持久化）
    2. 功能绑定 /api/providers/bindings（内存，fallback）
    """
    result = await db.execute(
        select(ProviderConfig).where(ProviderConfig.is_active == True)
    )
    for p in result.scalars().all():
        models = p.default_models or {}
        if "chunking" in models:
            return {
                "provider_id": str(p.id),
                "model": models["chunking"],
            }

    binding_result = await db.execute(
        select(FunctionBindingConfig).where(FunctionBindingConfig.function == "chunking")
    )
    fb = binding_result.scalar_one_or_none()
    if fb and fb.provider_id and fb.model:
        return {
            "provider_id": str(fb.provider_id),
            "model": fb.model,
        }

    return None


async def _get_provider(db: AsyncSession, provider_id: str) -> ProviderConfig | None:
    result = await db.execute(
        select(ProviderConfig).where(ProviderConfig.id == provider_id)
    )
    return result.scalar_one_or_none()


def _truncate_text(text: str | None, max_chars: int = 8000) -> str:
    """清理文本，移除首尾空白，处理空值（不再截断，因为分块已经处理了长度）"""
    if not text:
        return ""
    return text.strip()


def _image_to_base64_url(file_path: str) -> str | None:
    """将图片文件转为 base64 data URL"""
    path = Path(settings.file_storage_root) / file_path
    if not path.exists():
        return None
    data = path.read_bytes()
    ext = path.suffix.lower()
    mime_map = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".png": "image/png", ".gif": "image/gif",
        ".webp": "image/webp", ".bmp": "image/bmp",
    }
    mime = mime_map.get(ext, "image/jpeg")
    b64 = base64.b64encode(data).decode()
    return f"data:{mime};base64,{b64}"


# ── 文本嵌入 ──

async def embed_text(
    db: AsyncSession,
    text: str,
    model: str | None = None,
    provider_id: str | None = None,
) -> list[float] | None:
    """为单条文本生成嵌入向量"""
    binding = await _get_embedding_binding(db)
    if binding is None:
        return None

    pid = provider_id or binding["provider_id"]
    m = model or binding["model"]

    provider = await _get_provider(db, pid)
    if provider is None:
        return None

    api_key = crypto_service.decrypt(provider.api_key_encrypted) if provider.api_key_encrypted else None
    base_url = provider.base_url

    truncated = _truncate_text(text)
    vecs = await _call_openai_embedding(api_key or "", base_url, m, [truncated])
    return vecs[0] if vecs else None


async def embed_texts(
    db: AsyncSession,
    texts: list[str],
    model: str | None = None,
    provider_id: str | None = None,
) -> list[list[float] | None]:
    """Batch-generate embeddings for text chunks."""
    if not texts:
        return []

    binding = await _get_embedding_binding(db)
    if binding is None:
        return [None] * len(texts)

    pid = provider_id or binding["provider_id"]
    m = model or binding["model"]

    provider = await _get_provider(db, pid)
    if provider is None:
        return [None] * len(texts)

    api_key = crypto_service.decrypt(provider.api_key_encrypted) if provider.api_key_encrypted else None
    if not api_key:
        raise RuntimeError(f"Provider {pid} has no API key configured for embedding")

    truncated = [_truncate_text(text) for text in texts]
    return await _call_openai_embedding(api_key, provider.base_url, m, truncated)


async def embed_image(
    db: AsyncSession,
    file_path: str,
    model: str | None = None,
    provider_id: str | None = None,
) -> list[float] | None:
    """为单张图片生成嵌入向量（使用多模态模型）

    Qwen3-VL-Embedding-8B 等多模态模型支持图片输入，
    通过 OpenAI 兼容 API 的 input 字段传入图片 URL 或 base64。
    """
    binding = await _get_embedding_binding(db)
    if binding is None:
        return None

    pid = provider_id or binding["provider_id"]
    m = model or binding["model"]

    provider = await _get_provider(db, pid)
    if provider is None:
        return None

    api_key = crypto_service.decrypt(provider.api_key_encrypted) if provider.api_key_encrypted else None
    base_url = provider.base_url

    image_url = _image_to_base64_url(file_path)
    if image_url is None:
        return None

    multimodal_input = [
        {"type": "image_url", "image_url": {"url": image_url}},
    ]
    vecs = await _call_openai_embedding(api_key or "", base_url, m, multimodal_input)
    return vecs[0] if vecs else None


# ── 单条内容嵌入（处理管道调用）──

async def embed_content(db: AsyncSession, content_id: str) -> bool:
    """为单条内容生成嵌入并写入数据库

    - 有文本内容 → 生成文本嵌入
    - 有图片文件 → 生成图像嵌入（优先，因为多模态模型可以同时理解图文）
    """
    result = await db.execute(
        select(Content).where(Content.id == content_id)
    )
    content = result.scalar_one_or_none()
    if content is None:
        return False

    vec = None
    embed_type = None

    # 对于图片类型，优先生成图像嵌入
    if content.content_type == "image" and content.file_path:
        vec = await embed_image(db, content.file_path)
        embed_type = "image"

    # 对于有文本的内容，生成文本嵌入
    if vec is None and content.text_content:
        vec = await embed_text(db, content.text_content)
        embed_type = "text"

    if vec is not None:
        content.embedding = vec
        content.embedding_type = embed_type
        await db.flush()
        return True

    return False


# ── 批量嵌入生成 ──

async def generate_embeddings(
    db: AsyncSession,
    provider_id: str | None = None,
    model: str | None = None,
) -> int:
    """为所有 pending / completed 但无 embedding 的内容生成嵌入。

    返回成功处理的数量。
    """
    binding = await _get_embedding_binding(db)
    if binding is None:
        raise RuntimeError("未配置 embedding 提供商，请在设置中配置")

    pid = provider_id or binding["provider_id"]
    m = model or binding["model"]

    provider = await _get_provider(db, pid)
    if provider is None:
        raise RuntimeError(f"Provider {pid} 不存在")

    api_key = crypto_service.decrypt(provider.api_key_encrypted) if provider.api_key_encrypted else None
    base_url = provider.base_url

    result = await db.execute(
        select(Content)
        .where(
            Content.is_deleted == False,
            Content.embedding.is_(None),
            Content.text_content.isnot(None),
        )
        .limit(50)
        .order_by(Content.created_at.asc())
    )
    items: Sequence[Content] = result.scalars().all()
    if not items:
        return 0

    texts = [_truncate_text(c.text_content, max_chars=8000) for c in items]

    to_embed = []
    embed_indices = []
    embeddings: list[list[float] | None] = [None] * len(texts)

    for i, text in enumerate(texts):
        key = _cache_key(text, m or "unknown")
        if key in _embedding_cache:
            embeddings[i] = _embedding_cache[key]
        else:
            to_embed.append(text)
            embed_indices.append(i)

    if to_embed:
        new_vecs = await _call_openai_embedding(
            api_key or "", base_url, m or "text-embedding-3-small", to_embed,
        )
        for idx, vec in zip(embed_indices, new_vecs):
            embeddings[idx] = vec
            _embedding_cache[_cache_key(texts[idx], m or "unknown")] = vec

    updated = 0
    for i, content in enumerate(items):
        if embeddings[i] is not None:
            content.embedding = embeddings[i]
            content.embedding_type = "text"
            updated += 1

    await db.flush()
    return updated


# ── 查询向量生成 ──

async def embed_query(db: AsyncSession, query: str) -> list[float] | None:
    """为搜索查询文本生成嵌入向量"""
    return await embed_text(db, query)


async def embed_query_image(db: AsyncSession, file_path: str) -> list[float] | None:
    """为搜索查询图片生成嵌入向量"""
    return await embed_image(db, file_path)
