"""
STT service — Groq Whisper API for fast, multilingual transcription.
"""
import io
import httpx
import wave
import struct

from groq import AsyncGroq
from config import settings


groq_client = AsyncGroq(api_key=settings.groq_api_key)


async def transcribe(audio_bytes: bytes, source_lang: str = 'auto') -> str:
    """
    Transcribe WAV audio using Groq Whisper.
    source_lang: ISO 639-1 code or 'auto' for autodetect.
    Returns transcribed text.
    """
    lang = None if source_lang == 'auto' else source_lang

    # Groq expects a file-like with a name
    audio_file = ('audio.wav', io.BytesIO(audio_bytes), 'audio/wav')

    response = await groq_client.audio.transcriptions.create(
        model='whisper-large-v3-turbo',
        file=audio_file,
        language=lang,
        response_format='text',
    )

    return str(response).strip()
