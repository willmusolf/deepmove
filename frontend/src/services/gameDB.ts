// gameDB.ts — IndexedDB persistence for analyzed games
// Uses `idb` (Jake Archibald's lightweight IndexedDB wrapper)
// Phase 1: client-side only. Phase 2 (Track D): add backend sync.

import { openDB, type IDBPDatabase } from 'idb'
import type { MoveEval } from '../engine/analysis'
import type { CriticalMoment } from '../chess/types'
import type { ChessComGame } from '../api/chesscom'
import type { LichessGame } from '../api/lichess'

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
const DB_VERSION = 2
const STORE = 'analyzedGames'
const ARCHIVE_CACHE_STORE = 'archiveCache'

interface ArchiveCacheRecord {
  url: string
  games: ChessComGame[]
  cachedAt: number
}

let dbPromise: Promise<IDBPDatabase> | null = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' })
          store.createIndex('username', 'username')
          store.createIndex('platform', 'platform')
          store.createIndex('analyzedAt', 'analyzedAt')
        }
        if (oldVersion < 2) {
          db.createObjectStore(ARCHIVE_CACHE_STORE, { keyPath: 'url' })
        }
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

/** Returns the set of game IDs that have completed cached analysis for a given user+platform */
export async function getAnalyzedGameIds(username: string, platform: string): Promise<Set<string>> {
  const db = await getDB()
  const all = await db.getAllFromIndex(STORE, 'platform', platform) as AnalyzedGameRecord[]
  const lowerUser = username.toLowerCase()
  const ids = new Set<string>()
  for (const r of all) {
    if (r.username.toLowerCase() === lowerUser && !r.partial) ids.add(r.id)
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

// ─── Archive Cache ─────────────────────────────────────────────────────────

/** Returns cached games for a completed monthly archive URL, or null if not cached. */
export async function getArchiveCache(url: string): Promise<ChessComGame[] | null> {
  const db = await getDB()
  const record = await db.get(ARCHIVE_CACHE_STORE, url) as ArchiveCacheRecord | undefined
  return record?.games ?? null
}

/** Stores games for a completed monthly archive URL in IndexedDB indefinitely. */
export async function setArchiveCache(url: string, games: ChessComGame[]): Promise<void> {
  const db = await getDB()
  await db.put(ARCHIVE_CACHE_STORE, { url, games, cachedAt: Date.now() } satisfies ArchiveCacheRecord)
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
