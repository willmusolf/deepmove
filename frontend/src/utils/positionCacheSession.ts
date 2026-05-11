import type { TopLine } from '../engine/stockfish'
import { readSessionJson, writeSessionJson } from './sessionStorage'

export const CACHE_VERSION = 1
const MAX_ENTRIES = 200
const THROTTLE_MS = 300

export interface PersistedTopLine {
  rank: number
  score: number
  isMate: boolean
  mateIn: number | null
  pv: string[]
  san: string
  depth: number
}

export interface PersistedCachePayload {
  version: number
  entries: Array<[string, PersistedTopLine[]]>  // ordered oldest → newest
}

export function positionCacheKey(scopeId: string | null): string {
  const scope = scopeId ?? 'sandbox'
  return `deepmove_poscache_v${CACHE_VERSION}_${scope}`
}

function isValidPersistedTopLine(v: unknown): v is PersistedTopLine {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
    typeof o.rank === 'number' &&
    typeof o.score === 'number' &&
    typeof o.isMate === 'boolean' &&
    (o.mateIn === null || typeof o.mateIn === 'number') &&
    Array.isArray(o.pv) &&
    (o.pv as unknown[]).every(m => typeof m === 'string') &&
    typeof o.san === 'string' &&
    typeof o.depth === 'number'
  )
}

export function deserializeCachePayload(raw: unknown): Map<string, TopLine[]> | null {
  if (!raw || typeof raw !== 'object') return null
  const payload = raw as Record<string, unknown>
  if (payload.version !== CACHE_VERSION) return null
  if (!Array.isArray(payload.entries)) return null

  const result = new Map<string, TopLine[]>()
  for (const entry of payload.entries as unknown[]) {
    if (!Array.isArray(entry) || entry.length !== 2) continue
    const [fen, lines] = entry
    if (typeof fen !== 'string') continue
    if (!Array.isArray(lines)) continue
    const validLines = (lines as unknown[]).filter(isValidPersistedTopLine) as TopLine[]
    if (validLines.length > 0) {
      result.set(fen, validLines)
    }
  }
  return result
}

export function serializeCachePayload(cache: Map<string, TopLine[]>): PersistedCachePayload {
  const entries: Array<[string, PersistedTopLine[]]> = []
  for (const [fen, lines] of cache) {
    const compact: PersistedTopLine[] = lines.map(l => ({
      rank: l.rank,
      score: l.score,
      isMate: l.isMate,
      mateIn: l.mateIn,
      pv: l.pv,
      san: l.san,
      depth: l.depth,
    }))
    entries.push([fen, compact])
  }
  return { version: CACHE_VERSION, entries }
}

export function upsertCacheEntry(
  payload: PersistedCachePayload,
  fen: string,
  lines: TopLine[],
): PersistedCachePayload {
  const entries = payload.entries.filter(([f]) => f !== fen)
  const compact: PersistedTopLine[] = lines.map(l => ({
    rank: l.rank,
    score: l.score,
    isMate: l.isMate,
    mateIn: l.mateIn,
    pv: l.pv,
    san: l.san,
    depth: l.depth,
  }))
  entries.push([fen, compact])
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES)
  return { version: CACHE_VERSION, entries }
}

export interface ThrottledCacheWriter {
  flush: (fen: string, lines: TopLine[]) => void
  cancel: () => void
}

export function makeThrottledWriter(
  getCache: () => Map<string, TopLine[]>,
  key: string,
): ThrottledCacheWriter {
  let timerId: ReturnType<typeof setTimeout> | null = null
  let pendingPayload: PersistedCachePayload = { version: CACHE_VERSION, entries: [] }
  let dirty = false

  function scheduleWrite() {
    if (timerId !== null) return
    timerId = setTimeout(() => {
      timerId = null
      if (!dirty) return
      dirty = false
      writeSessionJson(key, pendingPayload)
    }, THROTTLE_MS)
  }

  return {
    flush(fen: string, lines: TopLine[]) {
      if (lines.length === 0) return
      // Build full payload from live cache on first use or keep accumulating
      // Re-derive from the live cache so we always persist the freshest state
      pendingPayload = serializeCachePayload(getCache())
      // Then upsert the just-written entry to ensure it's refreshed to newest
      pendingPayload = upsertCacheEntry(pendingPayload, fen, lines)
      dirty = true
      scheduleWrite()
    },
    cancel() {
      if (timerId !== null) {
        clearTimeout(timerId)
        timerId = null
      }
      dirty = false
    },
  }
}

export function restorePositionCache(
  cache: Map<string, TopLine[]>,
  scopeId: string | null,
): void {
  const key = positionCacheKey(scopeId)
  const raw = readSessionJson<unknown>(key)
  const restored = deserializeCachePayload(raw)
  if (!restored) return
  for (const [fen, lines] of restored) {
    cache.set(fen, lines)
  }
}
