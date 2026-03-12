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
  // Fetch the most recent archive (last in list)
  const latestArchiveUrl = archives[archives.length - 1]
  const res = await fetch(latestArchiveUrl)
  if (!res.ok) throw new Error(`Chess.com API error: ${res.status}`)
  const data = await res.json() as { games: ChessComGame[] }
  // Return most recent games first
  return data.games.slice(-limit).reverse()
}
