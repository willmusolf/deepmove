// normalizeGame.ts — Pure utility functions for normalizing Chess.com/Lichess API
// responses into a common NormalizedGame shape.
// Kept separate from GameSelector.tsx so Fast Refresh works correctly.

import type { ChessComGame } from '../../api/chesscom'
import type { LichessGame } from '../../api/lichess'
import { classifyTimeControl } from '../../chess/eloConfig'
import { getGameId } from '../../services/gameDB'

export interface NormalizedGame {
  pgn: string
  opponent: string
  opponentRating: number
  userRating: number
  result: 'W' | 'L' | 'D'
  timeControl: string
  date: string
  isWhite: boolean
  gameId: string
  endTime: number
  isCachedOnly: boolean
}

export function formatTimeControl(tc: string): string {
  if (tc.includes('+')) return tc
  const secs = parseInt(tc, 10)
  if (isNaN(secs)) return tc
  return `${Math.round(secs / 60)} min`
}

function formatTimestamp(ms: number): string {
  const d = new Date(ms)
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).replace(',', '')
  return `${date} - ${time}`
}

export function normalizeChessCom(game: ChessComGame, username: string): NormalizedGame {
  const isWhite = game.white.username.toLowerCase() === username.toLowerCase()
  const opponent = isWhite ? game.black : game.white
  const myResult = isWhite ? game.white.result : game.black.result
  let result: 'W' | 'L' | 'D'
  if (myResult === 'win') result = 'W'
  else if (['checkmated', 'resigned', 'timeout', 'abandoned', 'lose'].includes(myResult)) result = 'L'
  else result = 'D'
  return {
    pgn: game.pgn,
    opponent: opponent.username,
    opponentRating: opponent.rating,
    userRating: (isWhite ? game.white : game.black).rating,
    result,
    timeControl: formatTimeControl(game.time_control),
    date: formatTimestamp(game.end_time * 1000),
    isWhite,
    gameId: getGameId(game, 'chesscom'),
    endTime: game.end_time * 1000,
    isCachedOnly: false,
  }
}

export function normalizeLichess(game: LichessGame, username: string): NormalizedGame {
  const isWhite = game.players.white.user?.name?.toLowerCase() === username.toLowerCase()
  const opponent = isWhite ? game.players.black : game.players.white
  let result: 'W' | 'L' | 'D' = 'D'
  if ((game as unknown as Record<string, unknown>).winner === (isWhite ? 'white' : 'black')) result = 'W'
  else if ((game as unknown as Record<string, unknown>).winner === (isWhite ? 'black' : 'white')) result = 'L'
  else if (game.status === 'draw' || game.status === 'stalemate') result = 'D'
  const clock = game.clock
  const timeControl = clock ? `${Math.round(clock.initial / 60)}+${clock.increment}` : game.speed
  const userPlayer = isWhite ? game.players.white : game.players.black
  return {
    pgn: game.pgn,
    opponent: opponent.user?.name ?? '?',
    opponentRating: opponent.rating,
    userRating: userPlayer.rating,
    result,
    timeControl,
    date: formatTimestamp(game.createdAt),
    isWhite,
    gameId: getGameId(game, 'lichess'),
    endTime: game.createdAt,
    isCachedOnly: false,
  }
}

// ── Detected Ratings ─────────────────────────────────────────────────────────

export interface DetectedRatings {
  bullet: number | null
  blitz: number | null
  rapid: number | null
  classical: number | null
  primaryMode: 'bullet' | 'blitz' | 'rapid' | 'classical' | null
}

const LS_KEY = 'deepmove_detected_ratings'

function tcToSeconds(tc: string): number {
  if (tc.includes('+')) {
    const base = parseInt(tc, 10)
    if (isNaN(base)) return 600
    return base >= 60 ? base : base * 60
  }
  const mins = parseInt(tc, 10)
  return isNaN(mins) ? 600 : mins * 60
}

/**
 * Compute ratings from a freshly loaded game list and cache to localStorage.
 * Call in onGamesLoaded — rating is in the API response, no analysis needed.
 */
export function cacheRatingsFromGameList(
  games: ChessComGame[] | LichessGame[],
  username: string,
  platform: 'chesscom' | 'lichess',
): void {
  const normalized = (games as (ChessComGame | LichessGame)[]).map(g =>
    platform === 'chesscom'
      ? normalizeChessCom(g as ChessComGame, username)
      : normalizeLichess(g as LichessGame, username)
  )

  // Games come in descending order (most recent first). The first game per
  // time control IS the current rating — no averaging needed.
  const buckets: Record<string, { rating: number; count: number }> = {
    bullet: { rating: 0, count: 0 },
    blitz: { rating: 0, count: 0 },
    rapid: { rating: 0, count: 0 },
    classical: { rating: 0, count: 0 },
  }
  for (const g of normalized) {
    if (!g.userRating || g.userRating <= 0) continue
    const mode = classifyTimeControl(tcToSeconds(g.timeControl))
    buckets[mode].count++
    // Keep only the first (most recent) rating seen per mode
    if (buckets[mode].count === 1) buckets[mode].rating = g.userRating
  }

  const latest = (key: string): number | null =>
    buckets[key].count > 0 ? buckets[key].rating : null

  const best = Object.entries(buckets)
    .sort((a, b) => b[1].count - a[1].count)
    .find(([, v]) => v.count > 0)

  const ratings: DetectedRatings = {
    bullet: latest('bullet'),
    blitz: latest('blitz'),
    rapid: latest('rapid'),
    classical: latest('classical'),
    primaryMode: (best?.[0] ?? null) as DetectedRatings['primaryMode'],
  }
  localStorage.setItem(LS_KEY, JSON.stringify(ratings))
}

/** Read cached ratings — instant, no DB or analysis required. */
export function readCachedRatings(): DetectedRatings | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as DetectedRatings) : null
  } catch {
    return null
  }
}
