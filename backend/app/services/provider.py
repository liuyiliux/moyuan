import uuid
import time
from typing import Sequence

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Brain, FunctionBindingConfig, ProviderConfig
from app.schemas.provider import ProviderCreate, ProviderUpdate, ProviderTestResult
from app.core.crypto import crypto_service


def _clean_optional_str(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


def _clean_models(models: dict[str, str] | None) -> dict[str, str] | None:
    if not models:
        return None
    cleaned = {
        key.strip(): value.strip()
        for key, value in models.items()
        if key and value and key.strip() and value.strip()
    }
    return cleaned or None


class ProviderService:

    @staticmethod
    async def create(db: AsyncSession, data: ProviderCreate) -> ProviderConfig:
        api_key = _clean_optional_str(data.api_key)
        provider = ProviderConfig(
            name=data.name.strip(),
            provider_type=data.provider_type,
            base_url=_clean_optional_str(data.base_url),
            api_key_encrypted=crypto_service.encrypt(api_key) if api_key else None,
            default_models=_clean_models(data.default_models),
            extra_params=data.extra_params,
        )
        db.add(provider)
        await db.flush()
        await db.refresh(provider)
        return provider

    @staticmethod
    async def get_all(db: AsyncSession) -> Sequence[ProviderConfig]:
        result = await db.execute(
            select(ProviderConfig).order_by(ProviderConfig.created_at.desc())
        )
        return result.scalars().all()

    @staticmethod
    async def get_by_id(db: AsyncSession, provider_id: uuid.UUID) -> ProviderConfig | None:
        result = await db.execute(
            select(ProviderConfig).where(ProviderConfig.id == provider_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def update(db: AsyncSession, provider_id: uuid.UUID, data: ProviderUpdate) -> ProviderConfig | None:
        provider = await ProviderService.get_by_id(db, provider_id)
        if not provider:
            return None

        update_data = data.model_dump(exclude_unset=True)
        if "api_key" in update_data:
            raw_key = update_data.pop("api_key")
            if raw_key is not None:
                cleaned_key = _clean_optional_str(raw_key)
                update_data["api_key_encrypted"] = crypto_service.encrypt(cleaned_key) if cleaned_key else None
        if "name" in update_data and update_data["name"] is not None:
            update_data["name"] = update_data["name"].strip()
        if "base_url" in update_data:
            update_data["base_url"] = _clean_optional_str(update_data["base_url"])
        if "default_models" in update_data:
            update_data["default_models"] = _clean_models(update_data["default_models"])

        for key, value in update_data.items():
            setattr(provider, key, value)

        await db.flush()
        await db.refresh(provider)
        return provider

    @staticmethod
    async def delete(db: AsyncSession, provider_id: uuid.UUID) -> bool:
        provider = await ProviderService.get_by_id(db, provider_id)
        if not provider:
            return False
        bindings_result = await db.execute(
            select(FunctionBindingConfig).where(FunctionBindingConfig.provider_id == provider_id)
        )
        for binding in bindings_result.scalars().all():
            binding.provider_id = None

        brains_result = await db.execute(select(Brain))
        for brain in brains_result.scalars().all():
            config = dict(brain.config or {})
            if str(config.get("provider_id") or "") == str(provider_id):
                config.pop("provider_id", None)
                brain.config = config or None

        await db.delete(provider)
        await db.flush()
        return True

    @staticmethod
    async def test_connection(db: AsyncSession, provider_id: uuid.UUID) -> ProviderTestResult:
        provider = await ProviderService.get_by_id(db, provider_id)
        if not provider:
            return ProviderTestResult(success=False, message="提供商不存在")

        if not provider.api_key_encrypted:
            return ProviderTestResult(success=False, message="未配置 API Key")

        try:
            api_key = crypto_service.decrypt(provider.api_key_encrypted)
        except Exception:
            return ProviderTestResult(success=False, message="API Key 解密失败")

        base_url = (provider.base_url or "https://api.openai.com/v1").rstrip("/")
        url = f"{base_url}/models"

        start = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    url,
                    headers={"Authorization": f"Bearer {api_key}"},
                )
            elapsed = (time.perf_counter() - start) * 1000

            if resp.status_code == 200:
                return ProviderTestResult(
                    success=True,
                    message=f"连接成功，延迟 {elapsed:.0f}ms",
                    latency_ms=round(elapsed, 1),
                )
            elif resp.status_code == 401:
                return ProviderTestResult(
                    success=False,
                    message="认证失败，请检查 API Key",
                    latency_ms=round(elapsed, 1),
                )
            else:
                return ProviderTestResult(
                    success=False,
                    message=f"请求失败 (HTTP {resp.status_code}): {resp.text[:200]}",
                    latency_ms=round(elapsed, 1),
                )
        except httpx.ConnectError:
            elapsed = (time.perf_counter() - start) * 1000
            return ProviderTestResult(
                success=False,
                message=f"无法连接到 {url}，请检查 Base URL",
                latency_ms=round(elapsed, 1),
            )
        except httpx.TimeoutException:
            elapsed = (time.perf_counter() - start) * 1000
            return ProviderTestResult(
                success=False,
                message="连接超时（10s），请检查网络",
                latency_ms=round(elapsed, 1),
            )
        except Exception as e:
            elapsed = (time.perf_counter() - start) * 1000
            return ProviderTestResult(
                success=False,
                message=f"连接异常: {str(e)[:200]}",
                latency_ms=round(elapsed, 1),
            )


provider_service = ProviderService()
