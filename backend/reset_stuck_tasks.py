#!/usr/bin/env python
"""
重置卡住的任务状态
"""

import asyncio
from datetime import datetime
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import async_session_factory
from app.models.models import Content, ProcessingTask


async def reset_stuck_contents():
    """重置所有 processing/chunking/embedding 状态的内容为 failed 或 pending"""
    print("正在检查卡住的内容...")
    
    async with async_session_factory() as session:
        # 查找所有 processing/chunking/embedding 状态的内容
        result = await session.execute(
            select(Content).where(
                Content.processing_status.in_(["processing", "chunking", "embedding"])
            )
        )
        stuck_contents = result.scalars().all()
        
        if not stuck_contents:
            print("没有发现卡住的任务！")
            return
        
        print(f"发现 {len(stuck_contents)} 个卡住的任务：")
        for content in stuck_contents:
            print(f"  - {content.id} ({content.title}): {content.processing_status}")
        
        # 重置状态
        for content in stuck_contents:
            # 重置为 failed，这样用户可以看到状态有错误，然后重新处理
            content.processing_status = "failed"
            content.processing_error = f"服务重启，任务被中断 - {datetime.now().isoformat()}"
        
        await session.commit()
        print("已重置所有卡住的内容为 failed 状态！")


async def reset_stuck_tasks():
    """重置 processing_tasks 表中的卡住任务"""
    print("\n正在检查卡住的 processing_tasks...")
    
    async with async_session_factory() as session:
        result = await session.execute(
            select(ProcessingTask).where(
                ProcessingTask.status.in_(["queued", "processing"])
            )
        )
        stuck_tasks = result.scalars().all()
        
        if not stuck_tasks:
            print("没有发现卡住的 processing_tasks！")
            return
        
        print(f"发现 {len(stuck_tasks)} 个卡住的任务：")
        for task in stuck_tasks:
            print(f"  - {task.id} (content: {task.content_id}): {task.status}")
        
        # 重置状态
        for task in stuck_tasks:
            task.status = "failed"
            task.error_message = f"服务重启，任务被中断 - {datetime.now().isoformat()}"
        
        await session.commit()
        print("已重置所有卡住的 processing_tasks！")


async def main():
    await reset_stuck_contents()
    await reset_stuck_tasks()
    print("\n✅ 完成！")


if __name__ == "__main__":
    asyncio.run(main())
