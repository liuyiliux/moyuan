"""add questions table for RAG quiz generation

Revision ID: d4e5f6a7b8c9
Revises: c1b2a3d4e5f6
Create Date: 2026-06-03 20:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, None] = 'c1b2a3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'questions',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('content_id', UUID(as_uuid=True), sa.ForeignKey('contents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('q_type', sa.String(20), nullable=False),
        sa.Column('question', sa.Text(), nullable=False),
        sa.Column('options', JSONB, nullable=True),
        sa.Column('answer', sa.Text(), nullable=False),
        sa.Column('explanation', sa.Text(), nullable=True),
        sa.Column('source_chunk_id', UUID(as_uuid=True), sa.ForeignKey('content_chunks.id', ondelete='SET NULL'), nullable=True),
        sa.Column('page_number', sa.Integer(), nullable=True),
        sa.Column('difficulty', sa.String(10), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_questions_content_id', 'questions', ['content_id'])
    op.create_index('ix_questions_source_chunk_id', 'questions', ['source_chunk_id'])


def downgrade() -> None:
    op.drop_index('ix_questions_source_chunk_id', table_name='questions')
    op.drop_index('ix_questions_content_id', table_name='questions')
    op.drop_table('questions')
