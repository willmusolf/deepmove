// threats.test.ts — Unit tests for threat analysis
// Uses known positions with verifiable outcomes.
// Each test is annotated with the board position being tested.

import { describe, it, expect } from 'vitest'
import { Chess } from 'chess.js'
import { analyzeThreats } from '../threats'

// ─── Hanging piece tests ──────────────────────────────────────────────────────
// Board: 4k3/1b6/8/8/4N3/8/8/4K3 b - - 0 1
// White: Ke1, Ne4.  Black: Ke8, Bb7.
// Black bishop on b7 attacks e4 diagonally. Ne4 has no white defenders.
const HANGING_KNIGHT_FEN = '4k3/1b6/8/8/4N3/8/8/4K3 b - - 0 1'

// Board: 4k3/1b6/8/8/4N3/8/4R3/4K3 b - - 0 1
// White: Ke1, Re2, Ne4.  Black: Ke8, Bb7.
// Rook on e2 defends Ne4 via the e-file → Ne4 is NOT hanging.
const DEFENDED_KNIGHT_FEN = '4k3/1b6/8/8/4N3/8/4R3/4K3 b - - 0 1'

describe('analyzeThreats — hangingPieces', () => {
  it('detects a knight attacked by bishop with no defenders', () => {
    const after = new Chess(HANGING_KNIGHT_FEN)
    const before = new Chess(HANGING_KNIGHT_FEN) // same for this test
    const result = analyzeThreats(before, after, null, 'white')
    expect(result.hangingPieces.length).toBeGreaterThan(0)
    const hangingSquares = result.hangingPieces.map(h => h.square)
    expect(hangingSquares).toContain('e4')
  })

  it('does NOT flag a piece that is defended', () => {
    const after = new Chess(DEFENDED_KNIGHT_FEN)
    const before = new Chess(DEFENDED_KNIGHT_FEN)
    const result = analyzeThreats(before, after, null, 'white')
    const hangingSquares = result.hangingPieces.map(h => h.square)
    expect(hangingSquares).not.toContain('e4')
  })

  it('returns empty hangingPieces when no pieces are under attack', () => {
    // Starting position — nothing is attacked
    const after = new Chess()
    const before = new Chess()
    const result = analyzeThreats(before, after, null, 'white')
    expect(result.hangingPieces).toHaveLength(0)
  })

  it('includes the attacking square in attackedBy', () => {
    const after = new Chess(HANGING_KNIGHT_FEN)
    const before = new Chess(HANGING_KNIGHT_FEN)
    const result = analyzeThreats(before, after, null, 'white')
    const hangingKnight = result.hangingPieces.find(h => h.square === 'e4')
    expect(hangingKnight).toBeDefined()
    expect(hangingKnight?.piece).toBe('n')
    // Black bishop on b7 attacks e4 — b7 should be in attackedBy
    expect(hangingKnight?.attackedBy).toContain('b7')
  })
})

// ─── Threats ignored tests ────────────────────────────────────────────────────
// Before: white's turn, Ne4 already hanging (Bb7 attacks, nothing defends)
// User plays a2-a3 (a useless move), Ne4 still hanging after
const THREATS_IGNORED_BEFORE = '4k3/1b6/8/8/4N3/8/P7/4K3 w - - 0 1'
const THREATS_IGNORED_AFTER  = '4k3/1b6/8/8/4N3/P7/8/4K3 b - - 0 1'

describe('analyzeThreats — threatsIgnored', () => {
  it('detects a threat that was present before and ignored after', () => {
    const before = new Chess(THREATS_IGNORED_BEFORE)
    const after  = new Chess(THREATS_IGNORED_AFTER)
    const result = analyzeThreats(before, after, 'Bb7', 'white')
    expect(result.threatsIgnored.length).toBeGreaterThan(0)
    const ignored = result.threatsIgnored[0]
    expect(ignored.threat).toMatch(/e4/)
  })

  it('does NOT report a threat as ignored when user addressed it', () => {
    // Before: Ne4 hanging.  After: user moved Ne4 away (Ne4→d2) → knight no longer on e4
    const before = new Chess(THREATS_IGNORED_BEFORE)
    // Simulate Ne4 moved to d2 — position after Nd2
    const after = new Chess('4k3/1b6/8/8/8/8/3N4/4K3 b - - 0 1')
    const result = analyzeThreats(before, after, 'Bb7', 'white')
    expect(result.threatsIgnored).toHaveLength(0)
  })

  it('returns empty threatsIgnored when no threat existed before', () => {
    const safe = new Chess('4k3/8/8/8/4N3/8/P7/4K3 w - - 0 1') // No Bb7
    const after = new Chess('4k3/8/8/8/4N3/P7/8/4K3 b - - 0 1')
    const result = analyzeThreats(safe, after, null, 'white')
    expect(result.threatsIgnored).toHaveLength(0)
  })
})

// ─── Pieces left undefended tests ────────────────────────────────────────────
// Before: Re2 defends Ne4 (white's turn). User moves Re2→d2. Ne4 now undefended + attacked.
const UNDEFENDED_BEFORE = '4k3/1b6/8/8/4N3/8/4R3/4K3 w - - 0 1'
const UNDEFENDED_AFTER  = '4k3/1b6/8/8/4N3/8/3R4/4K3 b - - 0 1'

describe('analyzeThreats — piecesLeftUndefended', () => {
  it('detects a piece that lost its defender after the move', () => {
    const before = new Chess(UNDEFENDED_BEFORE)
    const after  = new Chess(UNDEFENDED_AFTER)
    const result = analyzeThreats(before, after, null, 'white')
    expect(result.piecesLeftUndefended.length).toBeGreaterThan(0)
    const squares = result.piecesLeftUndefended.map(p => p.square)
    expect(squares).toContain('e4')
  })

  it('does NOT report pieces that remain defended after the move', () => {
    // Same position but rook stays on e2 — knight stays defended
    const before = new Chess(UNDEFENDED_BEFORE)
    const after  = new Chess(DEFENDED_KNIGHT_FEN) // Re2 still defends Ne4
    const result = analyzeThreats(before, after, null, 'white')
    const squares = result.piecesLeftUndefended.map(p => p.square)
    expect(squares).not.toContain('e4')
  })
})
