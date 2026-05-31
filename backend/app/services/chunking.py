"""语义分块服务

使用 BGE-M3 等嵌入模型计算相邻句子的语义相似度，
在语义断点处切分文本，生成语义连贯的 chunks。
"""

import re
import math
import logging
from dataclasses import dataclass, field

from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

CHUNK_MIN_CHARS = 200
CHUNK_MAX_CHARS = 3000
CHUNK_TARGET_CHARS = 2000
SEMANTIC_THRESHOLD = 0.5


@dataclass
class TextChunk:
    text: str
    start_offset: int
    end_offset: int
    page_number: int | None = None
    time_start: float | None = None
    time_end: float | None = None


def _split_sentences(text: str) -> list[tuple[str, int, int]]:
    """将文本按句子拆分，返回 (sentence, start_offset, end_offset) 列表"""
    pattern = r'(?<=[。！？.!?\n])\s*'
    parts = []
    last_end = 0

    for match in re.finditer(pattern, text):
        end = match.end()
        segment = text[last_end:end].strip()
        if segment:
            parts.append((segment, last_end, end))
        last_end = end

    remaining = text[last_end:].strip()
    if remaining:
        parts.append((remaining, last_end, len(text)))

    return parts


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


async def _get_chunking_provider(db: AsyncSession) -> tuple[str, str, str] | None:
    """获取 chunking 模型配置，返回 (api_key, base_url, model)"""
    from app.services.embedding import _get_chunking_binding, _get_provider
    from app.core.crypto import crypto_service

    binding = await _get_chunking_binding(db)
    if binding is None:
        return None

    provider = await _get_provider(db, binding["provider_id"])
    if provider is None:
        return None

    api_key = crypto_service.decrypt(provider.api_key_encrypted) if provider.api_key_encrypted else ""
    return (api_key, provider.base_url, binding["model"])


async def _call_embedding_api(
    api_key: str,
    base_url: str,
    model: str,
    texts: list[str],
) -> list[list[float]]:
    """调用 OpenAI 兼容接口生成嵌入向量"""
    client = AsyncOpenAI(api_key=api_key, base_url=base_url)
    response = await client.embeddings.create(model=model, input=texts)
    return [d.embedding for d in response.data]


async def _compute_sentence_embeddings(
    sentences: list[str],
    api_key: str,
    base_url: str,
    model: str,
    batch_size: int = 32,
) -> list[list[float]]:
    """批量为句子生成嵌入向量"""
    all_embeddings = []
    for i in range(0, len(sentences), batch_size):
        batch = sentences[i:i + batch_size]
        vecs = await _call_embedding_api(api_key, base_url, model, batch)
        all_embeddings.extend(vecs)
    return all_embeddings


def _find_semantic_boundaries(
    embeddings: list[list[float]],
    threshold: float = SEMANTIC_THRESHOLD,
) -> list[int]:
    """计算相邻句子的余弦相似度，返回语义断点索引列表

    返回的索引表示：在该索引处切分（索引之前的句子归入前一块）
    """
    if len(embeddings) < 2:
        return []

    boundaries = []
    for i in range(len(embeddings) - 1):
        sim = _cosine_similarity(embeddings[i], embeddings[i + 1])
        if sim < threshold:
            boundaries.append(i + 1)

    return boundaries


def _merge_chunks(
    sentences: list[tuple[str, int, int]],
    boundaries: list[int],
    min_chars: int = CHUNK_MIN_CHARS,
    max_chars: int = CHUNK_MAX_CHARS,
    target_chars: int = CHUNK_TARGET_CHARS,
) -> list[TextChunk]:
    """根据断点将句子合并为 chunks，处理过短和过长的块"""
    if not sentences:
        return []

    split_points = set(boundaries)
    raw_groups: list[list[tuple[str, int, int]]] = []
    current_group: list[tuple[str, int, int]] = []

    for idx, sent_info in enumerate(sentences):
        current_group.append(sent_info)
        if idx + 1 in split_points or idx == len(sentences) - 1:
            raw_groups.append(current_group)
            current_group = []

    merged: list[list[tuple[str, int, int]]] = []
    for group in raw_groups:
        group_text = "".join(s[0] for s in group)
        if len(group_text) < min_chars and merged:
            prev_text = "".join(s[0] for s in merged[-1])
            if len(prev_text) + len(group_text) <= max_chars:
                merged[-1].extend(group)
                continue
        merged.append(group)

    chunks: list[TextChunk] = []
    for group in merged:
        group_text = "".join(s[0] for s in group)
        start_offset = group[0][1]
        end_offset = group[-1][2]

        if len(group_text) <= max_chars:
            chunks.append(TextChunk(
                text=group_text.strip(),
                start_offset=start_offset,
                end_offset=end_offset,
            ))
        else:
            sub_chunks = _force_split(group, max_chars, target_chars)
            chunks.extend(sub_chunks)

    return chunks


