from __future__ import annotations
"""
License service — minute-based system.
Key format:  VB-{tier_prefix}-{hmac_hex[:12]}-{hmac_hex[12:24]}-{sig4}
"""
import hashlib
import hmac
import secrets
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from config   import settings
from models   import License, Order, UsageEvent
from pricing  import get_plan, PLAN_BY_ID


TIER_PREFIX = {
    'free':    'F',
    'min_60':  'S',
    'min_120': 'B',
    'min_240': 'T',
    'min_360': 'P',
    'min_480': 'U',
    'min_600': 'E',
}


def _sign(inner: str) -> str:
    return hmac.new(settings.license_secret.encode(), inner.encode(), hashlib.sha256).hexdigest()[:4].upper()


def generate_key(plan_id: str = 'min_240') -> str:
    """Generates a key like VB-T-A1B2C3-D4E5F6-G7H8"""
    prefix = TIER_PREFIX.get(plan_id, 'T')
    p1     = secrets.token_hex(3).upper()
    p2     = secrets.token_hex(3).upper()
    inner  = f'{p1}-{p2}'
    sig    = _sign(inner)
    return f'VB-{prefix}-{inner}-{sig}'


def verify_key_format(key: str) -> bool:
    parts = key.split('-')
    if len(parts) != 5 or parts[0] != 'VB':
        return False
    inner = f'{parts[2]}-{parts[3]}'
    return parts[4] == _sign(inner)


async def create_license(
    db:      AsyncSession,
    email:   str,
    plan_id: str,
    payment_method: str = None,
    payment_ref:    str | None = None,
) -> License:
    plan   = get_plan(plan_id)
    key    = generate_key(plan_id)
    active = (plan_id == 'free')  # free licenses activate immediately

    lic = License(
        key=key,
        email=email,
        plan_id=plan_id,
        minutes_total=plan['minutes'] if plan_id != 'free' else 0,
        payment_method=payment_method,
        payment_ref=payment_ref,
        payment_status='confirmed' if active else 'pending',
        active=active,
    )
    db.add(lic)
    await db.commit()
    await db.refresh(lic)
    return lic


async def activate_license(db: AsyncSession, key: str) -> bool:
    stmt = (
        update(License)
        .where(License.key == key)
        .values(active=True, payment_status='confirmed')
    )
    result = await db.execute(stmt)
    await db.commit()
    return result.rowcount > 0


async def validate_license(db: AsyncSession, key: str) -> dict:
    if not verify_key_format(key):
        return {'valid': False, 'reason': 'invalid_format'}

    stmt  = select(License).where(License.key == key)
    lic   = (await db.execute(stmt)).scalar_one_or_none()

    if lic is None:
        return {'valid': False, 'reason': 'not_found'}

    plan = get_plan(lic.plan_id)

    # Free tier: always valid (session timer handled client-side)
    if lic.plan_id == 'free' or not lic.active:
        if not lic.active:
            return {'valid': False, 'reason': 'payment_pending'}
        return {
            'valid':          True,
            'plan_id':        lic.plan_id,
            'minutes_total':  0,
            'minutes_used':   0,
            'minutes_left':   None,  # managed client-side
            'free_trial':     True,
        }

    if not lic.active:
        return {'valid': False, 'reason': 'payment_pending'}

    minutes_left = lic.minutes_total - lic.minutes_used
    if minutes_left <= 0:
        return {'valid': False, 'reason': 'minutes_exhausted', 'minutes_used': lic.minutes_used}

    return {
        'valid':         True,
        'plan_id':       lic.plan_id,
        'plan_name':     plan['name'] if plan else lic.plan_id,
        'minutes_total': lic.minutes_total,
        'minutes_used':  lic.minutes_used,
        'minutes_left':  minutes_left,
        'free_trial':    False,
    }


async def consume_minutes(db: AsyncSession, key: str, seconds: int) -> bool:
    """
    Deduct `seconds` of usage from the license.
    Returns False if out of minutes.
    """
    minutes_to_add = max(1, (seconds + 59) // 60)  # round up to nearest minute

    stmt = select(License).where(License.key == key)
    lic  = (await db.execute(stmt)).scalar_one_or_none()
    if not lic or not lic.active:
        return False

    new_used = lic.minutes_used + minutes_to_add
    if new_used > lic.minutes_total:
        new_used = lic.minutes_total  # cap at total

    await db.execute(
        update(License)
        .where(License.key == key)
        .values(minutes_used=new_used, last_used_at=datetime.now(timezone.utc))
    )

    # Log usage event
    ev = UsageEvent(license_key=key, event='pipeline_call', seconds=seconds)
    db.add(ev)
    await db.commit()
    return True
