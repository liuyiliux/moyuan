from logging.config import fileConfig
from alembic import context

config = context.config
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
    # 在线模式需要数据库连接，首次部署用离线模式即可
    # 后续使用: alembic upgrade head（需先配置好数据库连接）
    pass


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
