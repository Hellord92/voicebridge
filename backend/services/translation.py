"""
Çeviri — Google Translate ücretsiz API (key gerekmez).
"""

import logging
import urllib.parse
import httpx

logger = logging.getLogger(__name__)


async def translate_text(text: str, source_lang: str = "en", target_lang: str = "tr") -> str:
    if not text.strip():
        return ""

    url = (
        "https://translate.googleapis.com/translate_a/single"
        f"?client=gtx&sl={source_lang}&tl={target_lang}&dt=t&q={urllib.parse.quote(text)}"
    )

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(url)
            res.raise_for_status()
            data = res.json()
            # Yanıt: [[[translated, original, ...], ...], ...]
            parts = [chunk[0] for chunk in data[0] if chunk[0]]
            result = "".join(parts).strip()
            logger.info(f"Google Translate [{source_lang}→{target_lang}]: {text!r} → {result!r}")
            return result
    except Exception as e:
        logger.error(f"Google Translate hatası: {e}")
        raise
