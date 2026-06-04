"""add created_at to collection_items

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-06-04 10:55:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f6a7b8c9d0e1'
down_revision: Union[str, None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('collection_items',
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column('collection_items', 'created_at')
