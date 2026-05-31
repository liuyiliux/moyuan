"""add content_relations table

Revision ID: a3c1f8d9e4b2
Revises: 21bd89ecb790
Create Date: 2026-05-30 12:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


# revision identifiers, used by Alembic.
revision: str = 'a3c1f8d9e4b2'
down_revision: Union[str, None] = '21bd89ecb790'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'content_relations',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('source_id', UUID(as_uuid=True), sa.ForeignKey('contents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('target_id', UUID(as_uuid=True), sa.ForeignKey('contents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('relation_type', sa.String(20), nullable=False),
        sa.Column('sort_order', sa.Integer(), server_default='0'),
        sa.Column('metadata', JSONB, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('source_id', 'target_id', 'relation_type', name='uq_content_relation'),
    )
    op.create_index('idx_content_relations_source', 'content_relations', ['source_id'])
    op.create_index('idx_content_relations_target', 'content_relations', ['target_id'])
    op.create_index('idx_content_relations_type', 'content_relations', ['relation_type'])


def downgrade() -> None:
    op.drop_index('idx_content_relations_type', table_name='content_relations')
    op.drop_index('idx_content_relations_target', table_name='content_relations')
    op.drop_index('idx_content_relations_source', table_name='content_relations')
    op.drop_table('content_relations')
