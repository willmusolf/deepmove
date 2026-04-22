"""coaching.py — LLM coaching pipeline
This service is the ONLY place that calls the Anthropic API.
It receives pre-verified facts and generates the lesson text.

CRITICAL RULES (from CLAUDE.md):
1. LLM NEVER analyzes chess positions directly — only receives verified facts
2. LLM NEVER tells student to play engine's exact move — teaches the CONCEPT
3. Every factual claim must trace back to Stockfish eval or feature extraction
4. Coach sees the mistake BEHIND the mistake
5. Category labels are for tracking only. The lesson is driven by verified facts.
"""
import asyncio
import logging
from datetime import UTC, date, datetime, timedelta

import anthropic
from cachetools import LRUCache

from app.config import settings
from app.prompts.lesson import build_lesson_prompt
from app.prompts.system import SYSTEM_PROMPT

logger = logging.getLogger(__name__)

# In-memory LRU cache — will cut LLM costs 40-60%
# Cache key: {category}:{game_phase}:{elo_band}:{position_hash}
# TODO: Replace with Upstash Redis when traffic warrants it
_lesson_cache: LRUCache = LRUCache(maxsize=1000)
_guest_usage: dict[str, tuple[int, date]] = {}
_global_daily_calls = 0
_global_reset_date = datetime.now(UTC).date()

# Singleton Anthropic client — reuses HTTP/2 connections across requests
_anthropic_client: anthropic.AsyncAnthropic | None = None


def _get_client() -> anthropic.AsyncAnthropic:
    global _anthropic_client
    if _anthropic_client is None:
        _anthropic_client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _anthropic_client

CATEGORY_RULES = {
    "hung_piece": "Before every move, ask what you are leaving undefended.",
    "ignored_threat": "Before you play your idea, ask what your opponent is threatening right now.",
    "missed_tactic": "In sharp positions, check captures and checks before quiet moves.",
    "aimless_move": "Do not play a move until you can name its job.",
    "didnt_develop": "In the opening, bring pieces out before drifting with side moves.",
    "didnt_castle": "Get your king safe before you spend time elsewhere.",
    "unknown": "When the position turns, stop and identify the biggest problem first.",
}


def _strip_fact_prefix(fact: str) -> str:
    return fact.split(": ", 1)[1].strip() if ": " in fact else fact.strip()


def _today_utc() -> date:
    return datetime.now(UTC).date()


def seconds_until_midnight_utc() -> int:
    now = datetime.now(UTC)
    tomorrow = (now + timedelta(days=1)).date()
    midnight = datetime.combine(tomorrow, datetime.min.time(), tzinfo=UTC)
    return max(1, int((midnight - now).total_seconds()))


def _reset_global_counter_if_needed() -> None:
    global _global_daily_calls, _global_reset_date
    today = _today_utc()
    if _global_reset_date < today:
        _global_daily_calls = 0
        _global_reset_date = today


def get_guest_usage(ip_address: str) -> tuple[int, date]:
    today = _today_utc()
    count, reset_date = _guest_usage.get(ip_address, (0, today))
    if reset_date < today:
        count, reset_date = 0, today
    return count, reset_date


def increment_guest_usage(ip_address: str) -> int:
    count, reset_date = get_guest_usage(ip_address)
    count += 1
    _guest_usage[ip_address] = (count, reset_date)
    return count


def is_global_ceiling_reached() -> bool:
    _reset_global_counter_if_needed()
    return _global_daily_calls >= settings.max_daily_llm_calls


def increment_global_daily_calls() -> int:
    global _global_daily_calls
    _reset_global_counter_if_needed()
    _global_daily_calls += 1
    return _global_daily_calls


def get_spend_summary() -> dict:
    _reset_global_counter_if_needed()
    return {
        "daily_llm_calls": _global_daily_calls,
        "daily_llm_ceiling": settings.max_daily_llm_calls,
        "estimated_daily_cost_usd": round(_global_daily_calls * settings.estimated_llm_cost_usd, 2),
    }


