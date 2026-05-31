"""核心服务 & API 集成测试
用法: cd backend && venv/Scripts/python -m pytest tests/ -v
注意: Windows 上 asyncpg 连接池有限，建议按 test 逐个运行：
      pytest tests/test_api.py -k "health or storage or upload or backup" -v
"""

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app


# ── Fixtures ──

@pytest.fixture(scope="session")
async def _engine():
    """session-scoped engine — 避免重复初始化"""
    yield engine


@pytest.fixture
async def client():
    """每个测试独立 client"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ── Health ──

@pytest.mark.asyncio
async def test_health(client: AsyncClient):
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


# ── Storage ──

@pytest.mark.asyncio
async def test_storage_config(client: AsyncClient):
    resp = await client.get("/api/storage/config")
    assert resp.status_code == 200
    data = resp.json()
    assert "storage_root" in data


# ── File Upload ──

@pytest.mark.asyncio
async def test_upload_txt(client: AsyncClient):
    resp = await client.post(
        "/api/files/upload",
        files={"file": ("test.txt", b"Hello Moyuan Test", "text/plain")},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "content_id" in data
    assert data["content_type"] == "doc"


# ── File Duplicate Check ──

@pytest.mark.asyncio
async def test_upload_duplicate_check(client: AsyncClient):
    content = b"Duplicate Test Unique Content"
    resp1 = await client.post(
        "/api/files/upload",
        files={"file": ("dup.txt", content, "text/plain")},
    )
    assert resp1.status_code == 201

    resp2 = await client.post(
        "/api/files/check-duplicate",
        files={"file": ("dup2.txt", content, "text/plain")},
    )
    assert resp2.status_code == 200
    data = resp2.json()
    assert data["is_duplicate"] is True


# ── File List ──

@pytest.mark.asyncio
async def test_file_list(client: AsyncClient):
    resp = await client.get("/api/files?page=1&page_size=5")
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "total" in data
    assert isinstance(data["items"], list)


# ── Tags ──

@pytest.mark.asyncio
async def test_tag_crud(client: AsyncClient):
    resp = await client.post("/api/tags", json={"name": "pytest-tag", "color": "#ff0000"})
    assert resp.status_code == 201

    resp2 = await client.get("/api/tags?page=1&page_size=100")
    assert resp2.status_code == 200


# ── Categories ──

@pytest.mark.asyncio
async def test_category_crud(client: AsyncClient):
    resp = await client.post("/api/categories", json={"name": "pytest-cat"})
    assert resp.status_code == 201
    cid = resp.json()["id"]

    resp2 = await client.get("/api/categories/tree")
    assert resp2.status_code == 200

    resp3 = await client.delete(f"/api/categories/{cid}")
    assert resp3.status_code == 200


# ── Search ──

@pytest.mark.asyncio
async def test_search_keyword(client: AsyncClient):
    resp = await client.post(
        "/api/search",
        json={"query": "test", "top_k": 5, "enable_vector": False},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "results" in data


# ── Notes ──

@pytest.mark.asyncio
async def test_note_crud(client: AsyncClient):
    resp = await client.post("/api/notes", json={"title": "TestNote", "content": "hello"})
    assert resp.status_code == 200
    nid = resp.json()["id"]

    resp2 = await client.get(f"/api/notes/{nid}")
    assert resp2.status_code == 200
    assert resp2.json()["title"] == "TestNote"

    resp3 = await client.delete(f"/api/notes/{nid}")
    assert resp3.status_code == 200


# ── Embedding ──

@pytest.mark.asyncio
async def test_embedding_stats(client: AsyncClient):
    resp = await client.get("/api/embeddings/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert "total_text_contents" in data


# ── Analytics ──

@pytest.mark.asyncio
async def test_analytics_overview(client: AsyncClient):
    resp = await client.get("/api/analytics/overview")
    assert resp.status_code == 200
    data = resp.json()
    assert "total_contents" in data


# ── Backup ──

@pytest.mark.asyncio
async def test_backup_list(client: AsyncClient):
    resp = await client.get("/api/backup")
    assert resp.status_code == 200
    assert "backups" in resp.json()


# ── 异常场景 ──

@pytest.mark.asyncio
async def test_get_nonexistent_file(client: AsyncClient):
    resp = await client.get("/api/files/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_empty_search(client: AsyncClient):
    resp = await client.post("/api/search", json={"query": "", "top_k": 5})
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_invalid_content_id(client: AsyncClient):
    resp = await client.get("/api/contents/not-a-uuid/status")
    assert resp.status_code >= 400
