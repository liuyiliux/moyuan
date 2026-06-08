"""批注 API"""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import Annotation

router = APIRouter(prefix="/api/annotations", tags=["annotations"])


class AnnotationCreate(BaseModel):
    content_id: str
    selected_text: str
    start_offset: int
    end_offset: int
    annotation_text: str


class AnnotationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    content_id: str
    selected_text: str
    start_offset: int
    end_offset: int
    annotation_text: str
    created_at: datetime


@router.get("", response_model=list[AnnotationResponse])
async def list_annotations(
    content_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """获取指定内容的所有批注"""
    result = await db.execute(
        select(Annotation)
        .where(Annotation.content_id == uuid.UUID(content_id))
        .order_by(Annotation.start_offset)
    )
    annotations = result.scalars().all()
    return [
        AnnotationResponse(
            id=str(a.id),
            content_id=str(a.content_id),
            selected_text=a.selected_text,
            start_offset=a.start_offset,
            end_offset=a.end_offset,
            annotation_text=a.annotation_text,
            created_at=a.created_at,
        )
        for a in annotations
    ]


@router.post("", response_model=AnnotationResponse, status_code=201)
async def create_annotation(
    body: AnnotationCreate,
    db: AsyncSession = Depends(get_db),
):
    """创建新批注"""
    annotation = Annotation(
        id=uuid.uuid4(),
        content_id=uuid.UUID(body.content_id),
        selected_text=body.selected_text,
        start_offset=body.start_offset,
        end_offset=body.end_offset,
        annotation_text=body.annotation_text,
    )
    db.add(annotation)
    await db.flush()
    await db.refresh(annotation)
    await db.commit()

    return AnnotationResponse(
        id=str(annotation.id),
        content_id=str(annotation.content_id),
        selected_text=annotation.selected_text,
        start_offset=annotation.start_offset,
        end_offset=annotation.end_offset,
        annotation_text=annotation.annotation_text,
        created_at=annotation.created_at,
    )


@router.delete("/{annotation_id}", response_model=dict)
async def delete_annotation(
    annotation_id: str,
    db: AsyncSession = Depends(get_db),
):
    """删除批注"""
    result = await db.execute(
        select(Annotation).where(Annotation.id == uuid.UUID(annotation_id))
    )
    annotation = result.scalar_one_or_none()
    if annotation is None:
        raise HTTPException(status_code=404, detail="Annotation not found")

    await db.delete(annotation)
    await db.commit()

    return {"status": "ok", "message": "Annotation deleted"}
