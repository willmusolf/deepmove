// chesscom.ts — Chess.com API client (CLIENT-SIDE, direct browser requests)
// Chess.com's public API is CORS-enabled for read-only endpoints.
// We call it directly from the browser — no server proxy needed.
// Each user's browser makes its own requests; we throttle to stay well within limits.

import { getArchiveCache, setArchiveCache } from '../services/gameDB'

const CHESSCOM_BASE = 'https://api.chess.com/pub'

// User-Agent is a "forbidden header" in browser fetch (browsers block it for security).
// We use X-App-Name as the identifier instead, which Chess.com and most APIs accept.
const CHESSCOM_HEADERS: HeadersInit = {
  'X-App-Name': 'DeepMove/1.0 Chess Coaching App',
}

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

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
  const res = await fetch(`${CHESSCOM_BASE}/player/${username}/games/${year}/${paddedMonth}`, { headers: CHESSCOM_HEADERS })
  if (res.status === 429) throw new Error('Chess.com rate limit reached — please wait a moment and try again')
  if (!res.ok) throw new Error(`Chess.com API error: ${res.status}`)
  const data = await res.json() as { games: ChessComGame[] }
  return data.games
}

export async function getPlayerArchives(username: string): Promise<string[]> {
  const res = await fetch(`${CHESSCOM_BASE}/player/${username}/games/archives`, { headers: CHESSCOM_HEADERS })
  if (res.status === 429) throw new Error('Chess.com rate limit reached — please wait a moment and try again')
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

export async function getRecentGames(username: string): Promise<ChessComLoadResult> {
  const archives = await getPlayerArchives(username)
  if (archives.length === 0) return { games: [], fetchedArchives: [], allArchives: [], hasMore: false }

  // Fetch last 5 months sequentially (not parallel) to respect rate limits
  const recentArchives = archives.slice(-5)
  const games = await fetchArchives(recentArchives)

  return {
    games: games.sort((a, b) => b.end_time - a.end_time),
    fetchedArchives: recentArchives,
    allArchives: archives,
    hasMore: archives.length > recentArchives.length,
  }
}

/**
 * Delta reload: fetches only games newer than knownNewestEndTime.
 * Checks current month + previous month (buffer for early-month reloads).
 */
export async function getNewGames(username: string, knownNewestEndTime: number): Promise<ChessComGame[]> {
  const now = new Date()
  const archives: string[] = []
  archives.push(`${CHESSCOM_BASE}/player/${username}/games/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`)
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  archives.push(`${CHESSCOM_BASE}/player/${username}/games/${prev.getFullYear()}/${String(prev.getMonth() + 1).padStart(2, '0')}`)

  const games = await fetchArchives(archives)
  return games.filter(g => g.end_time > knownNewestEndTime)
}

export async function loadMoreGames(
  allArchives: string[],
  fetchedArchives: string[],
  batchSize = 3,
): Promise<ChessComLoadResult> {
  const unfetched = allArchives.filter(a => !fetchedArchives.includes(a))
  if (unfetched.length === 0) return { games: [], fetchedArchives, allArchives, hasMore: false }

  // Reduced batch size from 5 → 3 to stay well within rate limits
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

/** Returns true if the archive URL refers to a fully completed month (will never change). */
function isCompletedMonth(url: string): boolean {
  const match = url.match(/\/games\/(\d{4})\/(\d{2})$/)
  if (!match) return false
  const archiveDate = new Date(parseInt(match[1]), parseInt(match[2]) - 1)
  const currentMonth = new Date(new Date().getFullYear(), new Date().getMonth())
  return archiveDate < currentMonth
}

/**
 * Sequential archive fetcher with IndexedDB caching for completed months.
 * Completed months are immutable — cached indefinitely, no API call on repeat loads.
 * Current month always fetched fresh. 200ms delay between actual API requests.
 */
async function fetchArchives(urls: string[]): Promise<ChessComGame[]> {
  const results: ChessComGame[][] = []
  let apiCallCount = 0
  for (const url of urls) {
    // Check IndexedDB cache for completed months (they never change)
    if (isCompletedMonth(url)) {
      const cached = await getArchiveCache(url)
      if (cached !== null) {
        results.push(cached)
        continue // cache hit — no API call, no delay
      }
    }
    // API call needed — throttle between requests
    if (apiCallCount > 0) await delay(200)
    apiCallCount++
    const games = await fetch(url, { headers: CHESSCOM_HEADERS })
      .then(r => {
        if (r.status === 429) throw new Error('Chess.com rate limit reached — please wait a moment and try again')
        if (!r.ok) throw new Error(`Chess.com API error: ${r.status}`)
        return r.json()
      })
      .then((d: { games: ChessComGame[] }) => d.games)
      .catch(e => {
        console.warn('Chess.com archive fetch failed:', e)
        return [] as ChessComGame[]
      })
    // Cache completed months for future sessions
    if (isCompletedMonth(url) && games.length > 0) {
      void setArchiveCache(url, games)
    }
    results.push(games)
  }
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
    const res = await fetch(`${CHESSCOM_BASE}/player/${username}`, { headers: CHESSCOM_HEADERS })
    if (!res.ok) return null
    return await res.json() as ChessComPlayer
  } catch {
    return null
  }
}
