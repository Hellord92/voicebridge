"""Send transactional emails (license keys, order confirmations)."""
from __future__ import annotations
import logging
from config import settings

log = logging.getLogger('voicebridge.email')


async def send_license_email(to: str, license_key: str, plan_name: str, minutes: int) -> bool:
    """
    Send license key to customer after payment.
    Configure RESEND_API_KEY in Railway to enable live delivery.
    """
    api_key = getattr(settings, 'resend_api_key', '') or ''
    subject = f'Your VoiceBridge {plan_name} license'
    body = (
        f'Thank you for your purchase!\n\n'
        f'Plan: {plan_name}\n'
        f'Minutes: {minutes}\n'
        f'License key: {license_key}\n\n'
        f'Paste this key in VoiceBridge → Settings, or sign in with the same Google account.\n\n'
        f'https://voicebridgeapps.com/download'
    )

    if not api_key:
        log.warning(f'RESEND_API_KEY not set — license email not sent to {to}: {license_key}')
        return False

    try:
        import httpx
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(
                'https://api.resend.com/emails',
                headers={'Authorization': f'Bearer {api_key}'},
                json={
                    'from':    getattr(settings, 'email_from', 'VoiceBridge <noreply@voicebridgeapps.com>'),
                    'to':      [to],
                    'subject': subject,
                    'text':    body,
                },
            )
            r.raise_for_status()
        log.info(f'License email sent to {to}')
        return True
    except Exception as e:
        log.error(f'Failed to send license email: {e}')
        return False
