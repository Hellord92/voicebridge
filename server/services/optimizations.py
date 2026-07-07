"""
Performance optimizations for the VoiceBridge pipeline.

Strategy:
  1. Translation cache (LRU, reduces repeated phrase costs)
  2. TTS streaming (chunked response from ElevenLabs to reduce TTFB)
  3. Parallel translate+TTS: as soon as STT returns, fire TR and TTS warmup together
  4. Persistent httpx client for connection reuse (no TCP handshake per request)
"""
import asyncio
import hashlib
from collections import OrderedDict
from typing import Optional, AsyncGenerator

import httpx
from config import settings
from languages import get_el_lang
from services.resilience import eleven_breaker, with_retry

# Persistent clients — connection pool reuse eliminates per-request TCP handshake (~30-50ms)
_groq_http_client: Optional[httpx.AsyncClient] = None
_eleven_http_client: Optional[httpx.AsyncClient] = None


def get_eleven_client() -> httpx.AsyncClient:
    global _eleven_http_client
    if _eleven_http_client is None or _eleven_http_client.is_closed:
        _eleven_http_client = httpx.AsyncClient(
            timeout=30.0,
            limits=httpx.Limits(max_keepalive_connections=5, keepalive_expiry=30),
        )
    return _eleven_http_client


# ── LRU translation cache ─────────────────────────────────────────────────────

class LRUCache:
    def __init__(self, maxsize: int = 512):
        self._store: OrderedDict[str, str] = OrderedDict()
        self._maxsize = maxsize

    def get(self, key: str) -> Optional[str]:
        if key in self._store:
            self._store.move_to_end(key)
            return self._store[key]
        return None

    def put(self, key: str, value: str) -> None:
        if key in self._store:
            self._store.move_to_end(key)
        else:
            if len(self._store) >= self._maxsize:
                self._store.popitem(last=False)
        self._store[key] = value


translation_cache = LRUCache(maxsize=512)
tts_cache         = LRUCache(maxsize=64)   # cache short TTS clips (greetings etc.)


def cache_key(text: str, src: str, tgt: str) -> str:
    return hashlib.sha1(f"{src}:{tgt}:{text.strip().lower()}".encode()).hexdigest()


def tts_cache_key(text: str, lang: str) -> str:
    return hashlib.sha1(f"{lang}:{text.strip().lower()}".encode()).hexdigest()


# ── Streaming TTS (ElevenLabs streaming endpoint) ────────────────────────────

ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1'


async def synthesize_streaming(
    text: str,
    target_lang: str = 'en',
    voice_id: Optional[str] = None,
) -> bytes:
    """
    Use ElevenLabs streaming endpoint for lower TTFB.
    Returns complete MP3 bytes (assembled from stream).
    """
    # Check TTS cache first
    ck = tts_cache_key(text, target_lang)
    cached = tts_cache.get(ck)
    if cached:
        return cached.encode('latin-1')

    vid  = voice_id or settings.elevenlabs_voice_id
    lang = get_el_lang(target_lang)
    url  = f'{ELEVENLABS_BASE}/text-to-speech/{vid}/stream'

    payload = {
        'text':       text,
        'model_id':   'eleven_flash_v2_5',
        'language_code': lang,
        'voice_settings': {
            'stability':         0.4,
            'similarity_boost':  0.7,
            'style':             0.0,
            'use_speaker_boost': True,
        },
        'output_format': 'mp3_44100_64',
        'optimize_streaming_latency': 4,  # max latency reduction
    }

    headers = {'xi-api-key': settings.elevenlabs_api_key, 'Content-Type': 'application/json'}
    chunks: list[bytes] = []

    async def _stream():
        client = get_eleven_client()
        async with client.stream('POST', url, json=payload, headers=headers) as resp:
            resp.raise_for_status()
            async for chunk in resp.aiter_bytes(chunk_size=4096):
                chunks.append(chunk)

    await with_retry(_stream, breaker=eleven_breaker)

    mp3 = b''.join(chunks)
    # Cache short clips (< 8 KB)
    if len(mp3) < 8192:
        tts_cache.put(ck, mp3.decode('latin-1'))
    return mp3


async def synthesize_streaming_chunks(
    text: str,
    target_lang: str = 'en',
    voice_id: Optional[str] = None,
) -> AsyncGenerator[bytes, None]:
    """
    Yields MP3 chunks as they arrive from ElevenLabs.
    Use when you want to start writing to SHM before TTS is fully done.
    """
    vid  = voice_id or settings.elevenlabs_voice_id
    lang = get_el_lang(target_lang)
    url  = f'{ELEVENLABS_BASE}/text-to-speech/{vid}/stream'

    payload = {
        'text':       text,
        'model_id':   'eleven_flash_v2_5',
        'language_code': lang,
        'voice_settings': {
            'stability':         0.35,
            'similarity_boost':  0.7,
            'style':             0.0,
            'use_speaker_boost': True,
        },
        'output_format': 'mp3_44100_64',
        'optimize_streaming_latency': 4,  # max latency reduction
    }

    headers = {'xi-api-key': settings.elevenlabs_api_key, 'Content-Type': 'application/json'}
    client = get_eleven_client()
    async with client.stream('POST', url, json=payload, headers=headers) as resp:
        resp.raise_for_status()
        async for chunk in resp.aiter_bytes(chunk_size=2048):
            yield chunk


# ── Parallel pipeline: STT + translate concurrently where source_lang known ──

async def run_parallel_pipeline(
    transcribe_coro,
    text_known: Optional[str],
    source_lang: str,
    target_lang: str,
    translate_fn,
) -> tuple[str, str]:
    """
    If source_lang is known and text_known is provided, run translation
    immediately without waiting for STT. Otherwise run serially.

    Returns (transcript, translation).
    """
    if text_known:
        ck = cache_key(text_known, source_lang, target_lang)
        cached_trans = translation_cache.get(ck)
        if cached_trans:
            return text_known, cached_trans

        transcript, translation = await asyncio.gather(
            asyncio.coroutine(lambda: text_known)(),
            translate_fn(text_known, source_lang, target_lang),
        )
    else:
        transcript = await transcribe_coro
        ck = cache_key(transcript, source_lang, target_lang)
        cached_trans = translation_cache.get(ck)
        if cached_trans:
            return transcript, cached_trans
        translation = await translate_fn(transcript, source_lang, target_lang)

    translation_cache.put(ck, translation)
    return transcript, translation
