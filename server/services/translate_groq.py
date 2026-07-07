"""Trial-tier translation via Groq LLM."""
from groq import AsyncGroq

from config import settings
from services.resilience import groq_breaker, with_retry

groq_client = AsyncGroq(api_key=settings.groq_api_key)

_SYSTEM = (
    'You are a professional simultaneous interpreter. '
    'Translate the user message accurately into the target language. '
    'Output ONLY the translation — no quotes, labels, or explanation.'
)


async def translate_groq(text: str, source_lang: str = 'auto', target_lang: str = 'en') -> str:
    if not text.strip():
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
        return (resp.choices[0].message.content or '').strip()

    return await with_retry(_call, breaker=groq_breaker)
