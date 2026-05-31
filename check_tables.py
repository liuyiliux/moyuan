import asyncio
import sys
from pathlib import Path

# Add backend dir to path
sys.path.insert(0, str(Path(__file__).parent / "backend"))

from sqlalchemy import text
from app.core.database import async_session_factory

async def check():
    async with async_session_factory() as db:
        r = await db.execute(text(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema = 'public' ORDER BY table_name"
        ))
        tables = [row[0] for row in r.fetchall()]
        print("Tables:", tables)

        expected = [
            "contents", "categories", "tags", "content_tags",
            "content_categories", "collections", "collection_items",
            "provider_configs", "brains", "search_logs"
        ]
        missing = [t for t in expected if t not in tables]
        print("Missing tables:", missing if missing else "None")

asyncio.run(check())
