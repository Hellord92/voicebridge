from __future__ import annotations
"""
VoiceBridge Pricing — Minute-Based Packages
All tiers give access to all 50 languages.
Free = 5 minutes per session (resets on restart, no account needed).
"""

from decimal import Decimal

PLANS: list[dict] = [
    {
        "id":           "free",
        "name":         "Free",
        "minutes":      5,            # per session, resets
        "price_usd":    Decimal("0"),
        "discount_pct": 0,
        "description":  "Try VoiceBridge with all 50 languages.",
        "per_min_usd":  Decimal("0"),
        "highlight":    False,
    },
    {
        "id":           "min_60",
        "name":         "Starter",
        "minutes":      60,
        "price_usd":    Decimal("99"),
        "discount_pct": 0,
        "description":  "Perfect for occasional meetings.",
        "per_min_usd":  Decimal("1.65"),
        "highlight":    False,
    },
    {
        "id":           "min_120",
        "name":         "Basic",
        "minutes":      120,
        "price_usd":    Decimal("179"),
        "discount_pct": 9,            # vs 2 × Starter = $198
        "description":  "Save $19 vs two Starter packs.",
        "per_min_usd":  Decimal("1.49"),
        "highlight":    False,
    },
    {
        "id":           "min_240",
        "name":         "Standard",
        "minutes":      240,
        "price_usd":    Decimal("329"),
        "discount_pct": 17,           # vs 4 × Starter = $396
        "description":  "Best for weekly team meetings.",
        "per_min_usd":  Decimal("1.37"),
        "highlight":    True,         # ← most popular
    },
    {
        "id":           "min_360",
        "name":         "Professional",
        "minutes":      360,
        "price_usd":    Decimal("459"),
        "discount_pct": 23,           # vs 6 × $99 = $594
        "description":  "Power users and daily calls.",
        "per_min_usd":  Decimal("1.28"),
        "highlight":    False,
    },
    {
        "id":           "min_480",
        "name":         "Business",
        "minutes":      480,
        "price_usd":    Decimal("579"),
        "discount_pct": 27,           # vs 8 × $99 = $792
        "description":  "Large teams, multiple time zones.",
        "per_min_usd":  Decimal("1.21"),
        "highlight":    False,
    },
    {
        "id":           "min_600",
        "name":         "Enterprise",
        "minutes":      600,
        "price_usd":    Decimal("679"),
        "discount_pct": 31,           # vs 10 × $99 = $990
        "description":  "Maximum value — 10 hours of translation.",
        "per_min_usd":  Decimal("1.13"),
        "highlight":    False,
    },
]

PLAN_BY_ID: dict[str, dict] = {p["id"]: p for p in PLANS}
FREE_TRIAL_SECONDS = 30 * 60  # 1800 seconds — 30 minutes per day


def get_plan(plan_id: str) -> dict:  # Optional
    return PLAN_BY_ID.get(plan_id)
