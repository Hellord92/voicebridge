"""Trial-tier translation via Groq LLM."""
from groq import AsyncGroq

from config import settings
from services.resilience import groq_breaker, with_retry

groq_client = AsyncGroq(api_key=settings.groq_api_key)

_SYSTEM = (
    'You are a professional simultaneous interpreter built into a real-time translation app. '
    'Your ONLY job: translate the exact input text into the target language. '
    'STRICT rules:\n'
    '- Output ONLY the translation. No explanations, no labels, no quotes.\n'
    '- If the input is noise, filler sounds, or punctuation only (e.g. "...", ".", "eee", "hmm"), '
    'output exactly: [skip]\n'
    '- Never ask for clarification. Never say you need more text. Just translate.\n'
    '- Preserve the natural speaking tone and do not add words that were not in the source.'
)

# Whisper hallucination patterns — skip translation entirely
_SKIP_PATTERNS = {
    '...', '…', '.', '..', '....', 'eee', 'hmm', 'hm', 'uh', 'um',
    '[music]', '[applause]', '[laughter]', 'music',
}


def _is_noise_transcript(text: str) -> bool:
    """Return True if the transcript is a Whisper hallucination or noise."""
    t = text.strip().lower()
    if not t:
        return True
    if t in _SKIP_PATTERNS:
        return True
    # Only punctuation / ellipsis
    if all(c in '.…!?,;: ' for c in t):
        return True
    # Single character noise (not real words)
    if len(t) <= 1:
        return True
    return False


async def translate_groq(text: str, source_lang: str = 'auto', target_lang: str = 'en') -> str:
    if not text.strip():
        return ''
    if _is_noise_transcript(text):
        return ''
    if not settings.groq_api_key:
        raise RuntimeError('GROQ_API_KEY not configured')

    src = 'auto-detected' if source_lang == 'auto' else source_lang
    prompt = f'Translate from {src} to {target_lang}:\n\n{text}'

    async def _call():
        resp = await groq_client.chat.completions.create(
            model=settings.groq_translate_model,
            messages=[
                {'role': 'system', 'content': _SYSTEM},
                {'role': 'user', 'content': prompt},
            ],
            temperature=0.2,
            max_tokens=1024,
        )
        result = (resp.choices[0].message.content or '').strip()
        return '' if result == '[skip]' else result

    return await with_retry(_call, breaker=groq_breaker)
