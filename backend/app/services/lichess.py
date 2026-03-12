"""lichess.py — Lichess API service (server-side, if needed for proxying)
NOTE: In most cases, Lichess API calls are made client-side (see frontend/src/api/lichess.ts).
"""
import httpx


async def get_user_games(username: str, limit: int = 10) -> list[dict]:
    url = f"https://lichess.org/api/games/user/{username}?max={limit}&pgnInJson=true"
    async with httpx.AsyncClient() as client:
        res = await client.get(url, headers={"Accept": "application/x-ndjson"})
        res.raise_for_status()
        lines = res.text.strip().split("\n")
        import json
        return [json.loads(line) for line in lines if line.strip()]
