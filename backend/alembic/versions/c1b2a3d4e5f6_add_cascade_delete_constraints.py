"""Add foreign keys with cascade delete constraints

Revision ID: c1b2a3d4e5f6
Revises: a3c1f8d9e4b2
Create Date: 2026-06-02 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'c1b2a3d4e5f6'
down_revision = 'a3c1f8d9e4b2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ContentChunk -> Content
    op.create_foreign_key(
        'fk_content_chunks_content_id',
        'content_chunks',
        'contents',
        ['content_id'],
        ['id'],
        ondelete='CASCADE'
    )
    
    # ContentTag -> Content
    op.create_foreign_key(
        'fk_content_tags_content_id',
        'content_tags',
        'contents',
        ['content_id'],
        ['id'],
        ondelete='CASCADE'
    )
    
    # ContentTag -> Tag
    op.create_foreign_key(
        'fk_content_tags_tag_id',
        'content_tags',
        'tags',
        ['tag_id'],
        ['id'],
        ondelete='CASCADE'
    )
    
    # ContentCategory -> Content
    op.create_foreign_key(
        'fk_content_categories_content_id',
        'content_categories',
        'contents',
        ['content_id'],
        ['id'],
        ondelete='CASCADE'
    )
    
    # ContentCategory -> Category
    op.create_foreign_key(
        'fk_content_categories_category_id',
        'content_categories',
        'categories',
        ['category_id'],
        ['id'],
        ondelete='CASCADE'
    )
    
    # CollectionItem -> Collection
    op.create_foreign_key(
        'fk_collection_items_collection_id',
        'collection_items',
        'collections',
        ['collection_id'],
        ['id'],
        ondelete='CASCADE'
    )
    
    # CollectionItem -> Content
    op.create_foreign_key(
        'fk_collection_items_content_id',
        'collection_items',
        'contents',
        ['content_id'],
        ['id'],
        ondelete='CASCADE'
    )
    
    # Annotation -> Content
    op.create_foreign_key(
        'fk_annotations_content_id',
        'annotations',
        'contents',
        ['content_id'],
        ['id'],
        ondelete='CASCADE'
    )
    
    # ContentRelation -> Content (source_id)
    op.create_foreign_key(
        'fk_content_relations_source_id',
        'content_relations',
        'contents',
        ['source_id'],
        ['id'],
        ondelete='CASCADE'
    )
    
    # ContentRelation -> Content (target_id)
    op.create_foreign_key(
        'fk_content_relations_target_id',
        'content_relations',
        'contents',
        ['target_id'],
        ['id'],
        ondelete='CASCADE'
    )
    
    # ProcessingTask -> Content
    op.create_foreign_key(
        'fk_processing_tasks_content_id',
        'processing_tasks',
        'contents',
        ['content_id'],
        ['id'],
        ondelete='CASCADE'
    )


def downgrade() -> None:
    # Drop all foreign keys
    op.drop_constraint('fk_content_chunks_content_id', 'content_chunks', type_='foreignkey')
    op.drop_constraint('fk_content_tags_content_id', 'content_tags', type_='foreignkey')
    op.drop_constraint('fk_content_tags_tag_id', 'content_tags', type_='foreignkey')
    op.drop_constraint('fk_content_categories_content_id', 'content_categories', type_='foreignkey')
    op.drop_constraint('fk_content_categories_category_id', 'content_categories', type_='foreignkey')
    op.drop_constraint('fk_collection_items_collection_id', 'collection_items', type_='foreignkey')
    op.drop_constraint('fk_collection_items_content_id', 'collection_items', type_='foreignkey')
    op.drop_constraint('fk_annotations_content_id', 'annotations', type_='foreignkey')
    op.drop_constraint('fk_content_relations_source_id', 'content_relations', type_='foreignkey')
    op.drop_constraint('fk_content_relations_target_id', 'content_relations', type_='foreignkey')
    op.drop_constraint('fk_processing_tasks_content_id', 'processing_tasks', type_='foreignkey')
