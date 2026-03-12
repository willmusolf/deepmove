// lichess.ts — Lichess API client (CLIENT-SIDE, direct browser requests)
// Lichess's API is CORS-enabled and more generous with rate limits than Chess.com.
// Build Lichess first — it's better documented and easier to work with.

const LICHESS_BASE = 'https://lichess.org/api'

export interface LichessGame {
  id: string
  rated: boolean
  variant: string
  speed: string
  perf: string
  createdAt: number
  lastMoveAt: number
  status: string
  players: {
    white: { user: { name: string }; rating: number }
    black: { user: { name: string }; rating: number }
  }
  pgn: string
  clock: { initial: number; increment: number }
}

export async function getUserGames(username: string, limit = 10): Promise<LichessGame[]> {
  // Lichess streams NDJSON — we request pgnInJson=true for convenience
  const res = await fetch(
    `${LICHESS_BASE}/games/user/${username}?max=${limit}&pgnInJson=true&clocks=false&opening=false`,
    { headers: { Accept: 'application/x-ndjson' } },
  )
  if (!res.ok) throw new Error(`Lichess API error: ${res.status}`)
  const text = await res.text()
  // Parse NDJSON (one JSON object per line)
  return text
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as LichessGame)
}

export async function getGame(gameId: string): Promise<string> {
  // Returns PGN string
  const res = await fetch(`${LICHESS_BASE}/game/export/${gameId}`)
  if (!res.ok) throw new Error(`Lichess API error: ${res.status}`)
  return res.text()
}
