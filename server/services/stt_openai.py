"""Paid-tier STT via OpenAI Whisper."""
import io

import httpx

from config import settings
from services.resilience import openai_breaker, with_retry

OPENAI_TRANSCRIPTIONS = 'https://api.openai.com/v1/audio/transcriptions'


async def transcribe_openai(audio_bytes: bytes, source_lang: str = 'auto') -> str:
    if not settings.openai_api_key:
        raise RuntimeError('OPENAI_API_KEY not configured')

    async def _call():
        data = {'model': settings.openai_whisper_model, 'response_format': 'text'}
        if source_lang and source_lang != 'auto':
            data['language'] = source_lang
        files = {'file': ('audio.wav', io.BytesIO(audio_bytes), 'audio/wav')}
        headers = {'Authorization': f'Bearer {settings.openai_api_key}'}
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(OPENAI_TRANSCRIPTIONS, headers=headers, data=data, files=files)
            resp.raise_for_status()
            return resp.text.strip()

    return await with_retry(_call, breaker=openai_breaker)
