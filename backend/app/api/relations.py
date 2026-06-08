"""内容关系管理 API

POST   /api/relations              — 创建关系
GET    /api/relations              — 查询内容的关系列表
DELETE /api/relations/{id}         — 删除关系
GET    /api/relations/series       — 获取系列导航信息
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, delete, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import ContentRelation, Content

router = APIRouter(prefix="/api/relations", tags=["relations"])


# ── Schemas ──


class RelationCreate(BaseModel):
    source_id: str
    target_id: str
    relation_type: str  # reference, series, similar
    sort_order: int = 0
    metadata: dict | None = None


class RelationResponse(BaseModel):
    id: str
    source_id: str
    target_id: str
    relation_type: str
    sort_order: int
    metadata: dict | None
    created_at: str

    model_config = {"from_attributes": True}


class RelationDetailResponse(BaseModel):
    id: str
    source_id: str
    target_id: str
    relation_type: str
    sort_order: int
    metadata: dict | None
    created_at: str
    target_title: str
    target_content_type: str


class RelationSuggestionResponse(BaseModel):
    id: str
    title: str
    content_type: str
    similarity: float
    reason: str


class SeriesItemResponse(BaseModel):
    id: str
    title: str
    sort_order: int


class SeriesInfoResponse(BaseModel):
    series_name: str | None
    current_index: int
    total: int
    prev: SeriesItemResponse | None
    next: SeriesItemResponse | None
    items: list[SeriesItemResponse]


# ── Helpers ──


def _validate_uuid(value: str) -> uuid.UUID:
    """Validate and normalize a UUID string."""
    try:
        return uuid.UUID(value)
    except Exception:
        raise HTTPException(status_code=400, detail=f"Invalid UUID: {value}")


RELATION_TYPES = {"reference", "series", "similar"}


def _validate_relation_type(relation_type: str) -> str:
    if relation_type not in RELATION_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid relation_type '{relation_type}'. Must be one of: {', '.join(sorted(RELATION_TYPES))}",
        )
    return relation_type


def _relation_resp(rel: ContentRelation) -> dict:
    return {
        "id": str(rel.id),
        "source_id": str(rel.source_id),
        "target_id": str(rel.target_id),
        "relation_type": rel.relation_type,
        "sort_order": rel.sort_order,
        "metadata": rel.extra_meta,
        "created_at": rel.created_at.isoformat() if rel.created_at else "",
    }


# ── Routes ──


@router.post("", response_model=RelationResponse, status_code=201)
async def create_relation(body: RelationCreate, db: AsyncSession = Depends(get_db)):
    """创建内容关系"""
    source_id = _validate_uuid(body.source_id)
    target_id = _validate_uuid(body.target_id)
    relation_type = _validate_relation_type(body.relation_type)

    # 不能自引用
    if source_id == target_id:
        raise HTTPException(status_code=400, detail="source_id and target_id cannot be the same")

    # 验证源内容存在
    src_res = await db.execute(select(Content).where(Content.id == source_id))
    source = src_res.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Source content not found")

    # 验证目标内容存在
    tgt_res = await db.execute(select(Content).where(Content.id == target_id))
    target = tgt_res.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Target content not found")
    if source.brain_id != target.brain_id:
        raise HTTPException(status_code=400, detail="Cannot create relation across different brains")

    # 检查是否已存在（唯一约束）
    existing = await db.execute(
        select(ContentRelation).where(
            and_(
                ContentRelation.source_id == source_id,
                ContentRelation.target_id == target_id,
                ContentRelation.relation_type == relation_type,
            )
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Relation already exists")

    rel = ContentRelation(
        source_id=source_id,
        target_id=target_id,
        relation_type=relation_type,
        sort_order=body.sort_order,
        extra_meta=body.metadata,
    )
    db.add(rel)
    await db.flush()
    await db.refresh(rel)
    return _relation_resp(rel)


@router.get("", response_model=list[RelationDetailResponse])
async def list_relations(
    content_id: str = Query(..., description="内容 ID"),
    type: str | None = Query(None, description="关系类型过滤：reference, series, similar"),
    db: AsyncSession = Depends(get_db),
):
    """查询内容的关系列表"""
    cid = _validate_uuid(content_id)

    # 验证内容存在
    c_res = await db.execute(select(Content).where(Content.id == cid, Content.is_deleted == False))
    if not c_res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Content not found")

    # 查找所有关联（作为 source 或 target）
    conditions = [
        (ContentRelation.source_id == cid) | (ContentRelation.target_id == cid)
    ]
    if type:
        _validate_relation_type(type)
        conditions.append(ContentRelation.relation_type == type)

    stmt = select(ContentRelation).where(and_(*conditions)).order_by(ContentRelation.sort_order)
    result = await db.execute(stmt)
    relations = result.scalars().all()

    if not relations:
        return []

    # 收集所有关联内容 ID，批量查询标题
    related_ids = set()
    for rel in relations:
        related_ids.add(rel.target_id)
        related_ids.add(rel.source_id)
    related_ids.discard(cid)  # 排除自身

    contents_result = await db.execute(
        select(Content).where(Content.id.in_(related_ids), Content.is_deleted == False)
    )
    content_map = {c.id: c for c in contents_result.scalars().all()}

    # 构造响应
    items = []
    for rel in relations:
        # 确定关联内容的 ID
        related_id = rel.target_id if rel.source_id == cid else rel.source_id
        related_content = content_map.get(related_id)
        if related_content is None:
            continue
        items.append({
            "id": str(rel.id),
            "source_id": str(rel.source_id),
            "target_id": str(rel.target_id),
            "relation_type": rel.relation_type,
            "sort_order": rel.sort_order,
            "metadata": rel.extra_meta,
            "created_at": rel.created_at.isoformat() if rel.created_at else "",
            "target_title": related_content.title if related_content else "",
            "target_content_type": related_content.content_type if related_content else "",
        })

    return items


@router.get("/suggestions", response_model=list[RelationSuggestionResponse])
async def suggest_relations(
    content_id: str = Query(..., description="内容 ID"),
    limit: int = Query(5, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
):
    """Return similar content candidates that are not already related."""
    cid = _validate_uuid(content_id)

    content_result = await db.execute(select(Content).where(Content.id == cid, Content.is_deleted == False))
    content = content_result.scalar_one_or_none()
    if content is None:
        raise HTTPException(status_code=404, detail="Content not found")
    if content.embedding is None:
        return []

    relation_result = await db.execute(
        select(ContentRelation).where(
            (ContentRelation.source_id == cid) | (ContentRelation.target_id == cid)
        )
    )
    related_ids: set[uuid.UUID] = set()
    for rel in relation_result.scalars().all():
        related_ids.add(rel.source_id)
        related_ids.add(rel.target_id)
    related_ids.add(cid)

    distance = Content.embedding.cosine_distance(content.embedding)
    conditions = [
        Content.embedding.is_not(None),
        Content.is_deleted == False,
        Content.id.notin_(list(related_ids)),
    ]
    if content.brain_id is None:
        conditions.append(Content.brain_id.is_(None))
    else:
        conditions.append(Content.brain_id == content.brain_id)

    rows = await db.execute(
        select(
            Content.id,
            Content.title,
            Content.content_type,
            (1 - distance).label("similarity"),
        )
        .where(*conditions)
        .order_by(distance)
        .limit(limit)
    )

    suggestions = []
    for row in rows:
        similarity = float(row.similarity or 0)
        suggestions.append(
            RelationSuggestionResponse(
                id=str(row.id),
                title=row.title,
                content_type=row.content_type,
                similarity=round(similarity, 4),
                reason=f"Vector similarity {similarity:.2%}",
            )
        )
    return suggestions


@router.delete("/{relation_id}")
async def delete_relation(relation_id: str, db: AsyncSession = Depends(get_db)):
    """删除关系"""
    rid = _validate_uuid(relation_id)
    res = await db.execute(select(ContentRelation).where(ContentRelation.id == rid))
    rel = res.scalar_one_or_none()
    if rel is None:
        raise HTTPException(status_code=404, detail="Relation not found")
    await db.delete(rel)
    await db.flush()
    return {"ok": True}


@router.get("/series", response_model=SeriesInfoResponse)
async def get_series_info(
    content_id: str = Query(..., description="内容 ID"),
    series_name: str | None = Query(None, description="系列名称（可选，默认使用 metadata.name）"),
    db: AsyncSession = Depends(get_db),
):
    """获取系列导航信息"""
    cid = _validate_uuid(content_id)

    # 验证内容存在
    c_res = await db.execute(select(Content).where(Content.id == cid, Content.is_deleted == False))
    content = c_res.scalar_one_or_none()
    if content is None:
        raise HTTPException(status_code=404, detail="Content not found")

    # 查找所有 series 类型关系（双向），其中 source 或 target 包含当前内容
    stmt = select(ContentRelation).where(
        and_(
            ContentRelation.relation_type == "series",
            (ContentRelation.source_id == cid) | (ContentRelation.target_id == cid),
        )
    )
    result = await db.execute(stmt)
    direct_relations = result.scalars().all()

    if not direct_relations:
        return SeriesInfoResponse(
            series_name=series_name,
            current_index=0,
            total=1,
            prev=None,
            next=None,
            items=[SeriesItemResponse(id=str(content.id), title=content.title, sort_order=0)],
        )

    # 从关系中提取所有涉及的内容 ID（整条系列链）
    # 策略：遍历 direct_relations 收集所有相关 ID，然后查它们的 series 关系
    all_series_ids: set[str] = {str(cid)}
    for rel in direct_relations:
        all_series_ids.add(str(rel.source_id))
        all_series_ids.add(str(rel.target_id))

    # 二次扩散：查找这些 ID 的 series 关系（BFS，最多 3 轮）
    for _ in range(3):
        uuid_list = [uuid.UUID(sid) for sid in all_series_ids]
        expand_result = await db.execute(
            select(ContentRelation).where(
                and_(
                    ContentRelation.relation_type == "series",
                    (ContentRelation.source_id.in_(uuid_list)) | (ContentRelation.target_id.in_(uuid_list)),
                )
            )
        )
        new_ids: set[str] = set()
        for rel in expand_result.scalars().all():
            new_ids.add(str(rel.source_id))
            new_ids.add(str(rel.target_id))
        if new_ids.issubset(all_series_ids):
            break
        all_series_ids.update(new_ids)

    # 获取所有关系用于排序
    all_uuids = [uuid.UUID(sid) for sid in all_series_ids]
    all_rels_result = await db.execute(
        select(ContentRelation).where(
            and_(
                ContentRelation.relation_type == "series",
                (ContentRelation.source_id.in_(all_uuids)) | (ContentRelation.target_id.in_(all_uuids)),
            )
        )
    )
    all_relations = all_rels_result.scalars().all()

    # 用 sort_order 排序：取每条关系中较小 sort_order 值作为排序依据
    # 如果关系有 metadata 中的 series_name，做分组过滤
    ordered_ids: list[str] = []
    sort_map: dict[str, int] = {}

    for rel in all_relations:
        src = str(rel.source_id)
        tgt = str(rel.target_id)
        # 如果指定了 series_name，按 metadata 过滤
        if series_name:
            meta = rel.extra_meta or {}
            if meta.get("series_name") and meta["series_name"] != series_name:
                continue
        # 使用 sort_order 作为目标节点的排序键
        order_val = rel.sort_order if rel.sort_order is not None else 0
        if tgt not in sort_map or order_val < sort_map[tgt]:
            sort_map[tgt] = order_val
        if src not in sort_map:
            sort_map[src] = 0  # source 默认 0

    # 按 sort_order 排序
    sorted_ids = sorted(sort_map.keys(), key=lambda x: sort_map.get(x, 0))

    if not sorted_ids:
        sorted_ids = [str(cid)]

    # 查询这些内容的标题
    sorted_uuids = [uuid.UUID(sid) for sid in sorted_ids]
    contents_result = await db.execute(
        select(Content).where(Content.id.in_(sorted_uuids), Content.is_deleted == False)
    )
    content_map = {str(c.id): c for c in contents_result.scalars().all()}

    items = []
    for sid in sorted_ids:
        c = content_map.get(sid)
        if c is None:
            continue
        items.append(SeriesItemResponse(
            id=sid,
            title=c.title,
            sort_order=sort_map.get(sid, 0),
        ))
    if not items:
        items = [SeriesItemResponse(id=str(content.id), title=content.title, sort_order=0)]

    # 找到当前内容的位置
    current_index = 0
    for i, item in enumerate(items):
        if item.id == str(cid):
            current_index = i
            break

    # 推断系列名称
    inferred_name = series_name
    if not inferred_name and all_relations:
        # 尝试从第一个关系的 metadata 获取
        for rel in all_relations:
            meta = rel.extra_meta or {}
            if meta.get("series_name"):
                inferred_name = meta["series_name"]
                break

    prev_item = items[current_index - 1] if current_index > 0 else None
    next_item = items[current_index + 1] if current_index < len(items) - 1 else None

    return SeriesInfoResponse(
        series_name=inferred_name,
        current_index=current_index,
        total=len(items),
        prev=prev_item,
        next=next_item,
        items=items,
    )
