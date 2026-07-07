"""Paid-tier translation via Google Gemini."""
import httpx

from config import settings
from services.resilience import gemini_breaker, with_retry

_GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent'


async def translate_gemini(text: str, source_lang: str = 'auto', target_lang: str = 'en') -> str:
    if not text.strip():
        return ''
    if not settings.gemini_api_key:
        raise RuntimeError('GEMINI_API_KEY not configured')

    src = 'auto-detected' if source_lang == 'auto' else source_lang
    prompt = (
        f'Translate the following from {src} to {target_lang}. '
        f'Output ONLY the translation, nothing else.\n\n{text}'
    )

    async def _call():
        url = _GEMINI_URL.format(model=settings.gemini_translate_model)
        payload = {
            'contents': [{'parts': [{'text': prompt}]}],
            'generationConfig': {'temperature': 0.2, 'maxOutputTokens': 1024},
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                url,
                params={'key': settings.gemini_api_key},
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
            parts = data.get('candidates', [{}])[0].get('content', {}).get('parts', [])
            return ''.join(p.get('text', '') for p in parts).strip()

    return await with_retry(_call, breaker=gemini_breaker)
