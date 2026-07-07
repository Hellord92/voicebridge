"""Initial schema — licenses, orders, usage_events

Revision ID: 001_initial
"""
from alembic import op
import sqlalchemy as sa

revision = '001_initial'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'licenses',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('key', sa.String(64), nullable=False, unique=True),
        sa.Column('email', sa.String(256), nullable=False),
        sa.Column('plan_id', sa.String(32), nullable=False),
        sa.Column('minutes_total', sa.Integer(), default=0),
        sa.Column('minutes_used', sa.Integer(), default=0),
        sa.Column('payment_method', sa.String(32), nullable=True),
        sa.Column('payment_ref', sa.String(128), nullable=True),
        sa.Column('payment_status', sa.String(16), default='pending'),
        sa.Column('activated_at', sa.DateTime(timezone=True)),
        sa.Column('active', sa.Boolean(), default=False),
        sa.Column('machine_id', sa.String(128), nullable=True),
        sa.Column('firebase_uid', sa.String(128), nullable=True),
        sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('session_count', sa.Integer(), default=0),
    )
    op.create_index('ix_licenses_key', 'licenses', ['key'])
    op.create_index('ix_licenses_firebase_uid', 'licenses', ['firebase_uid'])

    op.create_table(
        'orders',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('plan_id', sa.String(32), nullable=False),
        sa.Column('email', sa.String(256), nullable=False),
        sa.Column('amount_usd', sa.String(16), nullable=False),
        sa.Column('payment_method', sa.String(32), nullable=False),
        sa.Column('payment_ref', sa.String(256), nullable=True),
        sa.Column('status', sa.String(16), default='pending'),
        sa.Column('created_at', sa.DateTime(timezone=True)),
        sa.Column('confirmed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('license_key', sa.String(64), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
    )

    op.create_table(
        'usage_events',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('license_key', sa.String(64), nullable=False),
        sa.Column('event', sa.String(32), nullable=False),
        sa.Column('seconds', sa.Integer(), default=0),
        sa.Column('created_at', sa.DateTime(timezone=True)),
        sa.Column('meta', sa.String(512), nullable=True),
    )
    op.create_index('ix_usage_events_license_key', 'usage_events', ['license_key'])


def downgrade() -> None:
    op.drop_table('usage_events')
    op.drop_table('orders')
    op.drop_table('licenses')
