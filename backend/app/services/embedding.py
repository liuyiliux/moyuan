"""文本嵌入生成 Service

调用 provider-config 中配置的 embedding 提供商生成向量，
写入 contents.text_embedding 字段。
"""

import hashlib
import json
import time
from datetime import datetime, timezone
from typing import Sequence

import httpx
from openai import AsyncOpenAI
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.models import Content, ProviderConfig
from app.core.crypto import crypto_service

settings = get_settings()

# ── 嵌入缓存（进程内，避免重复请求）──
_embedding_cache: dict[str, list[float]] = {}


def _cache_key(text: str, model: str) -> str:
    h = hashlib.md5(f"{model}:{text}".encode()).hexdigest()
    return h


async def _call_openai_embedding(
    api_key: str,
    base_url: str | None,
    model: str,
    texts: list[str],
) -> list[list[float]]:
    """调用 OpenAI 兼容接口生成嵌入"""
    client = AsyncOpenAI(
        api_key=api_key,
        base_url=base_url,
    )
    response = await client.embeddings.create(
        model=model,
        input=texts,
    )
    return [d.embedding for d in response.data]


async def _call_tei_embedding(
    base_url: str,
    model: str,
    texts: list[str],
) -> list[list[float]]:
    """调用 TEI (Text-Embeddings-Inference) 本地服务"""
    url = f"{base_url.rstrip('/')}/embed"
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            url,
            json={"inputs": texts, "model": model},
        )
        resp.raise_for_status()
        data = resp.json()
        # TEI 返回 [[...], [...], ...]
        return data


async def generate_embeddings(
    db: AsyncSession,
    provider_id: str | None = None,
    model: str | None = None,
) -> int:
    """为所有 pending / completed 但无 embedding 的内容生成嵌入。

    返回成功处理的数量。
    """
    # 1. 确定使用哪个 provider + model
    if provider_id is None or model is None:
        # 从 provider-config 读取默认 embedding 绑定
        binding = await _get_embedding_binding(db)
        if binding is None:
            raise RuntimeError("未配置 embedding 提供商，请在设置中配置")
        provider_id = binding["provider_id"]
        model = binding["model"]

    # 2. 获取 provider 详情
    result = await db.execute(
        select(ProviderConfig).where(ProviderConfig.id == provider_id)
    )
    provider = result.scalar_one_or_none()
    if provider is None:
        raise RuntimeError(f"Provider {provider_id} 不存在")

    api_key = crypto_service.decrypt(provider.api_key_encrypted) if provider.api_key_encrypted else None
    base_url = provider.base_url

    # 3. 读取待处理内容
    result = await db.execute(
        select(Content)
        .where(
            Content.is_deleted == False,
            Content.text_content.isnot(None),
            Content.text_embedding.is_(None),
        )
        .limit(50)
        .order_by(Content.created_at.asc())
    )
    items: Sequence[Content] = result.scalars().all()
    if not items:
        return 0

    # 4. 分块 + 批量嵌入
    texts = [_truncate_text(c.text_content, max_chars=8000) for c in items]

    # 检查缓存
    to_embed = []
    embed_indices = []
    embeddings: list[list[float] | None] = [None] * len(texts)

    for i, text in enumerate(texts):
        key = _cache_key(text, model or "unknown")
        if key in _embedding_cache:
            embeddings[i] = _embedding_cache[key]
        else:
            to_embed.append(text)
            embed_indices.append(i)

    # 调用 API
    if to_embed:
        if provider.provider_type == "openai" or (base_url and "openai" in base_url):
            new_vecs = await _call_openai_embedding(
                api_key or "", base_url, model or "text-embedding-3-small", to_embed,
            )
        else:
            # 默认按 OpenAI 兼容接口调用
            new_vecs = await _call_openai_embedding(
                api_key or "", base_url, model or "text-embedding-3-small", to_embed,
            )

        for idx, vec in zip(embed_indices, new_vecs):
            embeddings[idx] = vec
            _embedding_cache[_cache_key(texts[idx], model or "unknown")] = vec

    # 5. 写回数据库
    updated = 0
    for i, content in enumerate(items):
        if embeddings[i] is not None:
            content.text_embedding = embeddings[i]
            updated += 1

    await db.flush()
    return updated


async def _get_embedding_binding(db: AsyncSession) -> dict | None:
    """从 provider-config 读取 embedding 功能绑定。

    数据结构：provider_configs.default_models 是 JSONB，
    格式：{"embedding": "model-name", ...}
    同时需要在 extra_params 里标注绑定的 provider。
    更完整的实现：加一张 binding 表。
    当前简化：遍历 provider_configs，找第一个有 embedding model 的。
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
    return None


def _truncate_text(text: str | None, max_chars: int = 8000) -> str:
    if not text:
        return ""
    return text[:max_chars]


# ── 单条内容嵌入（处理管道调用）──

async def embed_content(db: AsyncSession, content_id: str) -> bool:
    """为单条内容生成嵌入"""
    result = await db.execute(
        select(Content).where(Content.id == content_id)
    )
    content = result.scalar_one_or_none()
    if content is None or not content.text_content:
        return False

    binding = await _get_embedding_binding(db)
    if binding is None:
        # 不报错，跳过
        return False

    result = await db.execute(
        select(ProviderConfig).where(ProviderConfig.id == binding["provider_id"])
    )
    provider = result.scalar_one_or_none()
    if provider is None:
        return False

    api_key = crypto_service.decrypt(provider.api_key_encrypted) if provider.api_key_encrypted else None
    base_url = provider.base_url
    model = binding["model"]

    text = _truncate_text(content.text_content, max_chars=8000)
    vecs = await _call_openai_embedding(
        api_key or "", base_url, model, [text],
    )
    content.text_embedding = vecs[0]
    await db.flush()
    return True
