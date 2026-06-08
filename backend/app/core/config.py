from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database (override via .env file)
    database_url: str = "postgresql+asyncpg://user:password@localhost:5432/moyuan"
    database_url_sync: str = "postgresql://user:password@localhost:5432/moyuan"

    # File Storage
    file_storage_root: str = "../data/files"

    # Logging
    log_dir: str = "../data/logs"
    log_level: str = "INFO"  # DEBUG, INFO, WARNING, ERROR, CRITICAL

    # Encryption
    encryption_key: str = ""

    # AI Providers (optional, can be configured via Web UI)
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
