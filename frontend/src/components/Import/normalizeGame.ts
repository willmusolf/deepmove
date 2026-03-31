// normalizeGame.ts — Pure utility functions for normalizing Chess.com/Lichess API
// responses into a common NormalizedGame shape.
// Kept separate from GameSelector.tsx so Fast Refresh works correctly.

import type { ChessComGame } from '../../api/chesscom'
import type { LichessGame } from '../../api/lichess'
import { classifyTimeControl } from '../../chess/eloConfig'
import { getGameId } from '../../services/gameDB'
import { formatTimestamp } from '../../utils/format'

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
  // "7200+60" → "2h+60s", "300+2" → "5+2", "600" → "10 min"
  function fmtBase(secs: number): string {
    if (secs >= 3600) return `${Math.round(secs / 3600)}h`
    if (secs >= 60)   return `${Math.round(secs / 60)}`
    return `${secs}s`
  }
  if (tc.includes('+')) {
    const [baseSecs, inc] = tc.split('+')
    const baseNum = parseInt(baseSecs, 10)
    if (!isNaN(baseNum) && baseNum >= 60) {
      return `${fmtBase(baseNum)}+${inc}`
    }
    return tc
  }
  const secs = parseInt(tc, 10)
  if (isNaN(secs)) return tc
  if (secs >= 3600) return `${Math.round(secs / 3600)}h`
  return `${Math.round(secs / 60)} min`
}
/** Parse any time control string to total seconds, for categorization. */
export function tcToSeconds(tc: string): number {
  // "10 min" → 600
  const minMatch = tc.match(/^(\d+)\s*min$/)
  if (minMatch) return parseInt(minMatch[1], 10) * 60
  // "2h" or "2h+60" → hours
  const hourMatch = tc.match(/^(\d+)h(?:\+(\d+))?$/)
  if (hourMatch) return parseInt(hourMatch[1], 10) * 3600 + (hourMatch[2] ? parseInt(hourMatch[2], 10) : 0)
  // "10+0" or "3+2" → base minutes * 60 + increment seconds
  const plusMatch = tc.match(/^(\d+)\+(\d+)$/)
  if (plusMatch) return parseInt(plusMatch[1], 10) * 60 + parseInt(plusMatch[2], 10)
  // Lichess speed strings (when no clock data)
  const speedMap: Record<string, number> = {
    bullet: 120, blitz: 300, rapid: 600, classical: 1800,
    ultrabullet: 30, correspondence: 86400, daily: 86400,
  }
  if (speedMap[tc.toLowerCase()] !== undefined) return speedMap[tc.toLowerCase()]
  // Raw seconds fallback
  const raw = parseInt(tc, 10)
  return isNaN(raw) ? 1800 : raw
}


export function normalizeChessCom(game: ChessComGame, username: string): NormalizedGame {
  const lowerUser = username.toLowerCase()
  // Determine which side the searched user is on. If neither matches, default to white.
  const isWhite = game.black.username.toLowerCase() === lowerUser ? false
    : game.white.username.toLowerCase() === lowerUser ? true
    : true // fallback: treat as white if username not found (e.g. casing mismatch)
  const me = isWhite ? game.white : game.black
  const opponent = isWhite ? game.black : game.white
  const myResult = me.result
  let result: 'W' | 'L' | 'D'
  if (myResult === 'win') result = 'W'
  else if (['checkmated', 'resigned', 'timeout', 'abandoned', 'lose'].includes(myResult)) result = 'L'
  else result = 'D'
  return {
    pgn: game.pgn,
    opponent: opponent.username,
    opponentRating: opponent.rating,
    userRating: me.rating,
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
  const timeControl = clock ? formatTimeControl(`${clock.initial}+${clock.increment}`) : game.speed
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
