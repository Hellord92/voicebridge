"""
Whisper STT — Groq API (ücretsiz, hızlı, VPN gerektirmez).
"""

import io
import logging
import openai
from backend.config import settings
from backend.utils.audio import detect_format, float32_pcm_to_wav

logger = logging.getLogger(__name__)

_client: openai.AsyncOpenAI | None = None


def get_client() -> openai.AsyncOpenAI:
    global _client
    if _client is None:
        _client = openai.AsyncOpenAI(
            api_key=settings.GROQ_API_KEY,
            base_url="https://api.groq.com/openai/v1",
        )
    return _client


async def transcribe_audio(audio_bytes: bytes, language: str = "en") -> str:
    fmt = detect_format(audio_bytes)
    if fmt == "pcm_f32":
        audio_bytes = float32_pcm_to_wav(audio_bytes)

    filename = "audio.wav"
    audio_file = io.BytesIO(audio_bytes)
    audio_file.name = filename

    try:
        client = get_client()
        response = await client.audio.transcriptions.create(
            model="whisper-large-v3-turbo",
            file=(filename, audio_file, "audio/wav"),
            language=language,
            response_format="text",
            temperature=0.0,
        )
        transcript = response.strip() if isinstance(response, str) else str(response).strip()
        logger.info(f"Groq Whisper [{language}]: {transcript!r}")
        return transcript
    except Exception as e:
        logger.error(f"Groq STT hatası: {e}")
        raise
