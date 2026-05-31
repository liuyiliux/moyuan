import uuid
from datetime import datetime
from pydantic import BaseModel, Field


# ── Provider CRUD ──

class ProviderCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    provider_type: str = Field(default="openai", pattern=r"^(openai|tencent_ocr|tencent_ima|custom)$")
    base_url: str | None = None
    api_key: str | None = None
    default_models: dict[str, str] | None = None  # {"summarize": "gpt-4o", "embedding": "text-embedding-3-small"}
    extra_params: dict | None = None


class ProviderUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    provider_type: str | None = Field(None, pattern=r"^(openai|tencent_ocr|tencent_ima|custom)$")
    base_url: str | None = None
    api_key: str | None = None
    default_models: dict[str, str] | None = None
    extra_params: dict | None = None
    is_active: bool | None = None


class ProviderResponse(BaseModel):
    id: uuid.UUID
    name: str
    provider_type: str
    base_url: str | None
    api_key_masked: str | None  # "sk-***...***"
    default_models: dict[str, str] | None
    extra_params: dict | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProviderTestResult(BaseModel):
    success: bool
    message: str
    latency_ms: float | None = None


# ── Function Bindings ──

class FunctionBinding(BaseModel):
    """功能到提供商+模型的绑定"""
    function: str  # summarize / embedding / quiz / ocr / transcribe
    provider_id: uuid.UUID | None = None
    model: str | None = None
    extra_params: dict | None = None


class FunctionBindingsResponse(BaseModel):
    bindings: dict[str, FunctionBinding]  # keyed by function name
