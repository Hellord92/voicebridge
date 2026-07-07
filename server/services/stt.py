"""
STT service — Groq Whisper API for fast, multilingual transcription.
"""
import io

from groq import AsyncGroq
from config import settings
from services.resilience import groq_breaker, with_retry


groq_client = AsyncGroq(api_key=settings.groq_api_key)


async def transcribe(audio_bytes: bytes, source_lang: str = 'auto') -> str:
    """
    Transcribe WAV audio using Groq Whisper.
    source_lang: ISO 639-1 code or 'auto' for autodetect.
    Returns transcribed text.
    """
    lang = None if source_lang == 'auto' else source_lang

    async def _call():
        audio = ('audio.wav', io.BytesIO(audio_bytes), 'audio/wav')
        response = await groq_client.audio.transcriptions.create(
            model=settings.groq_stt_model,
            file=audio,
            language=lang,
            response_format='text',
        )
        return str(response).strip()

    return await with_retry(_call, breaker=groq_breaker)
