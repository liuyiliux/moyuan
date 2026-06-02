import asyncio, sys
sys.path.insert(0, r'f:\PycharmProjects\moyuan\backend')
from app.core.database import async_session_factory
from sqlalchemy import text
async def main():
    async with async_session_factory() as s:
        q = text("SELECT id, content_id, status, task_type, error_message, created_at, updated_at FROM processing_task WHERE status IN ('queued','processing') OR task_type='embed' ORDER BY updated_at DESC LIMIT 20")
        rows = (await s.execute(q)).fetchall()
        if not rows:
            print('NO_TASK_ROWS')
            return
        for r in rows:
            print(f"{r.id}\t{r.content_id}\t{r.status}\t{r.task_type}\t{r.error_message}\t{r.created_at}\t{r.updated_at}")
asyncio.run(main())
