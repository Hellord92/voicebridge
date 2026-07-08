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
from fastapi.responses import Response, JSONResponse, StreamingResponse
from pydantic import BaseModel, EmailStr
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

from database import normalize_database_url
from config  import settings
from models  import Base, License, Order, UsageEvent
from pricing import PLANS, get_plan, FREE_TRIAL_SECONDS
from services.license       import (
    validate_license, create_license, activate_license, consume_minutes,
    pick_best_license, stack_minutes_on_license, deactivate_free_licenses,
    log_pipeline_usage, free_trial_seconds_used,
)
from services.tts_proxy     import synthesize
from services.pipeline_ai   import run_tiered_stt_translate, ai_response_headers, ai_tier_label
from services.optimizations import synthesize_streaming
from services.payments      import (
    create_crypto_payment, verify_nowpayments_signature,
    get_iban_details, generate_transfer_reference, CRYPTO_CURRENCIES,
)
from services.auth          import verify_firebase_token, is_firebase_token
from services.glossary      import apply_glossary
from voices import get_voice_id, list_voices

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(name)s: %(message)s')
log = logging.getLogger('voicebridge.server')

# ── DB ───────────────────────────────────────────────────────────────────────
engine = create_async_engine(normalize_database_url(settings.database_url), echo=False)
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
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

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


def resolve_license_key(_license: dict, request: Request) -> str:
    """Actual VB key for usage logging (Firebase JWT is not a license key)."""
    if _license.get('license_key'):
        return _license['license_key']
    token = request.headers.get('Authorization', '')[7:].strip()
    if is_firebase_token(token):
        raise HTTPException(401, 'License key not resolved for account')
    return token


async def validate_license_by_uid(db: AsyncSession, uid: str) -> dict:
    """Validate best active license for Firebase UID."""
    from pricing import get_plan, FREE_TRIAL_SECONDS
    stmt = select(License).where(License.firebase_uid == uid).order_by(License.activated_at.desc())
    lics = (await db.execute(stmt)).scalars().all()
    lic  = pick_best_license(list(lics))
    if lic is None:
        return {'valid': False, 'reason': 'no_active_license'}
    return await validate_license(db, lic.key)


# ── Health ────────────────────────────────────────────────────────────────────

