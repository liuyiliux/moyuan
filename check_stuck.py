import asyncio, sys
sys.path.insert(0, r'f:\PycharmProjects\moyuan\backend')
from app.core.database import async_session_factory
from sqlalchemy import text
async def main():
    async with async_session_factory() as s:
        q = text("SELECT id, title, processing_status, updated_at FROM content WHERE processing_status='embedding' ORDER BY updated_at DESC LIMIT 20")
        rows = (await s.execute(q)).fetchall()
        if not rows:
            print('NO_STUCK_ROWS')
            return
        for r in rows:
            print(f"{r.id}\t{r.title}\t{r.processing_status}\t{r.updated_at}")
asyncio.run(main())
