"""分类（文件夹）管理 API

POST   /api/categories          — 创建分类
GET    /api/categories/tree      — 分类树形结构
GET    /api/categories          — 分类列表（扁平）
PATCH  /api/categories/{id}    — 更新分类名称 / 父分类
DELETE /api/categories/{id}    — 删除分类
POST   /api/contents/{id}/move-category — 移动内容到分类
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import Brain, Category, ContentCategory, Content

router = APIRouter(prefix="/api/categories", tags=["categories"])


# ── Schemas ──

class CategoryCreate(BaseModel):
    name: str
    parent_id: str | None = None
    brain_id: str | None = None


class CategoryUpdate(BaseModel):
    name: str | None = None
    parent_id: str | None = None  # 传 "null" 或 "" 表示移到根


class CategoryResponse(BaseModel):
    id: str
    name: str
    parent_id: str | None
    brain_id: str | None = None
    sort_order: int
    created_at: str

    model_config = {"from_attributes": True}


# ── Helpers ──

def _cat_resp(c: Category) -> dict:
    return {
        "id": str(c.id),
        "name": c.name,
        "parent_id": str(c.parent_id) if c.parent_id else None,
        "brain_id": str(c.brain_id) if c.brain_id else None,
        "sort_order": c.sort_order,
        "created_at": c.created_at.isoformat() if c.created_at else "",
    }


def _build_tree(categories: list[Category]) -> list[dict]:
    """把扁平列表转成树形结构"""
    lookup = {str(c.id): _cat_resp(c) for c in categories}
    for item in lookup.values():
        item["children"] = []
    roots = []
    for c in categories:
        item = lookup[str(c.id)]
        if c.parent_id and str(c.parent_id) in lookup:
            lookup[str(c.parent_id)]["children"].append(item)
        else:
            roots.append(item)
    return roots


async def _ensure_brain_exists(db: AsyncSession, brain_id) -> None:
    if brain_id is None:
        return
    if await db.get(Brain, brain_id) is None:
        raise HTTPException(status_code=404, detail="Brain not found")


def _parse_brain_uuid(brain_id: str | None):
    if not brain_id:
        return None
    from uuid import UUID
    try:
        return UUID(brain_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid brain_id")


# ── Routes ──

@router.post("", response_model=CategoryResponse, status_code=201)
async def create_category(body: CategoryCreate, db: AsyncSession = Depends(get_db)):
    """创建分类"""
    from uuid import UUID
    brain_uuid = _parse_brain_uuid(body.brain_id)
    parent_uuid = None
    if body.parent_id:
        try:
            parent_uuid = UUID(body.parent_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid parent_id")
        # 验证父分类存在
        pr = await db.execute(select(Category).where(Category.id == parent_uuid))
        parent = pr.scalar_one_or_none()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent category not found")
        brain_uuid = parent.brain_id
    else:
        await _ensure_brain_exists(db, brain_uuid)
    cat = Category(name=body.name, parent_id=parent_uuid, brain_id=brain_uuid)
    db.add(cat)
    await db.flush()
    await db.refresh(cat)
    # 新增分类后失效父分类的缓存
    if parent_uuid:
        from app.core.scope_cache import invalidate_scope_cache
        await invalidate_scope_cache(f"quiz:scope:category:{parent_uuid}")
        await invalidate_scope_cache(f"quiz:scope:category:*:{parent_uuid}")
    return _cat_resp(cat)


@router.get("/tree")
async def get_category_tree(brain_id: str | None = Query(None), db: AsyncSession = Depends(get_db)):
    """获取分类树形结构"""
    from uuid import UUID
    query = select(Category)
    if brain_id:
        brain_uuid = _parse_brain_uuid(brain_id)
        await _ensure_brain_exists(db, brain_uuid)
        query = query.where(Category.brain_id == brain_uuid)
    res = await db.execute(query.order_by(Category.sort_order, Category.name))
    return _build_tree(list(res.scalars().all()))


@router.get("", response_model=list[CategoryResponse])
async def list_categories(brain_id: str | None = Query(None), db: AsyncSession = Depends(get_db)):
    """扁平分类列表"""
    from uuid import UUID
    query = select(Category)
    if brain_id:
        brain_uuid = _parse_brain_uuid(brain_id)
        await _ensure_brain_exists(db, brain_uuid)
        query = query.where(Category.brain_id == brain_uuid)
    res = await db.execute(query.order_by(Category.name))
    return [_cat_resp(c) for c in res.scalars().all()]


@router.patch("/{cat_id}", response_model=CategoryResponse)
async def update_category(
    cat_id: str,
    body: CategoryUpdate,
    db: AsyncSession = Depends(get_db),
):
    """更新分类名称或父分类"""
    from uuid import UUID
    try:
        cid = UUID(cat_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid category id")
    res = await db.execute(select(Category).where(Category.id == cid))
    cat = res.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    if body.name is not None:
        cat.name = body.name
    if body.parent_id is not None:
        if body.parent_id == "" or body.parent_id.lower() == "null":
            cat.parent_id = None
        else:
            try:
                pid = UUID(body.parent_id)
            except Exception:
                raise HTTPException(status_code=400, detail="Invalid parent_id")
            if pid == cid:
                raise HTTPException(status_code=400, detail="Cannot set parent to self")
            pr = await db.execute(select(Category).where(Category.id == pid))
            parent = pr.scalar_one_or_none()
            if not parent:
                raise HTTPException(status_code=404, detail="Parent category not found")
            if parent.brain_id != cat.brain_id:
                raise HTTPException(status_code=400, detail="Parent category belongs to another brain")
            cat.parent_id = pid
    await db.flush()
    await db.refresh(cat)
    # 分类变更（含父分类变更）后失效相关缓存
    from app.core.scope_cache import invalidate_scope_cache
    await invalidate_scope_cache(f"quiz:scope:category:{cid}")
    await invalidate_scope_cache(f"quiz:scope:category:*:{cid}")
    if body.parent_id is not None and body.parent_id != "" and body.parent_id.lower() != "null":
        try:
            await invalidate_scope_cache(f"quiz:scope:category:{UUID(body.parent_id)}")
            await invalidate_scope_cache(f"quiz:scope:category:*:{UUID(body.parent_id)}")
        except Exception:
            pass
    return _cat_resp(cat)


@router.delete("/{cat_id}")
async def delete_category(cat_id: str, db: AsyncSession = Depends(get_db)):
    """删除分类（同时清除内容关联）"""
    from uuid import UUID
    try:
        cid = UUID(cat_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid category id")
    res = await db.execute(select(Category).where(Category.id == cid))
    cat = res.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    # 失效缓存（含自身和父分类）
    from app.core.scope_cache import invalidate_scope_cache
    await invalidate_scope_cache(f"quiz:scope:category:{cid}")
    await invalidate_scope_cache(f"quiz:scope:category:*:{cid}")
    if cat.parent_id:
        await invalidate_scope_cache(f"quiz:scope:category:{cat.parent_id}")
        await invalidate_scope_cache(f"quiz:scope:category:*:{cat.parent_id}")
    # 清除关联
    await db.execute(delete(ContentCategory).where(ContentCategory.category_id == cid))
    # 子分类提升（可选：这里简单删除，子分类也删）
    await db.delete(cat)
    await db.flush()
    return {"ok": True}


# ── 内容移动 ──

@router.post("/move-content/{content_id}")
async def move_content_to_category(
    content_id: str,
    category_id: str | None = None,  # None = 移出所有分类
    db: AsyncSession = Depends(get_db),
):
    """移动内容到指定分类（先清除旧关联，再新建）"""
    from uuid import UUID
    try:
        cid = UUID(content_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid content_id")
    # 验证内容存在
    cr = await db.execute(select(Content).where(Content.id == cid))
    content = cr.scalar_one_or_none()
    if not content:
        raise HTTPException(status_code=404, detail="Content not found")
    # 清除旧关联
    await db.execute(delete(ContentCategory).where(ContentCategory.content_id == cid))
    # 新建关联
    if category_id and category_id.lower() != "null":
        try:
            cat_id = UUID(category_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid category_id")
        cr2 = await db.execute(select(Category).where(Category.id == cat_id))
        category = cr2.scalar_one_or_none()
        if not category:
            raise HTTPException(status_code=404, detail="Category not found")
        if category.brain_id is not None and content.brain_id != category.brain_id:
            raise HTTPException(status_code=400, detail="Category belongs to another brain")
        db.add(ContentCategory(content_id=cid, category_id=cat_id))
    await db.flush()
    return {"ok": True}
