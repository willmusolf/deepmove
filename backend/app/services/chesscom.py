"""chesscom.py — Chess.com API service (server-side, if needed for proxying)
NOTE: In most cases, Chess.com API calls are made client-side (see frontend/src/api/chesscom.ts).
This server-side service is a fallback for cases where we need server-side fetching.
"""
import httpx

HEADERS = {"User-Agent": "DeepMove/1.0 Chess Coaching App (contact: hello@deepmove.app)"}


async def get_player_games(username: str, year: int, month: int) -> list[dict]:
    url = f"https://api.chess.com/pub/player/{username}/games/{year}/{month:02d}"
    async with httpx.AsyncClient() as client:
        res = await client.get(url, headers=HEADERS)
        if res.status_code == 429:
            raise RuntimeError("Chess.com rate limit reached — try again shortly")
        res.raise_for_status()
        return res.json().get("games", [])
