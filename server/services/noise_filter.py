"""Filter Whisper / Realtime noise hallucinations before TTS."""

_SKIP_PATTERNS = {
    '...', '…', '.', '..', '....', 'eee', 'hmm', 'hm', 'uh', 'um',
    '[music]', '[applause]', '[laughter]', 'music',
}


def is_noise_transcript(text: str) -> bool:
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
