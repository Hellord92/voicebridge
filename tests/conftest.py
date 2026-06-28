"""pytest conftest — set required env vars before any server module is imported."""
import os
import pytest

# Set all required server env vars before importing anything
_ENV_DEFAULTS = {
    'ELEVENLABS_API_KEY':   'test_elevenlabs_key',
    'GROQ_API_KEY':         'test_groq_key',
    'NOWPAYMENTS_API_KEY':  'test_nowpayments_key',
    'NOWPAYMENTS_IPN_SECRET': 'test_ipn_secret',
    'IBAN_ACCOUNT_HOLDER':  'VoiceBridge Ltd',
    'IBAN_NUMBER':          'TR00 0000 0000 0000 0000 0000 00',
    'IBAN_BIC':             'XXXXTRXX',
    'IBAN_BANK_NAME':       'Test Bank',
    'LICENSE_SECRET':       'test_license_secret_32chars_long_!',
    'DATABASE_URL':         'sqlite+aiosqlite:///:memory:',
    'CORS_ORIGINS':         'http://localhost:3000',
    'SERVER_PUBLIC_URL':    'http://localhost:8000',
    'WEBSITE_URL':          'http://localhost:3000',
}

for k, v in _ENV_DEFAULTS.items():
    os.environ.setdefault(k, v)
