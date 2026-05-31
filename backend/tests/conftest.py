"""Test fixtures — 管理 app 生命周期和 DB 连接池"""
import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.core.database import engine


@pytest.fixture(scope="module", autouse=True)
def _manage_event_loop():
    """Windows 上确保事件循环在整个模块中保持活跃"""
    import asyncio
    import sys

    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


@pytest.fixture
async def client():
    """每个测试独立 client — 但共享 app 实例"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
