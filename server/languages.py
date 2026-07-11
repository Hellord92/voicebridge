from __future__ import annotations
"""
50-language support for VoiceBridge pipeline.

Languages map: code → {name, elevenlabs_model, whisper_code, tts_voice_id}
ElevenLabs Flash v2.5 supports all listed languages out of the box.
"""

LANGUAGES: dict[str, dict] = {
    # ── European ───────────────────────────────────────────────────────────
    "en":    {"name": "English",             "whisper": "en",    "el_code": "en"},
    "tr":    {"name": "Turkish",             "whisper": "tr",    "el_code": "tr"},
    "fr":    {"name": "French",              "whisper": "fr",    "el_code": "fr"},
    "de":    {"name": "German",              "whisper": "de",    "el_code": "de"},
    "es":    {"name": "Spanish",             "whisper": "es",    "el_code": "es"},
    "it":    {"name": "Italian",             "whisper": "it",    "el_code": "it"},
    "pt":    {"name": "Portuguese",          "whisper": "pt",    "el_code": "pt"},
    "nl":    {"name": "Dutch",               "whisper": "nl",    "el_code": "nl"},
    "pl":    {"name": "Polish",              "whisper": "pl",    "el_code": "pl"},
    "ru":    {"name": "Russian",             "whisper": "ru",    "el_code": "ru"},
    "uk":    {"name": "Ukrainian",           "whisper": "uk",    "el_code": "uk"},
    "cs":    {"name": "Czech",               "whisper": "cs",    "el_code": "cs"},
    "sk":    {"name": "Slovak",              "whisper": "sk",    "el_code": "sk"},
    "hu":    {"name": "Hungarian",           "whisper": "hu",    "el_code": "hu"},
    "ro":    {"name": "Romanian",            "whisper": "ro",    "el_code": "ro"},
    "bg":    {"name": "Bulgarian",           "whisper": "bg",    "el_code": "bg"},
    "hr":    {"name": "Croatian",            "whisper": "hr",    "el_code": "hr"},
    "sr":    {"name": "Serbian",             "whisper": "sr",    "el_code": "sr"},
    "el":    {"name": "Greek",               "whisper": "el",    "el_code": "el"},
    "sv":    {"name": "Swedish",             "whisper": "sv",    "el_code": "sv"},
    "no":    {"name": "Norwegian",           "whisper": "no",    "el_code": "no"},
    "da":    {"name": "Danish",              "whisper": "da",    "el_code": "da"},
    "fi":    {"name": "Finnish",             "whisper": "fi",    "el_code": "fi"},

    # ── Middle East ────────────────────────────────────────────────────────
    "ar":    {"name": "Arabic",              "whisper": "ar",    "el_code": "ar"},
    "he":    {"name": "Hebrew",              "whisper": "he",    "el_code": "he"},
    "fa":    {"name": "Persian",             "whisper": "fa",    "el_code": "fa"},

    # ── South Asia ─────────────────────────────────────────────────────────
    "hi":    {"name": "Hindi",               "whisper": "hi",    "el_code": "hi"},
    "bn":    {"name": "Bengali",             "whisper": "bn",    "el_code": "bn"},
    "ur":    {"name": "Urdu",                "whisper": "ur",    "el_code": "ur"},
    "ta":    {"name": "Tamil",               "whisper": "ta",    "el_code": "ta"},
    "te":    {"name": "Telugu",              "whisper": "te",    "el_code": "te"},
    "ml":    {"name": "Malayalam",           "whisper": "ml",    "el_code": "ml"},
    "gu":    {"name": "Gujarati",            "whisper": "gu",    "el_code": "gu"},
    "mr":    {"name": "Marathi",             "whisper": "mr",    "el_code": "mr"},
    "pa":    {"name": "Punjabi",             "whisper": "pa",    "el_code": "pa"},

    # ── East Asia ──────────────────────────────────────────────────────────
    "zh":    {"name": "Chinese (Simplified)","whisper": "zh",    "el_code": "zh"},
    "zh-TW": {"name": "Chinese (Traditional)","whisper": "zh",   "el_code": "zh"},
    "ja":    {"name": "Japanese",            "whisper": "ja",    "el_code": "ja"},
    "ko":    {"name": "Korean",              "whisper": "ko",    "el_code": "ko"},

    # ── Southeast Asia ─────────────────────────────────────────────────────
    "th":    {"name": "Thai",                "whisper": "th",    "el_code": "th"},
    "vi":    {"name": "Vietnamese",          "whisper": "vi",    "el_code": "vi"},
    "id":    {"name": "Indonesian",          "whisper": "id",    "el_code": "id"},
    "ms":    {"name": "Malay",               "whisper": "ms",    "el_code": "ms"},
    "tl":    {"name": "Filipino",            "whisper": "tl",    "el_code": "tl"},

    # ── Africa ─────────────────────────────────────────────────────────────
    "sw":    {"name": "Swahili",             "whisper": "sw",    "el_code": "sw"},
    "af":    {"name": "Afrikaans",           "whisper": "af",    "el_code": "af"},

    # ── Others ─────────────────────────────────────────────────────────────
    "sq":    {"name": "Albanian",            "whisper": "sq",    "el_code": "sq"},
    "ca":    {"name": "Catalan",             "whisper": "ca",    "el_code": "ca"},
    "lv":    {"name": "Latvian",             "whisper": "lv",    "el_code": "lv"},
    "lt":    {"name": "Lithuanian",          "whisper": "lt",    "el_code": "lt"},
}

assert len(LANGUAGES) == 50, f"Expected 50 languages, got {len(LANGUAGES)}"


def get_whisper_lang(code: str) -> str:  # Optional
    """Returns Whisper language code, or None for auto-detect."""
    if code == "auto":
        return None
    return LANGUAGES.get(code, {}).get("whisper")


def get_el_lang(code: str) -> str:
    """Returns ElevenLabs language code (falls back to 'en')."""
    return LANGUAGES.get(code, {}).get("el_code", "en")


def get_lang_name(code: str) -> str:
    """Human-readable language name for LLM prompts."""
    if code == "auto":
        return "the source language"
    return LANGUAGES.get(code, {}).get("name", code)


# Whisper prompt hints — improves casual / meeting speech recognition (max ~224 tokens)
WHISPER_PROMPTS: dict[str, str] = {
    "tr": (
        "Türkçe günlük konuşma, toplantı, samimi sohbet. "
        "Ne haber, nasılsın, iyi misin, kanka, valla, falan, filan."
    ),
    "en": "Casual English conversation, meetings, everyday speech.",
}
