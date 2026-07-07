from __future__ import annotations
"""
License service — minute-based system with server-side free trial enforcement.
"""
import hashlib
import hmac
import secrets
from datetime import datetime, timezone, timedelta

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func

from config   import settings
from models   import License, Order, UsageEvent
from pricing  import get_plan, PLAN_BY_ID, FREE_TRIAL_SECONDS


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


async def free_trial_seconds_used(db: AsyncSession, key: str, window_minutes: int = 1440) -> int:
    """Sum pipeline usage seconds for free tier within rolling window (default: 24 hours)."""
    since = datetime.now(timezone.utc) - timedelta(minutes=window_minutes)
    stmt = select(func.coalesce(func.sum(UsageEvent.seconds), 0)).where(
        UsageEvent.license_key == key,
        UsageEvent.event == 'pipeline_call',
        UsageEvent.created_at >= since,
    )
    result = await db.execute(stmt)
    return int(result.scalar_one() or 0)


async def log_pipeline_usage(db: AsyncSession, key: str, seconds: int) -> None:
    if settings.dev_unlimited_trial:
        return
    ev = UsageEvent(license_key=key, event='pipeline_call', seconds=seconds)
    db.add(ev)
    await db.execute(
        update(License)
        .where(License.key == key)
        .values(last_used_at=datetime.now(timezone.utc))
    )
    await db.commit()


def pick_best_license(lics: list[License]) -> License | None:
    """Prefer active paid license with most minutes remaining."""
    active = [l for l in lics if l.active]
    if not active:
        return lics[0] if lics else None
    paid = [l for l in active if l.plan_id != 'free']
    if paid:
        return max(paid, key=lambda l: l.minutes_total - l.minutes_used)
    return active[0]


async def create_license(
    db: AsyncSession,
    email: str,
    plan_id: str,
    payment_method: str = None,
    payment_ref: str | None = None,
) -> License:
    plan   = get_plan(plan_id)
    key    = generate_key(plan_id)
    active = (plan_id == 'free')

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


async def stack_minutes_on_license(db: AsyncSession, lic: License, plan_id: str) -> License:
    """Add purchased minutes to existing license instead of creating new key."""
    plan = get_plan(plan_id)
    if not plan:
        return lic
    new_total = lic.minutes_total + plan['minutes']
    await db.execute(
        update(License)
        .where(License.id == lic.id)
        .values(minutes_total=new_total, plan_id=plan_id if lic.plan_id == 'free' else lic.plan_id)
    )
    await db.commit()
    await db.refresh(lic)
    return lic


async def deactivate_free_licenses(db: AsyncSession, firebase_uid: str) -> None:
    await db.execute(
        update(License)
        .where(License.firebase_uid == firebase_uid, License.plan_id == 'free')
        .values(active=False)
    )
    await db.commit()


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
    if settings.dev_skip_license_verify and key.startswith('VB-'):
        return {
            'valid':              True,
            'plan_id':            'free',
            'plan_name':          'Dev (unlimited trial)',
            'minutes_total':      0,
            'minutes_used':       0,
            'minutes_left':       FREE_TRIAL_SECONDS // 60,
            'free_trial':         True,
            'trial_seconds_left': FREE_TRIAL_SECONDS,
            'license_key':        key,
            'dev_mode':           True,
            'ai_tier':            'trial',
            'ai_stt':             'groq',
            'ai_translate':       'groq',
        }

    if not verify_key_format(key):
        return {'valid': False, 'reason': 'invalid_format'}

    stmt = select(License).where(License.key == key)
    lic  = (await db.execute(stmt)).scalar_one_or_none()

    if lic is None:
        return {'valid': False, 'reason': 'not_found'}

    plan = get_plan(lic.plan_id)

    if lic.plan_id == 'free':
        if not lic.active:
            return {'valid': False, 'reason': 'payment_pending'}
        if settings.dev_unlimited_trial:
            return {
                'valid':              True,
                'plan_id':            lic.plan_id,
                'minutes_total':      0,
                'minutes_used':       0,
                'minutes_left':       FREE_TRIAL_SECONDS // 60,
                'free_trial':         True,
                'trial_seconds_left': FREE_TRIAL_SECONDS,
                'license_key':        lic.key,
                'dev_mode':           True,
                'ai_tier':            'trial',
                'ai_stt':             'groq',
                'ai_translate':       'groq',
            }
        used = await free_trial_seconds_used(db, key)
        if used >= FREE_TRIAL_SECONDS:
            return {'valid': False, 'reason': 'trial_session_exhausted', 'seconds_used': used}
        return {
            'valid':          True,
            'plan_id':        lic.plan_id,
            'minutes_total':  0,
            'minutes_used':   0,
            'minutes_left':   max(0, (FREE_TRIAL_SECONDS - used) // 60),
            'free_trial':     True,
            'trial_seconds_left': max(0, FREE_TRIAL_SECONDS - used),
            'license_key':    lic.key,
            'ai_tier':        'trial',
            'ai_stt':         'groq',
            'ai_translate':   'groq',
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
        'license_key':   lic.key,
        'ai_tier':       'premium',
        'ai_stt':        'openai',
        'ai_translate':  'gemini',
    }


async def consume_minutes(db: AsyncSession, key: str, seconds: int) -> bool:
    minutes_to_add = max(1, (seconds + 59) // 60)

    stmt = select(License).where(License.key == key)
    lic  = (await db.execute(stmt)).scalar_one_or_none()
    if not lic or not lic.active:
        return False

    if lic.plan_id == 'free':
        await log_pipeline_usage(db, key, seconds)
        return True

    new_used = lic.minutes_used + minutes_to_add
    if new_used > lic.minutes_total:
        return False

    await db.execute(
        update(License)
        .where(License.key == key)
        .values(minutes_used=new_used, last_used_at=datetime.now(timezone.utc))
    )
    ev = UsageEvent(license_key=key, event='pipeline_call', seconds=seconds)
    db.add(ev)
    await db.commit()
    return True
