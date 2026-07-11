"""
STT service — Groq Whisper API for fast, multilingual transcription.
"""
import io

from groq import AsyncGroq
from config import settings
from languages import get_whisper_lang, WHISPER_PROMPTS
from services.resilience import groq_breaker, with_retry


groq_client = AsyncGroq(api_key=settings.groq_api_key)


async def transcribe(audio_bytes: bytes, source_lang: str = 'auto') -> str:
    """
    Transcribe WAV audio using Groq Whisper.
    source_lang: ISO 639-1 code or 'auto' for autodetect.
    Returns transcribed text.
    """
    whisper_code = get_whisper_lang(source_lang) if source_lang != 'auto' else None
    lang = whisper_code
    prompt = WHISPER_PROMPTS.get(whisper_code or '', None)

    async def _call():
        audio = ('audio.wav', io.BytesIO(audio_bytes), 'audio/wav')
        kwargs = {
            'model': settings.groq_stt_model,
            'file': audio,
            'response_format': 'text',
            'temperature': 0.0,
        }
        if lang:
            kwargs['language'] = lang
        if prompt:
            kwargs['prompt'] = prompt
        response = await groq_client.audio.transcriptions.create(**kwargs)
        return str(response).strip()

    return await with_retry(_call, breaker=groq_breaker)
