"""scope tag unique indexes by brain

Revision ID: b8c9d0e1f2a3
Revises: d2233303312b
Create Date: 2026-06-08 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'b8c9d0e1f2a3'
down_revision: Union[str, None] = 'd2233303312b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_name_key")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_tags_brain_name "
        "ON tags (brain_id, name) WHERE brain_id IS NOT NULL"
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_tags_global_name "
        "ON tags (name) WHERE brain_id IS NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_tags_global_name")
    op.execute("DROP INDEX IF EXISTS uq_tags_brain_name")
    op.create_unique_constraint('tags_name_key', 'tags', ['name'])
