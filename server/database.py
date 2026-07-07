"""Database URL normalization for SQLite and PostgreSQL (Railway)."""
from __future__ import annotations


def normalize_database_url(url: str) -> str:
    if url.startswith('postgres://'):
        url = url.replace('postgres://', 'postgresql+asyncpg://', 1)
    elif url.startswith('postgresql://') and '+asyncpg' not in url:
        url = url.replace('postgresql://', 'postgresql+asyncpg://', 1)
    return url
