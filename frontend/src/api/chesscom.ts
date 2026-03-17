// chesscom.ts — Chess.com API client (CLIENT-SIDE, direct browser requests)
// Chess.com's public API is CORS-enabled for read-only endpoints.
// We call it directly from the browser — no server proxy needed.
// This means no server-side rate limiting — each user's browser has its own limit.

const CHESSCOM_BASE = 'https://api.chess.com/pub'

export interface ChessComGame {
  url: string
  pgn: string
  time_control: string
  end_time: number
  rated: boolean
  white: { username: string; rating: number; result: string }
  black: { username: string; rating: number; result: string }
}

export interface ChessComArchive {
  archives: string[]  // URLs to monthly game archives
}

export async function getPlayerGames(username: string, year: number, month: number): Promise<ChessComGame[]> {
  const paddedMonth = String(month).padStart(2, '0')
  const res = await fetch(`${CHESSCOM_BASE}/player/${username}/games/${year}/${paddedMonth}`)
  if (!res.ok) throw new Error(`Chess.com API error: ${res.status}`)
  const data = await res.json() as { games: ChessComGame[] }
  return data.games
}

export async function getPlayerArchives(username: string): Promise<string[]> {
  const res = await fetch(`${CHESSCOM_BASE}/player/${username}/games/archives`)
  if (!res.ok) throw new Error(`Chess.com API error: ${res.status}`)
  const data = await res.json() as ChessComArchive
  return data.archives
}

export async function getRecentGames(username: string, limit = 10): Promise<ChessComGame[]> {
  const archives = await getPlayerArchives(username)
  if (archives.length === 0) return []

  // Try the most recent archive first; fall back to the previous month if it's empty
  // (e.g. early in the month the current archive may have no games yet)
  for (let i = archives.length - 1; i >= Math.max(0, archives.length - 2); i--) {
    const res = await fetch(archives[i])
    if (!res.ok) throw new Error(`Chess.com API error: ${res.status}`)
    const data = await res.json() as { games: ChessComGame[] }
    if (data.games.length > 0) {
      return data.games.slice(-limit).reverse()
    }
  }

  return []
}

export interface ChessComPlayer {
  username: string
  avatar?: string
  country?: string
  status: string
  is_online: boolean
  joined: number
  last_online: number
}

export async function getPlayerProfile(username: string): Promise<ChessComPlayer | null> {
  try {
    const res = await fetch(`${CHESSCOM_BASE}/player/${username}`)
    if (!res.ok) return null
    return await res.json() as ChessComPlayer
  } catch {
    return null
  }
}
