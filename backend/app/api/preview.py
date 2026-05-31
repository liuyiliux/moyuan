"""内容预览 API"""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import get_db
from app.models.models import Content

settings = get_settings()
router = APIRouter(prefix="/api/contents", tags=["preview"])


@router.get("/{content_id}/preview")
async def preview_content(
    content_id: str,
    mode: str = Query("info", description="info=返回预览元信息, raw=返回文件流"),
    db: AsyncSession = Depends(get_db),
):
    """预览内容

    - mode=info（默认）：返回预览元信息（类型、文本、文件路径）
    - mode=raw：直接返回文件流（用于 <img>/<video> 等标签）
    """
    from uuid import UUID
    try:
        cid = UUID(content_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid content_id")

    result = await db.execute(select(Content).where(Content.id == cid))
    content = result.scalar_one_or_none()
    if content is None:
        raise HTTPException(status_code=404, detail="Content not found")
    if content.is_deleted:
        raise HTTPException(status_code=410, detail="Content deleted")

    if mode == "raw":
        if not content.file_path:
            raise HTTPException(status_code=404, detail="No file associated")
        from pathlib import Path
        file_path = Path(settings.file_storage_root) / content.file_path
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found on disk")
        media_type_map = {
            "image": "image/*",
            "video": "video/*",
            "audio": "audio/*",
            "pdf": "application/pdf",
            "doc": "application/octet-stream",
        }
        return FileResponse(
            path=str(file_path),
            media_type=media_type_map.get(content.content_type, "application/octet-stream"),
            filename=content.title or None,
        )

    # mode == "info"
    preview_url = None
    if content.file_path:
        preview_url = f"/api/contents/{content_id}/preview?mode=raw"

    return JSONResponse({
        "id": str(content.id),
        "title": content.title,
        "content_type": content.content_type,
        "preview_url": preview_url,
        "text_content": content.text_content,
        "extra_meta": content.extra_meta,
        "processing_status": content.processing_status,
        "created_at": content.created_at.isoformat() if content.created_at else None,
    })
