from __future__ import annotations
"""
Firebase Admin SDK — server-side token verification.
Call verify_firebase_token(id_token) to decode a Firebase JWT.
"""
import json
import os
import logging

import firebase_admin
from firebase_admin import credentials, auth as fb_auth

log = logging.getLogger('voicebridge.auth')

_initialized = False


def _init():
    global _initialized
    if _initialized:
        return

    sa_json = os.environ.get('FIREBASE_SERVICE_ACCOUNT_JSON', '')
    if not sa_json:
        log.warning('FIREBASE_SERVICE_ACCOUNT_JSON not set — Firebase auth disabled')
        _initialized = True
        return

    try:
        sa_dict = json.loads(sa_json)
        cred = credentials.Certificate(sa_dict)
        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred)
        log.info('Firebase Admin SDK initialized')
    except Exception as e:
        log.error(f'Firebase init error: {e}')
    _initialized = True


def verify_firebase_token(id_token: str) -> dict:
    """
    Verify a Firebase ID token and return the decoded payload.
    Returns: {'uid': str, 'email': str, 'name': str|None}
    Raises: ValueError on invalid / expired token.
    """
    _init()
    if not firebase_admin._apps:
        raise ValueError('Firebase not configured on this server')

    try:
        decoded = fb_auth.verify_id_token(id_token, check_revoked=False)
        return {
            'uid':   decoded['uid'],
            'email': decoded.get('email', ''),
            'name':  decoded.get('name'),
        }
    except fb_auth.ExpiredIdTokenError:
        raise ValueError('Firebase token expired')
    except fb_auth.InvalidIdTokenError as e:
        raise ValueError(f'Invalid Firebase token: {e}')
    except Exception as e:
        raise ValueError(f'Firebase verification failed: {e}')


def is_firebase_token(token: str) -> bool:
    """Heuristic: Firebase ID tokens are JWTs starting with 'eyJ'."""
    return token.startswith('eyJ') and token.count('.') == 2
