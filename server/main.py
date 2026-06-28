from __future__ import annotations
"""
VoiceBridge API Server — v2 (minute-based, crypto + IBAN payments)

Endpoints
─────────
GET  /health
POST /api/pipeline              — WAV → STT → translate → TTS (license required)
POST /api/tts                   — TTS only (extension)
POST /api/auth/me               — Firebase token → account + license info
POST /api/license/validate      — validate key or Firebase token
POST /api/license/consume       — deduct usage seconds from license

POST /api/orders/create         — create order (crypto or IBAN)
POST /api/payments/crypto/webhook  — NOWPayments IPN callback
POST /api/payments/iban/confirm    — admin: confirm IBAN transfer
GET  /api/orders/{order_id}     — order status
GET  /api/pricing               — return all plans
"""
import base64
import hashlib
import hmac
import logging
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import httpx
from fastapi import FastAPI, HTTPException, Request, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel, EmailStr
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

from config  import settings
from models  import Base, License, Order, UsageEvent
from pricing import PLANS, get_plan
from services.license       import validate_license, create_license, activate_license, consume_minutes
from services.tts_proxy     import synthesize
from services.stt           import transcribe
from services.translate     import translate
from services.optimizations import synthesize_streaming, translation_cache, cache_key
from services.payments      import (
    create_crypto_payment, verify_nowpayments_signature,
    get_iban_details, generate_transfer_reference, CRYPTO_CURRENCIES,
)
from services.auth          import verify_firebase_token, is_firebase_token
from languages import get_whisper_lang

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(name)s: %(message)s')
log = logging.getLogger('voicebridge.server')

# ── DB ───────────────────────────────────────────────────────────────────────
engine = create_async_engine(settings.database_url, echo=False)
SessionFactory = async_sessionmaker(engine, expire_on_commit=False)


async def get_db():
    async with SessionFactory() as session:
        yield session


# ── App lifespan ─────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        log.info('Database ready')
    except Exception as e:
        log.error(f'Database init error: {e}')
    yield
    await engine.dispose()


limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title='VoiceBridge API', version='2.0.0', lifespan=lifespan)
app.state.limiter = limiter

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_cors_origins(),
    allow_methods=['*'],
    allow_headers=['*'],
)


# ── Auth helper ───────────────────────────────────────────────────────────────

