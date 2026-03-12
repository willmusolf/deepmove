"""cache.py — LRU cache for LLM responses (MVP: in-memory, upgrade to Upstash Redis later)
Cache key structure: {principle_id}:{game_phase}:{elo_band}:{position_similarity_hash}
A lesson cached for a 1200 player must NEVER be served to an 1800 player.
"""
from cachetools import LRUCache

# 1000 cached lessons in memory — covers the most common principle/phase/elo combos
_cache: LRUCache = LRUCache(maxsize=1000)


def get(key: str) -> dict | None:
    return _cache.get(key)


def set(key: str, value: dict) -> None:
    _cache[key] = value


def build_key(principle_id: str, game_phase: str, elo_band: str, position_hash: str) -> str:
    return f"{principle_id}:{game_phase}:{elo_band}:{position_hash}"
