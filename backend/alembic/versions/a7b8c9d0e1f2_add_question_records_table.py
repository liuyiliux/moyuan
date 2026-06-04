"""add question_records table

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-06-04 11:40:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, None] = 'f6a7b8c9d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'question_records',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('question_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('questions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_answer', sa.Text(), nullable=False),
        sa.Column('is_correct', sa.Boolean(), nullable=False, default=False),
        sa.Column('answered_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_question_records_question_id', 'question_records', ['question_id'])
    op.create_index('ix_question_records_is_correct', 'question_records', ['is_correct'])


def downgrade() -> None:
    op.drop_index('ix_question_records_is_correct')
    op.drop_index('ix_question_records_question_id')
    op.drop_table('question_records')
