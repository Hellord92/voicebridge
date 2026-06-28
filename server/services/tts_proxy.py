"""
TTS proxy — calls ElevenLabs API server-side so the API key stays secret.
Returns MP3 bytes.
"""
import httpx
from config import settings


ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1'

# ElevenLabs language → voice ID mapping for high-quality multilingual voices
# All these voices support the eleven_flash_v2_5 multilingual model
VOICE_IDS = {
    'default': settings.elevenlabs_voice_id,
    # Add premium voice IDs per language here when available
}

SUPPORTED_LANGS = {
    'en', 'tr', 'fr', 'de', 'es', 'it', 'pt', 'pl', 'nl', 'ru',
    'ar', 'cs', 'ro', 'hi', 'ja', 'ko', 'zh', 'sv', 'da', 'fi',
    'hu', 'el', 'uk', 'bg', 'hr', 'sk', 'he', 'id', 'ms', 'tl',
    'vi', 'th', 'fa', 'ur', 'bn', 'ta', 'te', 'ml', 'gu', 'mr',
    'pa', 'sw', 'af', 'sq', 'ca', 'lv', 'lt', 'no', 'sr', 'zh-TW',
}


async def synthesize(text: str, target_lang: str = 'en') -> bytes:
    """
    Call ElevenLabs Turbo (flash) model with multilingual support.
    Returns raw MP3 bytes.
    """
    lang  = target_lang if target_lang in SUPPORTED_LANGS else 'en'
    voice = VOICE_IDS.get('default')
    url   = f'{ELEVENLABS_BASE}/text-to-speech/{voice}'

    payload = {
        'text':  text,
        'model_id': 'eleven_flash_v2_5',
        'language_code': lang,
        'voice_settings': {
            'stability':        0.4,
            'similarity_boost': 0.7,
            'style':            0.0,
            'use_speaker_boost': True,
        },
        'output_format': 'mp3_44100_64',
    }

    headers = {
        'xi-api-key':    settings.elevenlabs_api_key,
        'Content-Type':  'application/json',
    }

    async with httpx.AsyncClient(timeout=45.0) as client:
        resp = await client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        return resp.content
