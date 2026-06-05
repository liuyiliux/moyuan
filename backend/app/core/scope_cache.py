"""出题范围缓存工具：Redis 缓存读写和失效操作（可选依赖，Redis 不可用时降级）"""

import json
import logging

logger = logging.getLogger(__name__)

_redis = None
try:
    import redis.asyncio as aioredis
    _redis = aioredis.from_url("redis://localhost:6379/0", decode_responses=True)
except Exception:
    pass

SCOPE_CACHE_TTL = 3600  # 60 minutes


async def load_scope_from_cache(key: str) -> list[str] | None:
    """从 Redis 加载缓存的 content_id 列表，返回 None 表示未命中或不可用"""
    if _redis is None:
        return None
    try:
        data = await _redis.get(key)
        if data:
            return json.loads(data)
    except Exception as e:
        logger.warning(f"[cache] Redis get failed for key={key}: {e}")
    return None


async def save_scope_to_cache(key: str, content_ids: list):
    """将 content_id 列表写入 Redis 缓存"""
    if _redis is None:
        return
    try:
        await _redis.set(key, json.dumps([str(cid) for cid in content_ids]), ex=SCOPE_CACHE_TTL)
    except Exception as e:
        logger.warning(f"[cache] Redis set failed for key={key}: {e}")


async def invalidate_scope_cache(key_pattern: str):
    """删除匹配的 Redis 缓存键"""
    if _redis is None:
        return
    try:
        keys = await _redis.keys(key_pattern)
        if keys:
            await _redis.delete(*keys)
            logger.info(f"[cache] invalidated {len(keys)} keys matching '{key_pattern}'")
    except Exception as e:
        logger.warning(f"[cache] Redis delete failed for pattern={key_pattern}: {e}")
