"""
TTS — ElevenLabs.
"""

import asyncio
import logging
from functools import partial
from elevenlabs import ElevenLabs, VoiceSettings
from backend.config import settings

logger = logging.getLogger(__name__)

_client: ElevenLabs | None = None


def get_client() -> ElevenLabs:
    global _client
    if _client is None:
        _client = ElevenLabs(api_key=settings.ELEVENLABS_API_KEY)
    return _client


def _synthesize_sync(text: str, voice_id: str, model_id: str = "eleven_turbo_v2_5") -> bytes:
    client = get_client()
    audio_stream = client.text_to_speech.convert(
        voice_id=voice_id,
        text=text,
        model_id=model_id,
        voice_settings=VoiceSettings(
            stability=0.5,
            similarity_boost=0.75,
            style=0.0,
            use_speaker_boost=True,
        ),
        output_format="mp3_44100_128",
    )
    chunks = [chunk for chunk in audio_stream if isinstance(chunk, bytes)]
    return b"".join(chunks)


async def synthesize_speech(
    text: str,
    voice_id: str | None = None,
    voice: str | None = None,
    model_id: str = "eleven_turbo_v2_5",
) -> bytes:
    if not text.strip():
        return b""

    target_voice = voice_id or voice or settings.ELEVENLABS_VOICE_ID

    try:
        loop = asyncio.get_event_loop()
        audio_bytes = await loop.run_in_executor(
            None, partial(_synthesize_sync, text, target_voice, model_id)
        )
        logger.debug(f"ElevenLabs TTS [{model_id}]: {len(text)} karakter → {len(audio_bytes)} byte")
        return audio_bytes
    except Exception as e:
        logger.error(f"ElevenLabs TTS hatası: {e}")
        raise