@app.get('/health')
async def health(db: AsyncSession = Depends(get_db)):
    db_ok = True
    try:
        await db.execute(select(License).limit(1))
    except Exception:
        db_ok = False
    return {
        'status':   'ok' if db_ok else 'degraded',
        'db':       db_ok,
        'groq':     bool(settings.groq_api_key),
        'openai':   bool(settings.openai_api_key),
        'gemini':   bool(settings.gemini_api_key),
        'eleven':   bool(settings.elevenlabs_api_key),
        'firebase': bool(settings.firebase_service_account_json),
        'time':     datetime.now(timezone.utc).isoformat(),
    }


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

    # Return best license (paid preferred over free)
    active_lic = pick_best_license(list(lics))
    plan = get_plan(active_lic.plan_id)
    minutes_left = active_lic.minutes_total - active_lic.minutes_used
    trial_left = None
    if active_lic.plan_id == 'free':
        used = await free_trial_seconds_used(db, active_lic.key)
        trial_left = max(0, FREE_TRIAL_SECONDS - used)

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
            'minutes_left':  minutes_left if active_lic.plan_id != 'free' else (trial_left // 60 if trial_left else 0),
            'trial_seconds_left': trial_left,
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
        'referral_code': f'VBREF-{uid[:8].upper()}',
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


@app.get('/api/voices')
async def voices():
    return list_voices()


# ── Pipeline ──────────────────────────────────────────────────────────────────

@app.post('/api/pipeline')
@limiter.limit('100/minute')
async def pipeline(
    request:  Request,
    db:       AsyncSession = Depends(get_db),
    _license: dict = Depends(require_license),
):
    started_at  = datetime.now(timezone.utc)
    form        = await request.form()
    audio_bytes = await form['audio'].read()
    source_lang = str(form.get('source_lang', 'auto') or 'auto').strip()
    target_lang = str(form.get('target_lang', 'en') or 'en').strip()
    voice_gender = str(form.get('voice_gender', 'female') or 'female').strip()
    glossary_raw = str(form.get('glossary', '') or '')
    license_key = resolve_license_key(_license, request)
    free_trial = bool(_license.get('free_trial'))

    transcript, translation, ai_stack = await run_tiered_stt_translate(
        audio_bytes, source_lang, target_lang, free_trial=free_trial,
    )
    translation = apply_glossary(translation, glossary_raw)
    if not transcript:
        return JSONResponse({'transcript': '', 'translation': '', 'audio_b64': '', 'ai_tier': ai_stack.get('tier')})

    audio_b64 = ''
    tts_error = None
    try:
        mp3_bytes = await synthesize_streaming(
            translation, target_lang, voice_id=get_voice_id(voice_gender),
        )
        audio_b64 = base64.b64encode(mp3_bytes).decode('ascii')
    except Exception as e:
        tts_error = 'elevenlabs_failed'
        log.warning('TTS failed (STT/translate OK): %s', e)

    elapsed_s = int((datetime.now(timezone.utc) - started_at).total_seconds()) + 5
    processing_ms = int((datetime.now(timezone.utc) - started_at).total_seconds() * 1000)

    if free_trial:
        await log_pipeline_usage(db, license_key, elapsed_s)
    else:
        ok = await consume_minutes(db, license_key, elapsed_s)
        if not ok:
            raise HTTPException(402, 'minutes_exhausted')

    log.info(
        f'Pipeline [{source_lang}→{target_lang}] tier={ai_stack.get("tier")} '
        f'stt={ai_stack.get("stt")} tr={ai_stack.get("translate")} {processing_ms}ms: {transcript[:40]!r}'
    )
    return JSONResponse(
        {
            'transcript': transcript,
            'translation': translation,
            'audio_b64': audio_b64,
            'ai_tier': ai_stack.get('tier'),
            'ai_stt': ai_stack.get('stt'),
            'ai_translate': ai_stack.get('translate'),
            'tts_error': tts_error,
        },
        headers=ai_response_headers(ai_stack, processing_ms),
    )


@app.post('/api/pipeline/stream')
@limiter.limit('100/minute')
async def pipeline_stream(
    request:  Request,
    db:       AsyncSession = Depends(get_db),
    _license: dict = Depends(require_license),
):
    """SSE stream: emits transcript + translation events, then audio_b64."""
    import json as json_mod
    started_at = datetime.now(timezone.utc)
    form       = await request.form()
    audio_bytes = await form['audio'].read()
    source_lang = str(form.get('source_lang', 'auto') or 'auto').strip()
    target_lang = str(form.get('target_lang', 'en') or 'en').strip()
    voice_gender = str(form.get('voice_gender', 'female') or 'female').strip()
    glossary_raw = str(form.get('glossary', '') or '')
    license_key = resolve_license_key(_license, request)
    free_trial = bool(_license.get('free_trial'))

    async def generate():
        # ── 1. STT ────────────────────────────────────────────────────────────
        from services.optimizations import translation_cache, cache_key
        from languages import get_whisper_lang

        whisper_lang = get_whisper_lang(source_lang)
        stt_lang = whisper_lang or source_lang or 'auto'

        from services.pipeline_ai import transcribe_tiered, translate_tiered, ai_stack_for_tier
        transcript, stt_provider = await transcribe_tiered(audio_bytes, stt_lang, free_trial=free_trial)
        stack = ai_stack_for_tier(free_trial)
        stack['stt'] = stt_provider

        translation_applied = apply_glossary(transcript, glossary_raw) if transcript else ''
        yield f'data: {json_mod.dumps({"type": "transcript", "text": transcript, "ai_tier": stack.get("tier")})}\n\n'

        if not transcript:
            yield f'data: {json_mod.dumps({"type": "done"})}\n\n'
            return

        # ── 2. TR + TTS parallel ──────────────────────────────────────────────
        ck = cache_key(transcript, source_lang, target_lang)
        cached_tr = translation_cache.get(ck)

        if cached_tr:
            translation = cached_tr
            stack['translate'] = 'cache'
        else:
            translation, tr_provider = await translate_tiered(
                transcript, source_lang, target_lang, free_trial=free_trial,
            )
            translation_cache.put(ck, translation)
            stack['translate'] = tr_provider

        translation = apply_glossary(translation, glossary_raw)
        yield f'data: {json_mod.dumps({"type": "translation", "text": translation, "ai_stt": stack.get("stt"), "ai_translate": stack.get("translate")})}\n\n'

        # ── 3. TTS — fire immediately after TR ────────────────────────────────
        audio_b64 = ''
        processing_ms = int((datetime.now(timezone.utc) - started_at).total_seconds() * 1000)
        try:
            mp3_bytes = await synthesize_streaming(
                translation, target_lang, voice_id=get_voice_id(voice_gender),
            )
            audio_b64 = base64.b64encode(mp3_bytes).decode('ascii')
        except Exception as e:
            log.warning('Stream TTS failed: %s', e)
            yield f'data: {json_mod.dumps({"type": "tts_error", "message": "elevenlabs_failed"})}\n\n'

        # ── 4. Usage accounting ───────────────────────────────────────────────
        elapsed_s = int((datetime.now(timezone.utc) - started_at).total_seconds()) + 5
        if free_trial:
            await log_pipeline_usage(db, license_key, elapsed_s)
        else:
            ok = await consume_minutes(db, license_key, elapsed_s)
            if not ok:
                yield f'data: {json_mod.dumps({"type": "error", "message": "minutes_exhausted"})}\n\n'
                return

        yield f'data: {json_mod.dumps({"type": "audio_b64", "data": audio_b64, "processing_ms": processing_ms})}\n\n'
        yield f'data: {json_mod.dumps({"type": "done"})}\n\n'

        total_ms = int((datetime.now(timezone.utc) - started_at).total_seconds() * 1000)
        log.info(
            f'Pipeline [{source_lang}→{target_lang}] tier={stack.get("tier")} '
            f'stt={stack.get("stt")} tr={stack.get("translate")} {total_ms}ms: {transcript[:40]!r}'
        )

    return StreamingResponse(generate(), media_type='text/event-stream')


# ── TTS only ──────────────────────────────────────────────────────────────────

class TtsRequest(BaseModel):
    text: str
    target_lang: str = 'en'


@app.post('/api/tts')
@limiter.limit('60/minute')
async def tts_endpoint(
    request: Request,
    body: TtsRequest,
    db: AsyncSession = Depends(get_db),
    _license: dict = Depends(require_license),
):
    mp3 = await synthesize(body.text, body.target_lang)
    license_key = resolve_license_key(_license, request)
    if not _license.get('free_trial'):
        await consume_minutes(db, license_key, 30)
    else:
        await log_pipeline_usage(db, license_key, 30)
    return Response(content=mp3, media_type='audio/mpeg')


# ── OpenAI Realtime Session Token ─────────────────────────────────────────────

class RealtimeSessionRequest(BaseModel):
    source_lang: str = 'auto'
    target_lang: str = 'en'
    voice: str = 'alloy'  # OpenAI built-in voice (alloy/echo/fable/onyx/nova/shimmer)


@app.post('/api/realtime/session')
@limiter.limit('30/minute')
async def realtime_session(
    request: Request,
    body: RealtimeSessionRequest,
    db: AsyncSession = Depends(get_db),
    _license: dict = Depends(require_license),
):
    """
    Creates an OpenAI Realtime ephemeral session token.
    Client uses this to connect directly to OpenAI WebSocket (low latency).
    """
    if not settings.openai_api_key:
        raise HTTPException(503, 'OpenAI API key not configured on server')

    src = body.source_lang if body.source_lang != 'auto' else 'any language'
    system_prompt = (
        f'You are a professional real-time simultaneous interpreter. '
        f'The user speaks in {src}. '
        f'Translate everything they say into {body.target_lang}. '
        f'Output ONLY the translation — no labels, no explanations, no quotes. '
        f'If the input is noise, filler sounds, or incomplete, output nothing.'
    )

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            'https://api.openai.com/v1/realtime/sessions',
            headers={
                'Authorization': f'Bearer {settings.openai_api_key}',
                'Content-Type': 'application/json',
            },
            json={
                'model': 'gpt-4o-mini-realtime-preview',
                'modalities': ['text'],          # text output → we use ElevenLabs for TTS
                'instructions': system_prompt,
                'input_audio_format': 'pcm16',
                'input_audio_transcription': {'model': 'gpt-4o-mini-transcribe'},
                'turn_detection': {
                    'type': 'server_vad',
                    'threshold': 0.5,
                    'prefix_padding_ms': 300,
                    'silence_duration_ms': 400,
                },
            },
        )
        if resp.status_code != 200:
            raise HTTPException(502, f'OpenAI session error: {resp.text}')
        data = resp.json()

    return {
        'client_secret': data.get('client_secret', {}).get('value', ''),
        'session_id': data.get('id', ''),
        'expires_at': data.get('client_secret', {}).get('expires_at', 0),
    }


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
async def license_consume(
    request: Request,
    body: ConsumeRequest,
    db: AsyncSession = Depends(get_db),
    _license: dict = Depends(require_license),
):
    auth_key = request.headers.get('Authorization', '')[7:]
    if auth_key != body.licenseKey and not is_firebase_token(auth_key):
        raise HTTPException(403, 'Key mismatch')
    ok = await consume_minutes(db, body.licenseKey, body.seconds)
    return {'ok': ok}


