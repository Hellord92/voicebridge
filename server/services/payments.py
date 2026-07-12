from __future__ import annotations
"""
Payment services — Crypto (NOWPayments) + IBAN bank transfer.
No Stripe, no credit cards.
"""
import hashlib
import hmac
import secrets
import string
from datetime import datetime, timezone
from decimal import Decimal

import httpx

from config import settings


# ── NOWPayments (crypto) ──────────────────────────────────────────────────────

NOWPAYMENTS_BASE = 'https://api.nowpayments.io/v1'

CRYPTO_CURRENCIES = [
    {'code': 'BTC',   'name': 'Bitcoin',              'icon': '₿', 'np_code': 'btc'},
    {'code': 'ETH',   'name': 'Ethereum',             'icon': 'Ξ', 'np_code': 'eth'},
    {'code': 'USDT',  'name': 'USDT (TRC-20)',        'icon': '$', 'np_code': 'usdttrc20'},
    {'code': 'USDC',  'name': 'USDC (Ethereum)',      'icon': '$', 'np_code': 'usdc'},
    {'code': 'LTC',   'name': 'Litecoin',             'icon': 'Ł', 'np_code': 'ltc'},
    {'code': 'SOL',   'name': 'Solana',               'icon': '◎', 'np_code': 'sol'},
]

_NP_CODE_BY_SYMBOL: dict[str, str] = {c['code'].upper(): c['np_code'] for c in CRYPTO_CURRENCIES}


def resolve_nowpayments_currency(symbol: str) -> str:
    """Map UI symbol (USDT) to NOWPayments pay_currency (usdttrc20)."""
    key = (symbol or 'USDT').strip().upper()
    return _NP_CODE_BY_SYMBOL.get(key, key.lower())


async def create_crypto_payment(
    order_id:  str,
    amount_usd: Decimal,
    currency:  str = 'USDT',
    email:     str = '',
) -> dict:
    """
    Create a NOWPayments invoice.
    Returns: {payment_id, pay_address, pay_amount, pay_currency, status, invoice_url}
    """
    headers = {
        'x-api-key':    settings.nowpayments_api_key,
        'Content-Type': 'application/json',
    }
    pay_currency = resolve_nowpayments_currency(currency)
    payload = {
        'price_amount':    float(amount_usd),
        'price_currency':  'USD',
        'pay_currency':    pay_currency,
        'order_id':        order_id,
        'order_description': f'VoiceBridge — Order {order_id}',
        'ipn_callback_url': f'{settings.server_public_url}/api/payments/crypto/webhook',
        'success_url':      f'{settings.website_url}/en/dashboard?order={order_id}',
        'cancel_url':       f'{settings.website_url}/en/pricing',
        'customer_email':   email,
        'is_fee_paid_by_user': False,
    }
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(f'{NOWPAYMENTS_BASE}/payment', json=payload, headers=headers)
        resp.raise_for_status()
        return resp.json()


def verify_nowpayments_signature(body: bytes, received_sig: str) -> bool:
    """Verify NOWPayments IPN callback signature."""
    expected = hmac.new(
        settings.nowpayments_ipn_secret.encode(),
        body, hashlib.sha512
    ).hexdigest()
    return hmac.compare_digest(expected, received_sig)


# ── IBAN bank transfer ────────────────────────────────────────────────────────

def generate_transfer_reference(order_id: str) -> str:
    """Generate a unique human-readable payment reference like VB-A1B2C3."""
    # Use the full order_id hash for better uniqueness
    h = hashlib.sha1(order_id.encode()).hexdigest().upper()[:6]
    return f'VB-{h}'


def get_iban_details() -> dict:
    """Bank account details for IBAN transfers."""
    return {
        'account_holder': settings.iban_account_holder,
        'iban':           settings.iban_number,
        'bic_swift':      settings.iban_bic,
        'bank_name':      settings.iban_bank_name,
        'currency':       'USD',
        'instructions':   'Include your order reference in the payment description.',
    }
