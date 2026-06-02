import asyncio, sys
from datetime import datetime, timedelta
sys.path.insert(0, r'f:\PycharmProjects\moyuan\backend')
from app.core.database import async_session_factory
from sqlalchemy import text

async def main():
    cutoff = (datetime.utcnow() - timedelta(minutes=30)).strftime('%Y-%m-%d %H:%M:%S')
    async with async_session_factory() as s:
        # fetch stale embedding contents
        rows = (await s.execute(text("SELECT id, title, updated_at FROM content WHERE processing_status='embedding' AND updated_at < :cutoff"), {"cutoff": cutoff})).fetchall()
        if not rows:
            print('NO_STALE_EMBEDDING')
            return
        print(f'STALE_EMBEDDING_COUNT={len(rows)}')
        for r in rows:
            print(f'{r.id}\t{r.title}\t{r.updated_at}')
            await s.execute(text("UPDATE content SET processing_status='failed', processing_error='长时间停留在 embedding，自动回滚为 failed', updated_at=NOW() WHERE id=:id"), {"id": str(r.id)})
            await s.execute(text("UPDATE processing_task SET status='failed', error_message='长时间停留在 embedding，自动回滚为 failed', updated_at=NOW() WHERE content_id=:id AND task_type='embed' AND status IN ('queued','processing')"), {"id": str(r.id)})
        await s.commit()
        print('RESET_DONE')
asyncio.run(main())
