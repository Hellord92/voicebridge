"""
AI routing — OpenAI Realtime is the primary client path.
Legacy /api/pipeline endpoints use OpenAI STT + Gemini/Google translate (no Groq).
"""
from __future__ import annotations

import logging

from config import settings
from services.noise_filter import is_noise_transcript
from services.stt_openai import transcribe_openai
from services.translate_gemini import translate_gemini
from services.translate import translate as translate_google

log = logging.getLogger('voicebridge.pipeline_ai')


def ai_tier_label(free_trial: bool) -> str:
    return 'trial' if free_trial else 'premium'


def ai_stack_for_tier(free_trial: bool) -> dict:
    return {
        'tier': 'trial' if free_trial else 'premium',
        'stt': 'openai-realtime',
        'translate': 'openai-realtime',
        'tts': 'elevenlabs',
    }


async def transcribe_tiered(audio_bytes: bytes, source_lang: str, *, free_trial: bool) -> tuple[str, str]:
    if not settings.openai_api_key:
        raise RuntimeError('OPENAI_API_KEY not configured')
    text = await transcribe_openai(audio_bytes, source_lang)
    return text, 'openai-mini'


async def translate_tiered(
    text: str, source_lang: str, target_lang: str, *, free_trial: bool,
) -> tuple[str, str]:
    if not text.strip():
        return '', 'none'

    if settings.gemini_api_key:
        try:
            out = await translate_gemini(text, source_lang, target_lang)
            return out, 'gemini'
        except Exception as e:
            log.warning('Gemini translate failed, falling back to Google: %s', e)

    out = await translate_google(text, source_lang, target_lang)
    return out, 'google'


async def run_tiered_stt_translate(
    audio_bytes: bytes,
    source_lang: str,
    target_lang: str,
    *,
    free_trial: bool,
) -> tuple[str, str, dict]:
    from languages import get_whisper_lang
    from services.optimizations import translation_cache, cache_key

    whisper_lang = get_whisper_lang(source_lang)
    stt_lang = whisper_lang or source_lang or 'auto'

    transcript, stt_provider = await transcribe_tiered(audio_bytes, stt_lang, free_trial=free_trial)
    stack = ai_stack_for_tier(free_trial)
    stack['stt'] = stt_provider

    if not transcript or is_noise_transcript(transcript):
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
    return await run_tiered_stt_translate(
        audio_bytes, source_lang, target_lang, free_trial=free_trial,
    )


def ai_response_headers(stack: dict, processing_ms: int) -> dict:
    return {
        'X-Processing-Ms': str(processing_ms),
        'X-AI-Tier': stack.get('tier', 'realtime'),
        'X-AI-STT': stack.get('stt', 'openai-realtime'),
        'X-AI-Translate': stack.get('translate', 'openai-realtime'),
    }
