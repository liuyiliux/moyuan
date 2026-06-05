"""quiz_optimization_add_fields

Revision ID: d2233303312b
Revises: a7b8c9d0e1f2
Create Date: 2026-06-05 15:51:04.328576
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector


# revision identifiers, used by Alembic.
revision: str = 'd2233303312b'
down_revision: Union[str, None] = 'a7b8c9d0e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # content_chunks: add disable_quiz and difficulty
    op.add_column('content_chunks', sa.Column('disable_quiz', sa.Boolean(), server_default=sa.text('false'), nullable=False))
    op.add_column('content_chunks', sa.Column('difficulty', sa.Integer(), nullable=True))

    # questions: add embedding (vector), source_chunk_ids, source_content_ids
    op.add_column('questions', sa.Column('embedding', Vector(4096), nullable=True))
    op.add_column('questions', sa.Column('source_chunk_ids', sa.dialects.postgresql.JSONB(), nullable=True))
    op.add_column('questions', sa.Column('source_content_ids', sa.dialects.postgresql.JSONB(), nullable=True))

    # collections: add enable field
    op.add_column('collections', sa.Column('enable', sa.Boolean(), server_default=sa.text('true'), nullable=False))


def downgrade() -> None:
    op.drop_column('collections', 'enable')
    op.drop_column('questions', 'source_content_ids')
    op.drop_column('questions', 'source_chunk_ids')
    op.drop_column('questions', 'embedding')
    op.drop_column('content_chunks', 'difficulty')
    op.drop_column('content_chunks', 'disable_quiz')
