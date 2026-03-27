// gameDB.ts — IndexedDB persistence for analyzed games
// Uses `idb` (Jake Archibald's lightweight IndexedDB wrapper)
// Phase 1: client-side only. Phase 2 (Track D): add backend sync.

import { openDB, type IDBPDatabase } from 'idb'
import type { MoveEval } from '../engine/analysis'
import type { CriticalMoment } from '../chess/types'
import type { ChessComGame } from '../api/chesscom'
import type { LichessGame } from '../api/lichess'
import { classifyTimeControl } from '../chess/eloConfig'

// ─── Schema ────────────────────────────────────────────────────────────────

export interface AnalyzedGameRecord {
  id: string                              // canonical game ID
  username: string                        // who imported it
  platform: 'chesscom' | 'lichess' | 'pgn-paste'
  rawPgn: string
  cleanedPgn: string
  userColor: 'white' | 'black' | null
  userElo: number
  moveEvals: MoveEval[]
  criticalMoments: CriticalMoment[]
  analyzedAt: number                      // Date.now()
  // Display metadata (renders in GameSelector without needing API)
  opponent: string
  opponentRating: number
  result: 'W' | 'L' | 'D'
  timeControl: string
  endTime: number                         // unix ms, for sorting
  backendGameId: number | null            // DB primary key after sync (null until uploaded)
  partial?: boolean                         // true = analysis incomplete, safe to resume
}

// ─── DB setup ──────────────────────────────────────────────────────────────

const DB_NAME = 'deepmove'
const DB_VERSION = 1
const STORE = 'analyzedGames'

let dbPromise: Promise<IDBPDatabase> | null = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('username', 'username')
        store.createIndex('platform', 'platform')
        store.createIndex('analyzedAt', 'analyzedAt')
      },
    })
  }
  return dbPromise
}

// ─── CRUD ──────────────────────────────────────────────────────────────────

export async function saveAnalyzedGame(record: AnalyzedGameRecord): Promise<void> {
  const db = await getDB()
  await db.put(STORE, record)
}

export async function getAnalyzedGame(id: string): Promise<AnalyzedGameRecord | undefined> {
  const db = await getDB()
  return db.get(STORE, id)
}

/** Returns the set of game IDs that have cached analysis for a given user+platform */
export async function getAnalyzedGameIds(username: string, platform: string): Promise<Set<string>> {
  const db = await getDB()
  const all = await db.getAllFromIndex(STORE, 'platform', platform) as AnalyzedGameRecord[]
  const lowerUser = username.toLowerCase()
  const ids = new Set<string>()
  for (const r of all) {
    if (r.username.toLowerCase() === lowerUser) ids.add(r.id)
  }
  return ids
}

/** Returns all cached games for a user+platform (for merging fallen-off games into list) */
export async function getCachedGamesForUser(
  username: string,
  platform: string,
): Promise<AnalyzedGameRecord[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex(STORE, 'platform', platform) as AnalyzedGameRecord[]
  const lowerUser = username.toLowerCase()
  return all.filter(r => r.username.toLowerCase() === lowerUser)
}

export async function deleteAnalyzedGame(id: string): Promise<void> {
  const db = await getDB()
  await db.delete(STORE, id)
}

// ─── ID generation ─────────────────────────────────────────────────────────

/** FNV-1a 32-bit hash — fast, deterministic, good distribution for short strings */
function fnv1aHash(str: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16)
}

/** Canonical game ID from a platform game object or raw PGN */
export function getGameId(
  game: ChessComGame | LichessGame | string,
  platform: 'chesscom' | 'lichess' | 'pgn-paste',
): string {
  if (platform === 'chesscom' && typeof game !== 'string') {
    return (game as ChessComGame).url
  }
  if (platform === 'lichess' && typeof game !== 'string') {
    return `lichess:${(game as LichessGame).id}`
  }
  // PGN paste — hash the raw content
  const pgn = typeof game === 'string' ? game : (game as ChessComGame).pgn
  return `pgn:${fnv1aHash(pgn)}`
}

/** DEV ONLY: Clears all analyzed games from IndexedDB */
export async function clearAllAnalyses(): Promise<number> {
  const db = await getDB()
  const count = await db.count(STORE)
  await db.clear(STORE)
  return count
}

// ─── Elo Auto-Detection ─────────────────────────────────────────────────────

export interface DetectedRatings {
  bullet: number | null
  blitz: number | null
  rapid: number | null
  classical: number | null
  /** Time control category with the most games — best default for coaching */
  primaryMode: 'bullet' | 'blitz' | 'rapid' | 'classical' | null
}

/**
 * Parse a stored timeControl string back to seconds.
 * Chess.com stores base in seconds ("600+0"), Lichess stores in minutes ("10+0").
 * Heuristic: base >= 60 → already seconds; base < 60 → minutes.
 * Also handles "X min" format from formatTimeControl.
 */
function parseTimeControlToSeconds(tc: string): number {
  if (tc.includes('+')) {
    const base = parseInt(tc, 10)
    if (isNaN(base)) return 600
    return base >= 60 ? base : base * 60
  }
  const mins = parseInt(tc, 10)
  return isNaN(mins) ? 600 : mins * 60
}

/**
 * Scan all IndexedDB games and compute average Elo per time control category.
 * Uses the 20 most recent games per category for accuracy.
 */
export async function computeDetectedRatings(): Promise<DetectedRatings> {
  const db = await getDB()
  const all = (await db.getAll(STORE)) as AnalyzedGameRecord[]
  console.log('[detectRatings] records:', all.length, all.slice(0,2).map(r => ({ tc: r.timeControl, elo: r.userElo })))
  const buckets: Record<string, AnalyzedGameRecord[]> = {
    bullet: [], blitz: [], rapid: [], classical: [],
  }

  for (const record of all) {
    if (!record.userElo || record.userElo <= 0) continue
    const seconds = parseTimeControlToSeconds(record.timeControl)
    const mode = classifyTimeControl(seconds)
    buckets[mode].push(record)
  }

  function avgElo(records: AnalyzedGameRecord[]): number | null {
    if (records.length === 0) return null
    // Most recent 20
    const recent = records
      .slice()
      .sort((a, b) => b.endTime - a.endTime)
      .slice(0, 20)
    const sum = recent.reduce((acc, r) => acc + r.userElo, 0)
    return Math.round(sum / recent.length)
  }

  const counts = Object.entries(buckets).map(([mode, recs]) => ({ mode, count: recs.length }))
  const mostPlayed = counts.sort((a, b) => b.count - a.count).find(c => c.count > 0)

  return {
    bullet: avgElo(buckets.bullet),
    blitz: avgElo(buckets.blitz),
    rapid: avgElo(buckets.rapid),
    classical: avgElo(buckets.classical),
    primaryMode: (mostPlayed?.mode ?? null) as DetectedRatings['primaryMode'],
  }
}
