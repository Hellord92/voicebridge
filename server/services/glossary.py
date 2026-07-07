"""Apply user glossary overrides after machine translation."""
from __future__ import annotations

import json
import re
from typing import Any


def apply_glossary(translation: str, glossary_raw: str | None) -> str:
    if not translation or not glossary_raw:
        return translation
    try:
        items: list[dict[str, Any]] = json.loads(glossary_raw)
    except (json.JSONDecodeError, TypeError):
        return translation

    out = translation
    for item in items:
        src = str(item.get('source', '')).strip()
        tgt = str(item.get('target', '')).strip()
        if not src or not tgt:
            continue
        out = re.sub(re.escape(src), tgt, out, flags=re.IGNORECASE)
    return out
