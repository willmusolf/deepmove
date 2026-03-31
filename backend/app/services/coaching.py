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

import anthropic
from cachetools import LRUCache

from app.config import settings
from app.prompts.lesson import build_lesson_prompt
from app.prompts.system import SYSTEM_PROMPT

# In-memory LRU cache — will cut LLM costs 40-60%
# Cache key: {category}:{game_phase}:{elo_band}:{position_hash}
# TODO: Replace with Upstash Redis when traffic warrants it
_lesson_cache: LRUCache = LRUCache(maxsize=1000)

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


async def generate_lesson(coaching_request: dict) -> dict:
    """Generate a coaching lesson for a critical moment.

    Category labels are metadata. The prompt always teaches from verified facts.
    """
    cache_key = _build_cache_key(coaching_request)
    if cache_key in _lesson_cache:
        return {**_lesson_cache[cache_key], "cached": True}

    confidence = coaching_request.get("confidence", 0)
    lesson_text = ""

    if settings.anthropic_api_key:
        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        prompt = build_lesson_prompt(coaching_request)
        model = settings.lesson_model

        try:
            message = await asyncio.wait_for(
                client.messages.create(
                    model=model,
                    max_tokens=512,
                    system=SYSTEM_PROMPT,
                    messages=[{"role": "user", "content": prompt}],
                ),
                timeout=20,
            )
            lesson_text = message.content[0].text  # type: ignore[index]
        except Exception:
            lesson_text = _build_fallback_lesson(coaching_request)
    else:
        lesson_text = _build_fallback_lesson(coaching_request)

    result = {
        "lesson": lesson_text,
        "category": coaching_request.get("category"),
        "principle_id": coaching_request.get("category"),
        "confidence": confidence,
        "cached": False,
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
