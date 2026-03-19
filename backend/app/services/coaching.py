"""coaching.py — LLM coaching pipeline
This service is the ONLY place that calls the Anthropic API.
It receives pre-verified facts and generates the lesson text.

CRITICAL RULES (from CLAUDE.md):
1. LLM NEVER analyzes chess positions directly — only receives verified facts
2. LLM NEVER tells student to play engine's exact move — teaches the CONCEPT
3. Every factual claim must trace back to Stockfish eval or feature extraction
4. Coach sees the mistake BEHIND the mistake
5. If classifier confidence < 70%, use simplified observation-based lesson
"""
import anthropic
from cachetools import LRUCache

from app.config import settings
from app.prompts.lesson import build_lesson_prompt
from app.prompts.system import SYSTEM_PROMPT

# In-memory LRU cache — will cut LLM costs 40-60%
# Cache key: {principle_id}:{game_phase}:{elo_band}:{position_hash}
# TODO: Replace with Upstash Redis when traffic warrants it
_lesson_cache: LRUCache = LRUCache(maxsize=1000)


async def generate_lesson(coaching_request: dict) -> dict:
    """Generate a coaching lesson for a critical moment.

    If confidence < 70%, generates a simplified observation (no principle assertion).
    If confidence >= 70%, generates full 5-step principle lesson.
    """
    cache_key = _build_cache_key(coaching_request)
    if cache_key in _lesson_cache:
        return {**_lesson_cache[cache_key], "cached": True}

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    prompt = build_lesson_prompt(coaching_request)
    confidence = coaching_request.get("confidence", 0)
    model = settings.lesson_model

    message = await client.messages.create(
        model=model,
        max_tokens=512,  # 6-8 sentences max — coach is concise
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )

    lesson_text = message.content[0].text  # type: ignore[index]
    result = {
        "lesson": lesson_text,
        "principle_id": coaching_request.get("principle_id"),
        "confidence": confidence,
        "cached": False,
    }

    _lesson_cache[cache_key] = result
    return result


def _build_cache_key(req: dict) -> str:
    return f"{req.get('principle_id')}:{req.get('game_phase')}:{req.get('elo_band')}:{req.get('position_hash', '')}"


def clear_lesson_cache() -> int:
    """Clear the in-memory LRU lesson cache. Returns number of entries cleared."""
    count = len(_lesson_cache)
    _lesson_cache.clear()
    return count
