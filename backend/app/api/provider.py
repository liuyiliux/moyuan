import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import FunctionBindingConfig
from app.schemas.provider import (
    ProviderCreate,
    ProviderUpdate,
    ProviderResponse,
    ProviderTestResult,
    FunctionBinding,
    FunctionBindingsResponse,
)
from app.services.provider import provider_service
from app.core.crypto import crypto_service

router = APIRouter(prefix="/api/providers", tags=["providers"])


# ── Function Bindings ──
# NOTE: 必须放在 /{provider_id} 之前，否则 "/bindings" 会被当成 provider_id

DEFAULT_FUNCTION_BINDINGS: dict[str, FunctionBinding] = {
    "summarize": FunctionBinding(function="summarize"),
    "embedding": FunctionBinding(function="embedding"),
    "chunking": FunctionBinding(function="chunking"),
    "quiz": FunctionBinding(function="quiz"),
    "judge": FunctionBinding(function="judge"),
    "ocr": FunctionBinding(function="ocr"),
    "transcribe": FunctionBinding(function="transcribe"),
}


@router.get("/bindings", response_model=FunctionBindingsResponse)
async def get_function_bindings(db: AsyncSession = Depends(get_db)):
    bindings = {k: v.model_copy() for k, v in DEFAULT_FUNCTION_BINDINGS.items()}
    result = await db.execute(select(FunctionBindingConfig))
    for item in result.scalars().all():
        bindings[item.function] = FunctionBinding(
            function=item.function,
            provider_id=item.provider_id,
            model=item.model,
            extra_params=item.extra_params,
        )
    return FunctionBindingsResponse(bindings=bindings)


@router.put("/bindings", response_model=FunctionBindingsResponse)
async def update_function_bindings(data: FunctionBindingsResponse, db: AsyncSession = Depends(get_db)):
    existing_result = await db.execute(select(FunctionBindingConfig))
    existing = {item.function: item for item in existing_result.scalars().all()}

    for function, binding in data.bindings.items():
        item = existing.get(function)
        if item is None:
            item = FunctionBindingConfig(function=function)
            db.add(item)
        item.provider_id = binding.provider_id
        item.model = binding.model
        item.extra_params = binding.extra_params

    await db.commit()
    return await get_function_bindings(db)


# ── Provider CRUD (放在 /bindings 之后，避免路径冲突) ──

def _to_response(provider) -> ProviderResponse:
    """Convert model to response with masked API key."""
    raw_key = None
    if provider.api_key_encrypted:
        try:
            raw_key = crypto_service.decrypt(provider.api_key_encrypted)
        except Exception:
            raw_key = "(解密失败)"
    return ProviderResponse(
        id=provider.id,
        name=provider.name,
        provider_type=provider.provider_type,
        base_url=provider.base_url,
        api_key_masked=crypto_service.mask(raw_key),
        default_models=provider.default_models,
        extra_params=provider.extra_params,
        is_active=provider.is_active,
        created_at=provider.created_at,
        updated_at=provider.updated_at,
    )


@router.post("", response_model=ProviderResponse, status_code=201)
async def create_provider(data: ProviderCreate, db: AsyncSession = Depends(get_db)):
    provider = await provider_service.create(db, data)
    return _to_response(provider)


@router.get("", response_model=list[ProviderResponse])
async def list_providers(db: AsyncSession = Depends(get_db)):
    providers = await provider_service.get_all(db)
    return [_to_response(p) for p in providers]


@router.get("/{provider_id}", response_model=ProviderResponse)
async def get_provider(provider_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    provider = await provider_service.get_by_id(db, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="提供商不存在")
    return _to_response(provider)


@router.put("/{provider_id}", response_model=ProviderResponse)
async def update_provider(provider_id: uuid.UUID, data: ProviderUpdate, db: AsyncSession = Depends(get_db)):
    provider = await provider_service.update(db, provider_id, data)
    if not provider:
        raise HTTPException(status_code=404, detail="提供商不存在")
    return _to_response(provider)


@router.delete("/{provider_id}", status_code=204)
async def delete_provider(provider_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    success = await provider_service.delete(db, provider_id)
    if not success:
        raise HTTPException(status_code=404, detail="提供商不存在")


@router.post("/{provider_id}/test", response_model=ProviderTestResult)
async def test_provider(provider_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    return await provider_service.test_connection(db, provider_id)
