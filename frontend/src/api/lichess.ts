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

export interface LichessLoadResult {
  games: LichessGame[]
  /** True if there may be more games to fetch (returned exactly `limit` games) */
  hasMore: boolean
}

export async function getUserGames(username: string, limit = 50): Promise<LichessLoadResult> {
  try {
    const games = await fetchLichessGames(username, limit)
    return { games, hasMore: games.length >= limit }
  } catch {
    // One retry after 2s — concurrent auto-load from tab switch can briefly exhaust connections
    await new Promise(r => setTimeout(r, 2000))
    const games = await fetchLichessGames(username, limit)
    return { games, hasMore: games.length >= limit }
  }
}

export async function loadMoreLichessGames(
  username: string,
  beforeTimestamp: number,
  limit = 50,
): Promise<LichessLoadResult> {
  const games = await fetchLichessGames(username, limit, beforeTimestamp)
  return { games, hasMore: games.length >= limit }
}

export async function getNewLichessGames(
  username: string,
  sinceTimestamp: number,
): Promise<LichessGame[]> {
  // Fetch games newer than sinceTimestamp (delta reload)
  return fetchLichessGames(username, 300, undefined, undefined, sinceTimestamp + 1)
}

export async function searchGamesByOpponent(username: string, opponent: string, limit = 100): Promise<LichessLoadResult> {
  const games = await fetchLichessGames(username, limit, undefined, opponent)
  return { games, hasMore: games.length >= limit }
}

async function fetchLichessGames(username: string, limit: number, before?: number, vs?: string, since?: number): Promise<LichessGame[]> {
  let url = `${LICHESS_BASE}/games/user/${username}?max=${limit}&pgnInJson=true&clocks=false&opening=false`
  if (before) url += `&until=${before}`
  if (since) url += `&since=${since}`
  if (vs) url += `&vs=${encodeURIComponent(vs)}`
  const res = await fetch(url, { headers: { Accept: 'application/x-ndjson' } })
  if (!res.ok) throw new Error(`Lichess API error: ${res.status}`)
  const text = await res.text()
  return text
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as LichessGame)
}

export interface LichessPlayer {
  id: string
  username: string
  title?: string
  createdAt: number
  seenAt?: number
  playTime: {
    total: number
    tv: number
  }
  count: {
    all: number
    rated: number
    ai: number
    draw: number
    drawH: number
    loss: number
    lossH: number
    win: number
    winH: number
    bookmark: number
    playing: number
    import: number
    me: number
  }
  profile?: {
    country?: string
    location?: string
    bio?: string
    firstName?: string
    lastName?: string
    fideRating?: number
    uscfRating?: number
    ecfRating?: number
    links?: string
  }
}

export async function getPlayerProfile(username: string): Promise<LichessPlayer | null> {
  try {
    const res = await fetch(`${LICHESS_BASE}/user/${username}`)
    if (!res.ok) return null
    return await res.json() as LichessPlayer
  } catch {
    return null
  }
}
