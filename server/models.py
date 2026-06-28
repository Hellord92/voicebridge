from __future__ import annotations
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import String, DateTime, Boolean, Integer, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


def new_uuid() -> str:
    return str(uuid.uuid4())


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class License(Base):
    __tablename__ = 'licenses'

    id:             Mapped[str]           = mapped_column(String(36),  primary_key=True, default=new_uuid)
    key:            Mapped[str]           = mapped_column(String(64),  unique=True, nullable=False, index=True)
    email:          Mapped[str]           = mapped_column(String(256), nullable=False)

    # Plan identifier, e.g. "free" | "min_60" | "min_120" | …
    plan_id:        Mapped[str]           = mapped_column(String(32),  nullable=False, default='free')

    # Total purchased minutes (0 = free trial only)
    minutes_total:  Mapped[int]           = mapped_column(Integer,     default=0)
    # Minutes consumed across all sessions
    minutes_used:   Mapped[int]           = mapped_column(Integer,     default=0)

    # Payment
    payment_method: Mapped[Optional[str]]    = mapped_column(String(32),  nullable=True)  # crypto | iban
    payment_ref:    Mapped[Optional[str]]    = mapped_column(String(128), nullable=True)
    payment_status: Mapped[str]           = mapped_column(String(16),  default='pending')  # pending|confirmed|refunded

    activated_at:   Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=now_utc)
    active:         Mapped[bool]          = mapped_column(Boolean, default=False)  # True after payment confirmed
    machine_id:     Mapped[Optional[str]]    = mapped_column(String(128), nullable=True)
    firebase_uid:   Mapped[Optional[str]]    = mapped_column(String(128), nullable=True, index=True)

    # Usage tracking
    last_used_at:   Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    session_count:  Mapped[int]           = mapped_column(Integer, default=0)


class Order(Base):
    """Tracks payment orders before license activation."""
    __tablename__ = 'orders'

    id:             Mapped[str]           = mapped_column(String(36),  primary_key=True, default=new_uuid)
    plan_id:        Mapped[str]           = mapped_column(String(32),  nullable=False)
    email:          Mapped[str]           = mapped_column(String(256), nullable=False)
    amount_usd:     Mapped[str]           = mapped_column(String(16),  nullable=False)  # decimal as string
    payment_method: Mapped[str]           = mapped_column(String(32),  nullable=False)  # crypto | iban
    payment_ref:    Mapped[Optional[str]]    = mapped_column(String(256), nullable=True)   # NowPayments payment_id / IBAN ref
    status:         Mapped[str]           = mapped_column(String(16),  default='pending')
    created_at:     Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=now_utc)
    confirmed_at:   Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    license_key:    Mapped[Optional[str]]    = mapped_column(String(64),  nullable=True)
    notes:          Mapped[Optional[str]]    = mapped_column(Text,        nullable=True)


class UsageEvent(Base):
    __tablename__ = 'usage_events'

    id:          Mapped[str]      = mapped_column(String(36), primary_key=True, default=new_uuid)
    license_key: Mapped[str]      = mapped_column(String(64), nullable=False, index=True)
    event:       Mapped[str]      = mapped_column(String(32), nullable=False)  # session_start|session_end|pipeline_call
    seconds:     Mapped[int]      = mapped_column(Integer, default=0)          # duration for session events
    created_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    meta:        Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
