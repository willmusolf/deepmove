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

export interface ChessComLoadResult {
  games: ChessComGame[]
  /** Archive URLs that have already been fetched (pass back to loadMoreGames) */
  fetchedArchives: string[]
  /** All archive URLs for this user */
  allArchives: string[]
  /** True if there are older archives that haven't been fetched yet */
  hasMore: boolean
}

export async function getRecentGames(username: string, limit = 50): Promise<ChessComLoadResult> {
  const archives = await getPlayerArchives(username)
  if (archives.length === 0) return { games: [], fetchedArchives: [], allArchives: [], hasMore: false }

  // Fetch last 3 months in parallel so early-month users still see recent games
  const recentArchives = archives.slice(-5)
  const games = await fetchArchives(recentArchives)

  return {
    games: games.sort((a, b) => b.end_time - a.end_time).slice(0, limit),
    fetchedArchives: recentArchives,
    allArchives: archives,
    hasMore: archives.length > recentArchives.length,
  }
}

export async function loadMoreGames(
  allArchives: string[],
  fetchedArchives: string[],
  batchSize = 5,
): Promise<ChessComLoadResult> {
  // Find archives we haven't fetched yet, oldest-to-newest, take next batch from the end
  const unfetched = allArchives.filter(a => !fetchedArchives.includes(a))
  if (unfetched.length === 0) return { games: [], fetchedArchives, allArchives, hasMore: false }

  const nextBatch = unfetched.slice(-batchSize)
  const games = await fetchArchives(nextBatch)
  const newFetched = [...fetchedArchives, ...nextBatch]

  return {
    games: games.sort((a, b) => b.end_time - a.end_time),
    fetchedArchives: newFetched,
    allArchives,
    hasMore: unfetched.length > batchSize,
  }
}

async function fetchArchives(urls: string[]): Promise<ChessComGame[]> {
  const results = await Promise.all(
    urls.map(url =>
      fetch(url)
        .then(r => { if (!r.ok) throw new Error(`Chess.com API error: ${r.status}`); return r.json() })
        .then((d: { games: ChessComGame[] }) => d.games)
        .catch(() => [] as ChessComGame[])
    )
  )
  return results.flat()
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