class ReferralClaimRequest(BaseModel):
    ref_code: str


@app.post('/api/referral/claim')
@limiter.limit('20/hour')
async def referral_claim(
    request: Request,
    body: ReferralClaimRequest,
    db: AsyncSession = Depends(get_db),
    _license: dict = Depends(require_license),
):
    """Grant 15 bonus minutes to referrer when a new user claims their code."""
    referred_uid = _license.get('firebase_uid')
    if not referred_uid:
        raise HTTPException(400, 'Firebase sign-in required')

    ref = body.ref_code.strip().upper().replace('VBREF-', '')
    if len(ref) < 6:
        raise HTTPException(400, 'Invalid referral code')

    stmt = select(License).where(License.firebase_uid.like(f'{ref}%'), License.active == True)
    referrer_lic = (await db.execute(stmt)).scalar_one_or_none()
    if not referrer_lic:
        raise HTTPException(404, 'Referrer not found')

    referrer_uid = referrer_lic.firebase_uid or ''
    if referred_uid == referrer_uid or referred_uid.startswith(referrer_uid[:8]):
        raise HTTPException(400, 'Cannot use your own code')

    dup = select(UsageEvent).where(
        UsageEvent.event == 'referral_claim',
        UsageEvent.meta == referred_uid,
    )
    if (await db.execute(dup)).scalar_one_or_none():
        return {'ok': True, 'already_claimed': True}

    await db.execute(
        update(License)
        .where(License.id == referrer_lic.id)
        .values(minutes_total=referrer_lic.minutes_total + 15)
    )
    db.add(UsageEvent(
        license_key=referrer_lic.key,
        event='referral_claim',
        seconds=0,
        meta=referred_uid,
    ))
    await db.commit()
    return {'ok': True, 'minutes_granted': 15}


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

    if payment_status in ('finished', 'confirmed'):
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

    firebase_uid = ''
    existing_notes = order.notes or ''
    if existing_notes.startswith('firebase_uid:'):
        firebase_uid = existing_notes.split('firebase_uid:', 1)[1].split('\n')[0].strip()

    plan = get_plan(order.plan_id)

    # Stack minutes on existing paid license if same account
    existing_paid = None
    if firebase_uid:
        stmt2 = select(License).where(
            License.firebase_uid == firebase_uid,
            License.active == True,
            License.plan_id != 'free',
        )
        existing_paid = (await db.execute(stmt2)).scalar_one_or_none()

    if existing_paid:
        lic = await stack_minutes_on_license(db, existing_paid, order.plan_id)
        if firebase_uid:
            await deactivate_free_licenses(db, firebase_uid)
    else:
        lic = await create_license(
            db,
            email=order.email,
            plan_id=order.plan_id,
            payment_method=order.payment_method,
            payment_ref=order.payment_ref or payment_ref,
        )
        await activate_license(db, lic.key)
        if firebase_uid:
            await db.execute(
                update(License).where(License.id == lic.id).values(firebase_uid=firebase_uid)
            )
            await deactivate_free_licenses(db, firebase_uid)

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
    await send_license_email(
        order.email,
        lic.key,
        plan['name'] if plan else order.plan_id,
        plan['minutes'] if plan else 0,
    )
    return True


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == '__main__':
    import uvicorn
    uvicorn.run('main:app', host='0.0.0.0', port=settings.server_port, reload=True)
