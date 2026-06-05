from logging.config import fileConfig
from alembic import context

# 加载 .env 中的 DATABASE_URL_SYNC
import os
from dotenv import load_dotenv
load_dotenv()

config = context.config
# 用环境变量覆盖 alembic.ini 中的占位链接，保护凭据不泄露到 git
db_url = os.getenv("DATABASE_URL_SYNC")
if db_url:
    config.set_main_option("sqlalchemy.url", db_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

from app.models.base import Base
from app.models.models import *  # noqa: F401,F403 - 导入所有模型以注册到 Base.metadata

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """在线模式：通过 create_engine（无需 psycopg2，用默认驱动）连接并执行迁移"""
    from sqlalchemy import create_engine
    connectable = create_engine(config.get_main_option("sqlalchemy.url"))
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
