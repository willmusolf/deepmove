import { describe, it, expect } from 'vitest'
import type { ChessComGame } from '../../api/chesscom'
import type { LichessGame } from '../../api/lichess'

// normalizeChessCom and normalizeLichess are not exported — export them for testing
import { normalizeChessCom, normalizeLichess } from './GameSelector'

function makeChessComGame(overrides: Partial<ChessComGame> = {}): ChessComGame {
  return {
    url: 'https://chess.com/game/1',
    pgn: '1. e4 e5',
    time_control: '600',
    end_time: 1700000000,
    rated: true,
    white: { username: 'Alice', rating: 1400, result: 'win' },
    black: { username: 'Bob', rating: 1300, result: 'checkmated' },
    ...overrides,
  }
}

function makeLichessGame(overrides: Partial<LichessGame & { winner?: string }> = {}): LichessGame & { winner?: string } {
  return {
    id: 'abc123',
    rated: true,
    variant: 'standard',
    speed: 'rapid',
    perf: 'rapid',
    createdAt: 1700000000000,
    lastMoveAt: 1700001000000,
    status: 'mate',
    players: {
      white: { user: { name: 'Alice' }, rating: 1400 },
      black: { user: { name: 'Bob' }, rating: 1300 },
    },
    pgn: '1. e4 e5',
    clock: { initial: 600, increment: 0 },
    ...overrides,
  }
}

describe('normalizeChessCom', () => {
  it('identifies user as white', () => {
    const g = makeChessComGame()
    const n = normalizeChessCom(g, 'alice') // case-insensitive
    expect(n.isWhite).toBe(true)
    expect(n.opponent).toBe('Bob')
  })

  it('identifies user as black', () => {
    const g = makeChessComGame()
    const n = normalizeChessCom(g, 'Bob')
    expect(n.isWhite).toBe(false)
    expect(n.opponent).toBe('Alice')
  })

  it('maps win result correctly', () => {
    const g = makeChessComGame({ white: { username: 'Alice', rating: 1400, result: 'win' } })
    expect(normalizeChessCom(g, 'Alice').result).toBe('W')
  })

  it('maps checkmated result to L', () => {
    const g = makeChessComGame({ white: { username: 'Alice', rating: 1400, result: 'checkmated' } })
    expect(normalizeChessCom(g, 'Alice').result).toBe('L')
  })

  it('maps resigned result to L', () => {
    const g = makeChessComGame({ white: { username: 'Alice', rating: 1400, result: 'resigned' } })
    expect(normalizeChessCom(g, 'Alice').result).toBe('L')
  })

  it('maps agreed result to D', () => {
    const g = makeChessComGame({ white: { username: 'Alice', rating: 1400, result: 'agreed' } })
    expect(normalizeChessCom(g, 'Alice').result).toBe('D')
  })

  it('formats time control "600" as "10 min"', () => {
    const g = makeChessComGame({ time_control: '600' })
    expect(normalizeChessCom(g, 'Alice').timeControl).toBe('10 min')
  })

  it('passes through "300+3" unchanged', () => {
    const g = makeChessComGame({ time_control: '300+3' })
    expect(normalizeChessCom(g, 'Alice').timeControl).toBe('300+3')
  })

  it('returns opponent rating', () => {
    const n = normalizeChessCom(makeChessComGame(), 'Alice')
    expect(n.opponentRating).toBe(1300)
  })
})

describe('normalizeLichess', () => {
  it('identifies user as white', () => {
    const g = makeLichessGame({ winner: 'white' })
    const n = normalizeLichess(g as LichessGame, 'alice')
    expect(n.isWhite).toBe(true)
    expect(n.result).toBe('W')
  })

  it('identifies user as black', () => {
    const g = makeLichessGame({ winner: 'white' })
    const n = normalizeLichess(g as LichessGame, 'Bob')
    expect(n.isWhite).toBe(false)
    expect(n.result).toBe('L')
  })

  it('maps draw status to D', () => {
    const g = makeLichessGame({ status: 'draw' })
    const n = normalizeLichess(g as LichessGame, 'Alice')
    expect(n.result).toBe('D')
  })

  it('handles anonymous opponent (no user field) gracefully', () => {
    const g = makeLichessGame({
      players: {
        white: { user: { name: 'Alice' }, rating: 1400 },
        black: { user: undefined as unknown as { name: string }, rating: 1300 },
      },
    })
    const n = normalizeLichess(g as LichessGame, 'Alice')
    expect(n.opponent).toBe('?')
  })

  it('formats clock as "10+0"', () => {
    const g = makeLichessGame({ clock: { initial: 600, increment: 0 } })
    expect(normalizeLichess(g as LichessGame, 'Alice').timeControl).toBe('10+0')
  })

  it('falls back to speed when clock is missing', () => {
    const g = makeLichessGame({ clock: undefined as unknown as LichessGame['clock'] })
    expect(normalizeLichess(g as LichessGame, 'Alice').timeControl).toBe('rapid')
  })
})
