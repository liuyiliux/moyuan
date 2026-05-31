"""Database initialization script — called by start.bat"""
import asyncio
from sqlalchemy import text
from app.core.database import engine
from app.models.base import Base
from app.models.models import ProcessingTask


async def init():
    async with engine.begin() as conn:
        try:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        except Exception:
            pass
        await conn.run_sync(Base.metadata.create_all)
    print("OK")


asyncio.run(init())