def reset_usage_state() -> None:
    global _global_daily_calls, _global_reset_date
    _lesson_cache.clear()
    _guest_usage.clear()
    _global_daily_calls = 0
    _global_reset_date = _today_utc()


def get_cached_lesson(coaching_request: dict) -> dict | None:
    cache_key = _build_cache_key(coaching_request)
    cached = _lesson_cache.get(cache_key)
    if cached is None:
        return None
    return {**cached, "cached": True}


def _build_fallback_lesson(coaching_request: dict) -> str:
    facts = coaching_request.get("verified_facts", [])
    category = coaching_request.get("category") or coaching_request.get("principle_id") or "unknown"
    move_played = coaching_request.get("move_played", "This move")
    what_went_wrong = _strip_fact_prefix(facts[2]) if len(facts) >= 3 else f"{move_played} was the wrong kind of move for the position."
    better_idea = _strip_fact_prefix(facts[3]) if len(facts) >= 4 else coaching_request.get("engine_move_idea", "")
    consequence = _strip_fact_prefix(facts[4]) if len(facts) >= 5 else ""
    rule = CATEGORY_RULES.get(category, CATEGORY_RULES["unknown"])

    sentences = [
        what_went_wrong.rstrip(".") + ".",
    ]
    if better_idea:
        sentences.append(better_idea.rstrip(".") + ".")
    if consequence:
        sentences.append(consequence.rstrip(".") + ".")
    sentences.append(rule)
    return " ".join(sentences[:4])


def build_fallback_result(coaching_request: dict) -> dict:
    return {
        "lesson": _build_fallback_lesson(coaching_request),
        "category": coaching_request.get("category"),
        "principle_id": coaching_request.get("principle_id") or coaching_request.get("category"),
        "confidence": coaching_request.get("confidence", 0),
        "cached": False,
        "fallback_used": True,
        "model": "fallback",
    }


async def generate_lesson(coaching_request: dict) -> dict:
    """Generate a coaching lesson for a critical moment.

    Category labels are metadata. The prompt always teaches from verified facts.
    """
    cache_key = _build_cache_key(coaching_request)
    cached = get_cached_lesson(coaching_request)
    if cached is not None:
        return cached

    confidence = coaching_request.get("confidence", 0)
    lesson_text = ""
    fallback_used = False
    model_used = "fallback"

    if settings.anthropic_api_key:
        client = _get_client()
        prompt = build_lesson_prompt(coaching_request)
        model = settings.lesson_model
        model_used = model

        try:
            message = await asyncio.wait_for(
                client.messages.create(
                    model=model,
                    max_tokens=512,
                    system=SYSTEM_PROMPT,
                    messages=[{"role": "user", "content": prompt}],
                ),
                timeout=15,
            )
            lesson_text = message.content[0].text  # type: ignore[index]
        except Exception:
            logger.exception("LLM lesson generation failed")
            return build_fallback_result(coaching_request)
    else:
        return build_fallback_result(coaching_request)

    result = {
        "lesson": lesson_text,
        "category": coaching_request.get("category"),
        "principle_id": coaching_request.get("principle_id") or coaching_request.get("category"),
        "confidence": confidence,
        "cached": False,
        "fallback_used": fallback_used,
        "model": model_used,
    }

    _lesson_cache[cache_key] = result
    return result


def _build_cache_key(req: dict) -> str:
    category = req.get("category") or req.get("principle_id")
    return f"{category}:{req.get('game_phase')}:{req.get('elo_band')}:{req.get('position_hash', '')}"


def clear_lesson_cache() -> int:
    """Clear the in-memory LRU lesson cache. Returns number of entries cleared."""
    count = len(_lesson_cache)
    _lesson_cache.clear()
    return count


def lesson_cache_size() -> int:
    """Return current in-memory lesson cache size."""
    return len(_lesson_cache)