def _force_split(
    group: list[tuple[str, int, int]],
    max_chars: int,
    target_chars: int,
) -> list[TextChunk]:
    """对过长的块强制按长度切分"""
    full_text = "".join(s[0] for s in group)
    chunks = []
    start = 0
    base_offset = group[0][1]

    while start < len(full_text):
        end = min(start + target_chars, len(full_text))

        if end < len(full_text):
            for sep in ["\n\n", "。", "\n", ". "]:
                pos = full_text.rfind(sep, start, end)
                if pos != -1:
                    end = pos + len(sep)
                    break

        chunk_text = full_text[start:end].strip()
        if chunk_text:
            chunks.append(TextChunk(
                text=chunk_text,
                start_offset=base_offset + start,
                end_offset=base_offset + end,
            ))
        start = max(start + 1, end - 200)

    return chunks


def _fallback_chunk(
    text: str,
    max_chars: int = CHUNK_MAX_CHARS,
    target_chars: int = CHUNK_TARGET_CHARS,
    overlap: int = 200,
) -> list[TextChunk]:
    """固定长度切分（语义切片失败时的 fallback）"""
    if len(text) <= max_chars:
        return [TextChunk(text=text.strip(), start_offset=0, end_offset=len(text))]

    chunks = []
    start = 0
    while start < len(text):
        end = min(start + target_chars, len(text))
        if end < len(text):
            for sep in ["\n\n", "。", "\n", ". "]:
                pos = text.rfind(sep, start, end)
                if pos != -1:
                    end = pos + len(sep)
                    break
        chunk_text = text[start:end].strip()
        if chunk_text:
            chunks.append(TextChunk(
                text=chunk_text,
                start_offset=start,
                end_offset=end,
            ))
        start = max(start + 1, end - overlap)

    return chunks


async def chunk_text(
    text: str,
    db: AsyncSession,
    min_chars: int = CHUNK_MIN_CHARS,
    max_chars: int = CHUNK_MAX_CHARS,
) -> list[TextChunk]:
    """主入口：对文本执行语义分块

    1. 按句子拆分
    2. 调用 chunking 模型生成句子向量
    3. 计算语义断点
    4. 合并优化（过短合并、过长拆分）
    5. 失败时 fallback 到固定长度切分
    """
    if not text or not text.strip():
        return []

    text = text.strip()

    if len(text) <= min_chars:
        return [TextChunk(text=text, start_offset=0, end_offset=len(text))]

    provider_config = await _get_chunking_provider(db)
    if provider_config is None:
        logger.warning("未配置 chunking 模型，使用固定长度切分")
        return _fallback_chunk(text, max_chars=max_chars)

    api_key, base_url, model = provider_config

    try:
        sentences = _split_sentences(text)
        if len(sentences) < 3:
            return _fallback_chunk(text, max_chars=max_chars)

        sentence_texts = [s[0] for s in sentences]
        embeddings = await _compute_sentence_embeddings(
            sentence_texts, api_key, base_url, model,
        )

        boundaries = _find_semantic_boundaries(embeddings, threshold=SEMANTIC_THRESHOLD)
        chunks = _merge_chunks(sentences, boundaries, min_chars=min_chars, max_chars=max_chars)

        logger.info(f"语义分块完成：{len(text)}字 → {len(chunks)}块")
        return chunks

    except Exception as e:
        logger.error(f"语义分块失败，fallback 到固定长度切分: {e}")
        return _fallback_chunk(text, max_chars=max_chars)
