import { describe, expect, it } from 'vitest'
import {
  CACHE_VERSION,
  positionCacheKey,
  deserializeCachePayload,
  serializeCachePayload,
  upsertCacheEntry,
  type PersistedCachePayload,
} from './positionCacheSession'
import type { TopLine } from '../engine/stockfish'

function makeLine(rank: number, depth = 20): TopLine {
  return {
    rank,
    score: 10 * rank,
    isMate: false,
    mateIn: null,
    pv: ['e2e4'],
    san: 'e4',
    depth,
  }
}

function makePayload(fens: string[]): PersistedCachePayload {
  return {
    version: CACHE_VERSION,
    entries: fens.map(fen => [fen, [{ rank: 1, score: 10, isMate: false, mateIn: null, pv: ['e2e4'], san: 'e4', depth: 20 }]]),
  }
}

// ── scope key isolation ───────────────────────────────────────────────────────

describe('positionCacheKey', () => {
  it('sandbox key differs from game-scoped key', () => {
    const sandboxKey = positionCacheKey(null)
    const gameKey = positionCacheKey('game123')
    expect(sandboxKey).not.toBe(gameKey)
    expect(sandboxKey).toContain('sandbox')
    expect(gameKey).toContain('game123')
  })

  it('includes cache version', () => {
    expect(positionCacheKey('abc')).toContain(`v${CACHE_VERSION}`)
  })
})

// ── deserializeCachePayload validation ────────────────────────────────────────

describe('deserializeCachePayload', () => {
  it('returns null for null input', () => {
    expect(deserializeCachePayload(null)).toBeNull()
  })

  it('returns null for non-object', () => {
    expect(deserializeCachePayload('string')).toBeNull()
    expect(deserializeCachePayload(42)).toBeNull()
  })

  it('returns null for wrong version', () => {
    expect(deserializeCachePayload({ version: 999, entries: [] })).toBeNull()
  })

  it('returns null when entries is not an array', () => {
    expect(deserializeCachePayload({ version: CACHE_VERSION, entries: 'bad' })).toBeNull()
  })

  it('skips malformed entries (non-array entry)', () => {
    const raw = { version: CACHE_VERSION, entries: ['bad', [makeLine(1)]] }
    const result = deserializeCachePayload(raw)
    expect(result).not.toBeNull()
    expect(result!.size).toBe(0)
  })

  it('skips entries with non-string FEN', () => {
    const raw = { version: CACHE_VERSION, entries: [[42, [makeLine(1)]]] }
    expect(deserializeCachePayload(raw)!.size).toBe(0)
  })

  it('skips TopLine entries with missing required fields', () => {
    const badLine = { rank: 1, score: 10 }  // missing isMate, mateIn, pv, san, depth
    const raw = { version: CACHE_VERSION, entries: [['fen1', [badLine]]] }
    expect(deserializeCachePayload(raw)!.size).toBe(0)
  })

  it('restores valid entries', () => {
    const raw = makePayload(['fen1', 'fen2'])
    const result = deserializeCachePayload(raw)
    expect(result).not.toBeNull()
    expect(result!.size).toBe(2)
    expect(result!.has('fen1')).toBe(true)
    expect(result!.has('fen2')).toBe(true)
  })
})

// ── round-trip ────────────────────────────────────────────────────────────────

describe('serializeCachePayload + deserializeCachePayload round-trip', () => {
  it('restores equivalent map', () => {
    const original = new Map<string, TopLine[]>([
      ['fen-a', [makeLine(1), makeLine(2)]],
      ['fen-b', [makeLine(1, 14)]],
    ])
    const serialized = serializeCachePayload(original)
    const restored = deserializeCachePayload(serialized)
    expect(restored).not.toBeNull()
    expect(restored!.size).toBe(2)
    const linesA = restored!.get('fen-a')!
    expect(linesA).toHaveLength(2)
    expect(linesA[0].rank).toBe(1)
    expect(linesA[1].rank).toBe(2)
    expect(restored!.get('fen-b')![0].depth).toBe(14)
  })
})

// ── upsertCacheEntry LRU cap behavior ─────────────────────────────────────────

describe('upsertCacheEntry', () => {
  it('adds a new entry', () => {
    const payload: PersistedCachePayload = { version: CACHE_VERSION, entries: [] }
    const updated = upsertCacheEntry(payload, 'fen1', [makeLine(1)])
    expect(updated.entries).toHaveLength(1)
    expect(updated.entries[0][0]).toBe('fen1')
  })

  it('refreshes existing FEN to newest position (moves to end)', () => {
    const payload = makePayload(['fen1', 'fen2', 'fen3'])
    const updated = upsertCacheEntry(payload, 'fen1', [makeLine(1, 22)])
    // fen1 should now be at the end (newest)
    expect(updated.entries[updated.entries.length - 1][0]).toBe('fen1')
    // fen2 and fen3 retain their positions before fen1
    expect(updated.entries[0][0]).toBe('fen2')
    expect(updated.entries[1][0]).toBe('fen3')
    expect(updated.entries).toHaveLength(3)
  })

  it('drops oldest entry when size exceeds 200', () => {
    const fens = Array.from({ length: 200 }, (_, i) => `fen${i}`)
    let payload = makePayload(fens)
    expect(payload.entries).toHaveLength(200)
    payload = upsertCacheEntry(payload, 'fen-new', [makeLine(1)])
    expect(payload.entries).toHaveLength(200)
    // fen0 (oldest) should be gone
    expect(payload.entries.find(([f]) => f === 'fen0')).toBeUndefined()
    // fen-new should be at the end
    expect(payload.entries[payload.entries.length - 1][0]).toBe('fen-new')
  })

  it('stays at 200 when updating an existing entry in a full cache', () => {
    const fens = Array.from({ length: 200 }, (_, i) => `fen${i}`)
    const payload = makePayload(fens)
    const updated = upsertCacheEntry(payload, 'fen50', [makeLine(1, 22)])
    // Updating an existing entry should not grow the cache
    expect(updated.entries).toHaveLength(200)
    expect(updated.entries[updated.entries.length - 1][0]).toBe('fen50')
  })
})
