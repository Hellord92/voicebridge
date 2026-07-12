"""
ElevenLabs voice catalog — male/female multilingual voices.
Uses eleven_flash_v2_5 model (language_code passed separately).
"""
from config import settings

VOICES = {
    'female': {
        'id':   'XB0fDUnXU5powFXDhCwa',  # Charlotte — warm, natural, conversational
        'name': 'Female',
    },
    'male': {
        'id':   'nPczCjzI2devNBz1zQrb',  # Brian — deep, clear, natural
        'name': 'Male',
    },
}


def get_voice_id(gender: str = 'female') -> str:
    """Return ElevenLabs voice_id for gender, falling back to env default."""
    g = (gender or 'female').lower().strip()
    if g in VOICES:
        return VOICES[g]['id']
    return settings.elevenlabs_voice_id or VOICES['female']['id']


def list_voices() -> list[dict]:
    return [{'gender': k, **v} for k, v in VOICES.items()]
