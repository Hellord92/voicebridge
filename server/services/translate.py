"""
Translation service — Google Translate (free tier, no key needed).
Falls back to LibreTranslate if Google is unreachable.
"""
import httpx

GT_BASE = 'https://translate.googleapis.com/translate_a/single'


async def translate(text: str, source_lang: str = 'auto', target_lang: str = 'en') -> str:
    if not text.strip():
        return ''

    params = {
        'client': 'gtx',
        'sl':     source_lang,
        'tl':     target_lang,
        'dt':     't',
        'q':      text,
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(GT_BASE, params=params)
        resp.raise_for_status()
        data = resp.json()
        parts = [seg[0] for seg in data[0] if seg[0]]
        return ' '.join(parts).strip()
