"""Trial-tier translation via Groq LLM."""
from groq import AsyncGroq

from config import settings
from languages import get_lang_name
from services.resilience import groq_breaker, with_retry

groq_client = AsyncGroq(api_key=settings.groq_api_key)

_SYSTEM = (
    'You are a professional simultaneous interpreter in a live video meeting. '
    'Translate spoken input into natural, conversational {target} — as a native speaker would say it in a call.\n'
    'STRICT rules:\n'
    '- Output ONLY the translation. No quotes, labels, or explanations.\n'
    '- Preserve casual tone: greetings, slang, filler words (valla, kanka) → natural equivalents.\n'
    '- Short phrases stay short. Questions stay questions.\n'
    '- If input is noise/filler only (hmm, ..., eee), output exactly: [skip]\n'
    '- Never ask for clarification. Never add words not implied by the source.\n'
    'Examples (Turkish → English):\n'
    '- "Ne haber?" → "What\'s up?"\n'
    '- "Nasılsın iyi misin?" → "How are you? You good?"\n'
    '- "İyi valla nasıl olsun kanka" → "I\'m good man, how else would it be?"\n'
    '- "Karımı çok seviyorum falan" → "I love my wife and all that."'
)

_SKIP_PATTERNS = {
    '...', '…', '.', '..', '....', 'eee', 'hmm', 'hm', 'uh', 'um',
    '[music]', '[applause]', '[laughter]', 'music',
}


def _is_noise_transcript(text: str) -> bool:
    t = text.strip().lower()
    if not t:
        return True
    if t in _SKIP_PATTERNS:
        return True
    if all(c in '.…!?,;: ' for c in t):
        return True
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

    src_name = get_lang_name(source_lang)
    tgt_name = get_lang_name(target_lang)
    system = _SYSTEM.format(target=tgt_name)
    user_msg = f'Translate this {src_name} utterance into {tgt_name}:\n\n{text}'

    async def _call():
        resp = await groq_client.chat.completions.create(
            model=settings.groq_translate_model,
            messages=[
                {'role': 'system', 'content': system},
                {'role': 'user', 'content': user_msg},
            ],
            temperature=0.1,
            max_tokens=512,
        )
        result = (resp.choices[0].message.content or '').strip()
        return '' if result == '[skip]' else result

    return await with_retry(_call, breaker=groq_breaker)