async def require_license(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    auth = request.headers.get('Authorization', '')
    if not auth.startswith('Bearer '):
        raise HTTPException(401, 'Missing license key')
    token = auth[7:].strip()

    # Firebase JWT → look up license by firebase_uid
    if is_firebase_token(token):
        try:
            fb = verify_firebase_token(token)
        except ValueError as e:
            raise HTTPException(403, str(e))
        result = await validate_license_by_uid(db, fb['uid'])
        if not result['valid']:
            raise HTTPException(403, result.get('reason', 'invalid'))
        result['firebase_uid'] = fb['uid']
        result['email']        = fb['email']
        return result

    # Classic VB-xxx key
    result = await validate_license(db, token)
    if not result['valid']:
        raise HTTPException(403, result.get('reason', 'invalid'))
    return result


async def validate_license_by_uid(db: AsyncSession, uid: str) -> dict:
    """Validate a license by Firebase UID."""
    from models   import License
    from pricing  import get_plan
    stmt  = select(License).where(License.firebase_uid == uid, License.active == True)
    lic   = (await db.execute(stmt)).scalar_one_or_none()
    if lic is None:
        return {'valid': False, 'reason': 'no_active_license'}
    plan = get_plan(lic.plan_id)
    minutes_left = lic.minutes_total - lic.minutes_used
    if minutes_left <= 0 and lic.plan_id != 'free':
        return {'valid': False, 'reason': 'minutes_exhausted', 'minutes_used': lic.minutes_used}
    return {
        'valid':         True,
        'plan_id':       lic.plan_id,
        'plan_name':     plan['name'] if plan else lic.plan_id,
        'minutes_total': lic.minutes_total,
        'minutes_used':  lic.minutes_used,
        'minutes_left':  minutes_left if lic.plan_id != 'free' else None,
        'free_trial':    lic.plan_id == 'free',
        'license_key':   lic.key,
    }


# ── Health ────────────────────────────────────────────────────────────────────

@app.get('/health')
async def health():
    return {'status': 'ok', 'time': datetime.now(timezone.utc).isoformat()}


# ── Auth: Firebase → account info ─────────────────────────────────────────────

@app.post('/api/auth/me')
@limiter.limit('60/minute')
async def auth_me(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Called by website/Electron after Firebase login.
    Returns account info + license status for this Firebase UID.
    Creates a free-tier account on first login.
    """
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        raise HTTPException(401, 'Missing token')

    id_token = auth_header[7:].strip()
    if not is_firebase_token(id_token):
        raise HTTPException(400, 'Expected Firebase ID token')

    try:
        fb = verify_firebase_token(id_token)
    except ValueError as e:
        raise HTTPException(403, str(e))

    uid, email = fb['uid'], fb['email']

    # Find existing license for this UID
    from models  import License
    from pricing import get_plan
    stmt = select(License).where(License.firebase_uid == uid).order_by(License.activated_at.desc())
    lics = (await db.execute(stmt)).scalars().all()

    if not lics:
        # First login → create free trial license
        lic = await create_license(db, email=email, plan_id='free')
        await db.execute(
            update(License).where(License.id == lic.id).values(firebase_uid=uid)
        )
        await db.commit()
        lics = [lic]

    # Return the active/most recent license
    active_lic = next((l for l in lics if l.active), lics[0])
    plan = get_plan(active_lic.plan_id)
    minutes_left = active_lic.minutes_total - active_lic.minutes_used

    return {
        'uid':           uid,
        'email':         email,
        'name':          fb.get('name'),
        'license': {
            'key':           active_lic.key,
            'plan_id':       active_lic.plan_id,
            'plan_name':     plan['name'] if plan else active_lic.plan_id,
            'minutes_total': active_lic.minutes_total,
            'minutes_used':  active_lic.minutes_used,
            'minutes_left':  minutes_left if active_lic.plan_id != 'free' else None,
            'free_trial':    active_lic.plan_id == 'free',
            'active':        active_lic.active,
        },
        'all_licenses': [
            {
                'key':      l.key,
                'plan_id':  l.plan_id,
                'active':   l.active,
                'minutes_left': l.minutes_total - l.minutes_used,
            }
            for l in lics
        ],
    }


# ── Pricing ───────────────────────────────────────────────────────────────────

@app.get('/api/pricing')
async def pricing():
    return [
        {
            'id':           p['id'],
            'name':         p['name'],
            'minutes':      p['minutes'],
            'price_usd':    str(p['price_usd']),
            'discount_pct': p['discount_pct'],
            'per_min_usd':  str(p['per_min_usd']),
            'description':  p['description'],
            'highlight':    p['highlight'],
        }
        for p in PLANS
    ]


# ── Pipeline ──────────────────────────────────────────────────────────────────

@app.post('/api/pipeline')
@limiter.limit('100/minute')
async def pipeline(
    request:  Request,
    db:       AsyncSession = Depends(get_db),
    _license: dict = Depends(require_license),
):
    form        = await request.form()
    audio_bytes = await form['audio'].read()
    source_lang = form.get('source_lang', 'auto')
    target_lang = form.get('target_lang', 'en')
    license_key = request.headers['Authorization'][7:]
    started_at  = datetime.now(timezone.utc)

    whisper_lang = get_whisper_lang(source_lang)
    transcript   = await transcribe(audio_bytes, whisper_lang or 'auto')
    if not transcript:
        return JSONResponse({'transcript': '', 'translation': '', 'audio_b64': ''})

    ck = cache_key(transcript, source_lang, target_lang)
    translation = translation_cache.get(ck)
    if not translation:
        translation = await translate(transcript, source_lang, target_lang)
        translation_cache.put(ck, translation)

    mp3_bytes = await synthesize_streaming(translation, target_lang)
    audio_b64 = base64.b64encode(mp3_bytes).decode('ascii')

    # Consume minutes (non-free licenses)
    elapsed_s = int((datetime.now(timezone.utc) - started_at).total_seconds()) + 5
    if not _license.get('free_trial'):
        await consume_minutes(db, license_key, elapsed_s)

    log.info(f'Pipeline [{source_lang}→{target_lang}]: {transcript[:40]!r}')
    return {'transcript': transcript, 'translation': translation, 'audio_b64': audio_b64}


# ── TTS only ──────────────────────────────────────────────────────────────────

class TtsRequest(BaseModel):
    text: str
    target_lang: str = 'en'


@app.post('/api/tts')
@limiter.limit('60/minute')
async def tts_endpoint(request: Request, body: TtsRequest, _license: dict = Depends(require_license)):
    mp3 = await synthesize(body.text, body.target_lang)
    return Response(content=mp3, media_type='audio/mpeg')


# ── License validate / consume ────────────────────────────────────────────────

class ValidateRequest(BaseModel):
    licenseKey: str


@app.post('/api/license/validate')
@limiter.limit('30/minute')
async def license_validate(request: Request, body: ValidateRequest, db: AsyncSession = Depends(get_db)):
    return await validate_license(db, body.licenseKey)


class ConsumeRequest(BaseModel):
    licenseKey: str
    seconds:    int


@app.post('/api/license/consume')
@limiter.limit('200/minute')
async def license_consume(request: Request, body: ConsumeRequest, db: AsyncSession = Depends(get_db)):
    ok = await consume_minutes(db, body.licenseKey, body.seconds)
    return {'ok': ok}


# ── Order creation ────────────────────────────────────────────────────────────

class OrderCreateRequest(BaseModel):
    plan_id:        str
    email:          str
    payment_method: str   # 'crypto' | 'iban'
    crypto_currency: str = 'USDT'
    firebase_uid:   str = ''   # optional — link license to Firebase account


@app.post('/api/orders/create', status_code=201)
@limiter.limit('20/minute')
async def order_create(request: Request, body: OrderCreateRequest, db: AsyncSession = Depends(get_db)):
    plan = get_plan(body.plan_id)
    if not plan or body.plan_id == 'free':
        raise HTTPException(400, 'Invalid plan')
    if body.payment_method not in ('crypto', 'iban'):
        raise HTTPException(400, 'payment_method must be crypto or iban')

    order_id = str(uuid.uuid4())[:8].upper()
    amount   = plan['price_usd']

    order = Order(
        id=order_id,
        plan_id=body.plan_id,
        email=body.email,
        amount_usd=str(amount),
        payment_method=body.payment_method,
        status='pending',
    )

    if body.payment_method == 'crypto':
        try:
            np_data = await create_crypto_payment(
                order_id=order_id,
                amount_usd=amount,
                currency=body.crypto_currency,
                email=body.email,
            )
            order.payment_ref = str(np_data.get('payment_id', ''))
            payment_info = {
                'method':       'crypto',
                'pay_address':  np_data.get('pay_address'),
                'pay_amount':   np_data.get('pay_amount'),
                'pay_currency': np_data.get('pay_currency', body.crypto_currency).upper(),
                'invoice_url':  np_data.get('invoice_url', ''),
                'payment_id':   np_data.get('payment_id'),
            }
        except Exception as e:
            log.error(f'NOWPayments error: {e}')
            raise HTTPException(502, 'Payment provider error — try IBAN')
    else:  # iban
        ref = generate_transfer_reference(order_id)
        order.payment_ref = ref
        iban = get_iban_details()
        payment_info = {
            'method':          'iban',
            'reference':       ref,
            'amount_usd':      str(amount),
            'account_holder':  iban['account_holder'],
            'iban':            iban['iban'],
            'bic_swift':       iban['bic_swift'],
            'bank_name':       iban['bank_name'],
            'instructions':    f'Please include reference {ref} in the payment description.',
            'note':            'License key will be emailed within 24 hours of payment confirmation.',
        }

    db.add(order)
    await db.commit()
    # Persist firebase_uid on order notes so _confirm_order can read it
    if body.firebase_uid:
        await db.execute(
            update(Order).where(Order.id == order_id).values(notes=f'firebase_uid:{body.firebase_uid}')
        )
        await db.commit()

    log.info(f'Order {order_id} created — {body.plan_id} via {body.payment_method} for {body.email}')
    return {'order_id': order_id, 'status': 'pending', 'payment': payment_info}


# ── Order status ──────────────────────────────────────────────────────────────

@app.get('/api/orders/{order_id}')
async def order_status(order_id: str, db: AsyncSession = Depends(get_db)):
    stmt  = select(Order).where(Order.id == order_id.upper())
    order = (await db.execute(stmt)).scalar_one_or_none()
    if not order:
        raise HTTPException(404, 'Order not found')
    return {
        'order_id':      order.id,
        'plan_id':       order.plan_id,
        'status':        order.status,
        'license_key':   order.license_key if order.status == 'confirmed' else None,
        'created_at':    order.created_at.isoformat(),
        'confirmed_at':  order.confirmed_at.isoformat() if order.confirmed_at else None,
    }


# ── NOWPayments IPN webhook ───────────────────────────────────────────────────

@app.post('/api/payments/crypto/webhook')
async def crypto_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    body = await request.body()
    sig  = request.headers.get('x-nowpayments-sig', '')

    if settings.nowpayments_ipn_secret and not verify_nowpayments_signature(body, sig):
        raise HTTPException(400, 'Invalid signature')

    import json
    data          = json.loads(body)
    payment_id    = str(data.get('payment_id', ''))
    payment_status = data.get('payment_status', '')
    order_id      = data.get('order_id', '').upper()

    log.info(f'NOWPayments IPN: order={order_id} status={payment_status}')

    if payment_status in ('finished', 'confirmed', 'partially_paid'):
        await _confirm_order(db, order_id, payment_ref=payment_id)

    return {'received': True}


# ── Admin: confirm IBAN payment ───────────────────────────────────────────────

class IbanConfirmRequest(BaseModel):
    order_id:  str
    admin_key: str
    notes:     str = ''


@app.post('/api/payments/iban/confirm')
async def iban_confirm(body: IbanConfirmRequest, db: AsyncSession = Depends(get_db)):
    expected = hmac.new(settings.license_secret.encode(), b'admin', digestmod=hashlib.sha256).hexdigest()
    if body.admin_key != expected:
        raise HTTPException(403, 'Forbidden')
    ok = await _confirm_order(db, body.order_id.upper(), notes=body.notes)
    if not ok:
        raise HTTPException(404, 'Order not found or already confirmed')
    return {'ok': True}


async def _confirm_order(db: AsyncSession, order_id: str, payment_ref: str = '', notes: str = '') -> bool:
    stmt  = select(Order).where(Order.id == order_id)
    order = (await db.execute(stmt)).scalar_one_or_none()
    if not order or order.status == 'confirmed':
        return False

    # Extract firebase_uid from notes if present
    firebase_uid = ''
    existing_notes = order.notes or ''
    if existing_notes.startswith('firebase_uid:'):
        firebase_uid = existing_notes.split('firebase_uid:', 1)[1].split('\n')[0].strip()

    # Create the license
    lic = await create_license(
        db,
        email=order.email,
        plan_id=order.plan_id,
        payment_method=order.payment_method,
        payment_ref=order.payment_ref or payment_ref,
    )
    await activate_license(db, lic.key)

    # Link to Firebase account if uid provided
    if firebase_uid:
        await db.execute(
            update(License).where(License.id == lic.id).values(firebase_uid=firebase_uid)
        )

    # Update order
    full_notes = f'{existing_notes}\n{notes}'.strip() if notes else existing_notes
    await db.execute(
        update(Order)
        .where(Order.id == order_id)
        .values(
            status='confirmed',
            license_key=lic.key,
            confirmed_at=datetime.now(timezone.utc),
            notes=full_notes,
        )
    )
    await db.commit()

    log.info(f'Order {order_id} confirmed → license {lic.key} for {order.email}')
    # TODO: send license key by email (Resend / SendGrid)
    return True


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == '__main__':
    import uvicorn
    uvicorn.run('main:app', host='0.0.0.0', port=settings.server_port, reload=True)
