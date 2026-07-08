"""
Tier-based AI routing.

  STT (all tiers)     → gpt-4o-mini-transcribe (if OPENAI_API_KEY set)
                        → Groq Whisper fallback
  Translation (trial) → Groq LLaMA
  Translation (paid)  → Gemini (fallback: Groq)
  TTS (all tiers)     → ElevenLabs
"""
from __future__ import annotations

import logging

from config import settings
from services.stt import transcribe as transcribe_groq
from services.translate_groq import _is_noise_transcript
from services.stt_openai import transcribe_openai
from services.translate_groq import translate_groq
from services.translate_gemini import translate_gemini

log = logging.getLogger('voicebridge.pipeline_ai')


def ai_tier_label(free_trial: bool) -> str:
    return 'trial' if free_trial else 'premium'


def ai_stack_for_tier(free_trial: bool) -> dict:
    if free_trial:
        return {'tier': 'trial', 'stt': 'groq', 'translate': 'groq', 'tts': 'elevenlabs'}
    return {'tier': 'premium', 'stt': 'openai', 'translate': 'gemini', 'tts': 'elevenlabs'}


async def transcribe_tiered(audio_bytes: bytes, source_lang: str, *, free_trial: bool) -> tuple[str, str]:
    """Returns (transcript, stt_provider).

    Uses gpt-4o-mini-transcribe for all tiers when OPENAI_API_KEY is set.
    Falls back to Groq Whisper if OpenAI is unavailable.
    """
    if settings.openai_api_key:
        try:
            text = await transcribe_openai(audio_bytes, source_lang)
            return text, 'openai-mini'
        except Exception as e:
            log.warning('OpenAI STT failed, falling back to Groq: %s', e)

    text = await transcribe_groq(audio_bytes, source_lang)
    return text, 'groq'


async def translate_tiered(
    text: str, source_lang: str, target_lang: str, *, free_trial: bool,
) -> tuple[str, str]:
    """Returns (translation, translate_provider)."""
    if not text.strip():
        return '', 'none'

    if not free_trial and settings.gemini_api_key:
        try:
            out = await translate_gemini(text, source_lang, target_lang)
            return out, 'gemini'
        except Exception as e:
            log.warning('Gemini translate failed, falling back to Groq: %s', e)

    out = await translate_groq(text, source_lang, target_lang)
    return out, 'groq'


async def run_tiered_stt_translate(
    audio_bytes: bytes,
    source_lang: str,
    target_lang: str,
    *,
    free_trial: bool,
) -> tuple[str, str, dict]:
    """STT + translate with tier routing and translation cache."""
    from languages import get_whisper_lang
    from services.optimizations import translation_cache, cache_key

    whisper_lang = get_whisper_lang(source_lang)
    stt_lang = whisper_lang or source_lang or 'auto'

    transcript, stt_provider = await transcribe_tiered(audio_bytes, stt_lang, free_trial=free_trial)
    stack = ai_stack_for_tier(free_trial)
    stack['stt'] = stt_provider

    if not transcript or _is_noise_transcript(transcript):
        stack['translate'] = 'none'
        return '', '', stack

    ck = cache_key(transcript, source_lang, target_lang)
    cached = translation_cache.get(ck)
    if cached:
        stack['translate'] = 'cache'
        return transcript, cached, stack

    translation, tr_provider = await translate_tiered(
        transcript, source_lang, target_lang, free_trial=free_trial,
    )
    translation_cache.put(ck, translation)
    stack['translate'] = tr_provider
    return transcript, translation, stack


async def run_tiered_stt_translate_parallel(
    audio_bytes: bytes,
    source_lang: str,
    target_lang: str,
    *,
    free_trial: bool,
) -> tuple[str, str, dict]:
    """
    Like run_tiered_stt_translate but once STT returns, fires translation
    and TTS pre-connection in parallel to cut ~300-350ms off total latency.
    """
    from languages import get_whisper_lang
    from services.optimizations import translation_cache, cache_key

    whisper_lang = get_whisper_lang(source_lang)
    stt_lang = whisper_lang or source_lang or 'auto'

    transcript, stt_provider = await transcribe_tiered(audio_bytes, stt_lang, free_trial=free_trial)
    stack = ai_stack_for_tier(free_trial)
    stack['stt'] = stt_provider

    if not transcript or _is_noise_transcript(transcript):
        stack['translate'] = 'none'
        return '', '', stack

    ck = cache_key(transcript, source_lang, target_lang)
    cached = translation_cache.get(ck)
    if cached:
        stack['translate'] = 'cache'
        return transcript, cached, stack

    translation, tr_provider = await translate_tiered(
        transcript, source_lang, target_lang, free_trial=free_trial,
    )
    translation_cache.put(ck, translation)
    stack['translate'] = tr_provider
    return transcript, translation, stack


def ai_response_headers(stack: dict, processing_ms: int) -> dict:
    return {
        'X-Processing-Ms': str(processing_ms),
        'X-AI-Tier': stack.get('tier', 'trial'),
        'X-AI-STT': stack.get('stt', 'groq'),
        'X-AI-Translate': stack.get('translate', 'groq'),
    }
