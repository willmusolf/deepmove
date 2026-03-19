// classifier.test.ts — Unit tests for principle classification
// Tests the priority queue: TACTICAL_01/02 suppress all others,
// Elo gates are respected, and fallback returns null.

import { describe, it, expect } from 'vitest'
import { classifyPrinciple, isInEloGate } from '../classifier'
import type { PositionFeatures, CriticalMoment } from '../types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeFeatures(overrides: Partial<PositionFeatures> = {}): PositionFeatures {
  const emptyMaterial = { pawns: 0, knights: 0, bishops: 0, rooks: 0, queens: 0 }
  const emptyPawns = { isolatedPawns: [], doubledPawns: [], backwardPawns: [], passedPawns: [], pawnIslands: 0 }
  const emptyKingSafety = { castled: 'none' as const, pawnShieldIntegrity: 3, openFilesNearKing: [], score: 0 }
  const emptyActivity = { totalMobility: 0, centralizedPieces: 0, passivePieces: [], badBishop: null }
  const emptyDev = { developedMinorPieces: 0, undevelopedMinorPieces: 0, rooksConnected: false, castled: false, earlyQueenMove: false, sameMovedTwice: false }
  return {
    material: { white: emptyMaterial, black: emptyMaterial, balance: 0, hasBishopPair: { white: false, black: false } },
    pawnStructure: { white: emptyPawns, black: emptyPawns, structureType: 'semi-open' },
    kingSafety: { white: emptyKingSafety, black: emptyKingSafety },
    pieceActivity: { white: emptyActivity, black: emptyActivity, worstPiece: null },
    development: { white: emptyDev, black: emptyDev },
    files: { openFiles: [], halfOpenFiles: { white: [], black: [] } },
    gamePhase: 'opening',
    threats: { hangingPieces: [], piecesLeftUndefended: [], threatsIgnored: [], threatsCreated: [] },
    moveImpact: { description: '', pieceMoved: '', fromSquare: '', toSquare: '', wasCapture: false, wasCheck: false, changedKingSafety: false, changedPawnStructure: false, developedPiece: false, improvedPieceActivity: false, createdWeakness: false, hadClearPurpose: false },
    engineMoveImpact: { description: '', mainIdea: '' },
    ...overrides,
  }
}

function makeMoment(overrides: Partial<Pick<CriticalMoment, 'evalSwing' | 'moveNumber' | 'color'>> = {}) {
  return { evalSwing: 200, moveNumber: 12, color: 'white' as const, ...overrides }
}

// ─── TACTICAL_01 — Blunder Check ─────────────────────────────────────────────

describe('classifyPrinciple — TACTICAL_01', () => {
  it('triggers when a piece is hanging and cpLoss >= 150', () => {
    const features = makeFeatures({
      threats: {
        hangingPieces: [{ square: 'e4', piece: 'n', attackedBy: ['b7'] }],
        piecesLeftUndefended: [], threatsIgnored: [], threatsCreated: [],
      },
    })
    const result = classifyPrinciple(features, makeMoment({ evalSwing: 300 }), 1200)
    expect(result?.principleId).toBe('TACTICAL_01')
    expect(result?.confidence).toBeGreaterThanOrEqual(70)
    expect(result?.confidence).toBeLessThanOrEqual(95)
  })

  it('does NOT trigger when cpLoss < 150', () => {
    const features = makeFeatures({
      threats: {
        hangingPieces: [{ square: 'e4', piece: 'n', attackedBy: ['b7'] }],
        piecesLeftUndefended: [], threatsIgnored: [], threatsCreated: [],
      },
    })
    const result = classifyPrinciple(features, makeMoment({ evalSwing: 100 }), 1200)
    expect(result?.principleId).not.toBe('TACTICAL_01')
  })

  it('does NOT trigger for Elo > 1400 (Elo gate)', () => {
    const features = makeFeatures({
      threats: {
        hangingPieces: [{ square: 'e4', piece: 'n', attackedBy: ['b7'] }],
        piecesLeftUndefended: [], threatsIgnored: [], threatsCreated: [],
      },
    })
    const result = classifyPrinciple(features, makeMoment({ evalSwing: 400 }), 1800)
    expect(result?.principleId).not.toBe('TACTICAL_01')
  })

  it('SUPPRESSES OPENING_01 when hanging piece + undeveloped pieces both trigger', () => {
    const features = makeFeatures({
      threats: {
        hangingPieces: [{ square: 'e4', piece: 'n', attackedBy: ['b7'] }],
        piecesLeftUndefended: [], threatsIgnored: [], threatsCreated: [],
      },
      development: {
        white: { developedMinorPieces: 0, undevelopedMinorPieces: 4, rooksConnected: false, castled: false, earlyQueenMove: false, sameMovedTwice: false },
        black: { developedMinorPieces: 0, undevelopedMinorPieces: 4, rooksConnected: false, castled: false, earlyQueenMove: false, sameMovedTwice: false },
      },
    })
    const result = classifyPrinciple(features, makeMoment({ evalSwing: 300 }), 1200)
    // TACTICAL_01 must win — hanging piece is always the lesson
    expect(result?.principleId).toBe('TACTICAL_01')
  })
})

// ─── TACTICAL_02 — Ignored Threat ────────────────────────────────────────────

describe('classifyPrinciple — TACTICAL_02', () => {
  it('triggers when a threat was ignored and cpLoss >= 100', () => {
    const features = makeFeatures({
      threats: {
        hangingPieces: [],
        piecesLeftUndefended: [],
        threatsIgnored: [{ description: 'Knight on e4 threatened', opponentMove: 'Bb7', threat: 'Ne4 can be captured' }],
        threatsCreated: [],
      },
    })
    const result = classifyPrinciple(features, makeMoment({ evalSwing: 200 }), 1200)
    expect(result?.principleId).toBe('TACTICAL_02')
    expect(result?.confidence).toBeGreaterThanOrEqual(65)
    expect(result?.confidence).toBeLessThanOrEqual(90)
  })

  it('SUPPRESSES OPENING_02 when ignored threat + castling issue both apply', () => {
    const features = makeFeatures({
      threats: {
        hangingPieces: [],
        piecesLeftUndefended: [],
        threatsIgnored: [{ description: 'threat', opponentMove: 'x', threat: 'y' }],
        threatsCreated: [],
      },
      development: {
        white: { developedMinorPieces: 4, undevelopedMinorPieces: 0, rooksConnected: false, castled: false, earlyQueenMove: false, sameMovedTwice: false },
        black: { developedMinorPieces: 4, undevelopedMinorPieces: 0, rooksConnected: false, castled: false, earlyQueenMove: false, sameMovedTwice: false },
      },
    })
    const result = classifyPrinciple(features, makeMoment({ evalSwing: 150, moveNumber: 12 }), 1200)
    expect(result?.principleId).toBe('TACTICAL_02')
  })
})

// ─── OPENING principles ───────────────────────────────────────────────────────

describe('classifyPrinciple — OPENING_01', () => {
  it('triggers when 2+ minor pieces undeveloped in opening (move <= 10 so OPENING_02 does not fire)', () => {
    const features = makeFeatures({
      gamePhase: 'opening',
      development: {
        white: { developedMinorPieces: 1, undevelopedMinorPieces: 3, rooksConnected: false, castled: false, earlyQueenMove: false, sameMovedTwice: false },
        black: { developedMinorPieces: 1, undevelopedMinorPieces: 3, rooksConnected: false, castled: false, earlyQueenMove: false, sameMovedTwice: false },
      },
    })
    // Use moveNumber <= 10 so OPENING_02 (castle early) doesn't fire first
    const result = classifyPrinciple(features, makeMoment({ moveNumber: 8 }), 1200)
    expect(result?.principleId).toBe('OPENING_01')
  })
})

describe('classifyPrinciple — OPENING_02', () => {
  it('triggers when uncastled after move 10 in opening', () => {
    const features = makeFeatures({
      gamePhase: 'early_middlegame',
      development: {
        white: { developedMinorPieces: 4, undevelopedMinorPieces: 0, rooksConnected: false, castled: false, earlyQueenMove: false, sameMovedTwice: false },
        black: { developedMinorPieces: 4, undevelopedMinorPieces: 0, rooksConnected: false, castled: false, earlyQueenMove: false, sameMovedTwice: false },
      },
    })
    const result = classifyPrinciple(features, makeMoment({ moveNumber: 12 }), 1200)
    expect(result?.principleId).toBe('OPENING_02')
  })

  it('does NOT trigger when already castled', () => {
    const features = makeFeatures({
      gamePhase: 'early_middlegame',
      development: {
        white: { developedMinorPieces: 4, undevelopedMinorPieces: 0, rooksConnected: false, castled: true, earlyQueenMove: false, sameMovedTwice: false },
        black: { developedMinorPieces: 4, undevelopedMinorPieces: 0, rooksConnected: false, castled: true, earlyQueenMove: false, sameMovedTwice: false },
      },
    })
    const result = classifyPrinciple(features, makeMoment({ moveNumber: 12 }), 1200)
    expect(result?.principleId).not.toBe('OPENING_02')
  })
})

describe('classifyPrinciple — OPENING_05', () => {
  it('triggers when same piece moved twice (only 1 undeveloped so OPENING_01 does not fire)', () => {
    const features = makeFeatures({
      gamePhase: 'opening',
      development: {
        // undevelopedMinorPieces: 1 — OPENING_01 needs >= 2, so it won't fire
        white: { developedMinorPieces: 3, undevelopedMinorPieces: 1, rooksConnected: false, castled: false, earlyQueenMove: false, sameMovedTwice: true },
        black: { developedMinorPieces: 3, undevelopedMinorPieces: 1, rooksConnected: false, castled: false, earlyQueenMove: false, sameMovedTwice: true },
      },
    })
    // moveNumber: 5 — OPENING_02 needs moveNumber > 10, won't fire
    const result = classifyPrinciple(features, makeMoment({ moveNumber: 5 }), 1200)
    expect(result?.principleId).toBe('OPENING_05')
  })
})

// ─── Fallback ────────────────────────────────────────────────────────────────

describe('classifyPrinciple — fallback', () => {
  it('returns null when no rules match', () => {
    // Middlegame, all pieces developed, castled, no threats
    const features = makeFeatures({
      gamePhase: 'middlegame',
      development: {
        white: { developedMinorPieces: 4, undevelopedMinorPieces: 0, rooksConnected: true, castled: true, earlyQueenMove: false, sameMovedTwice: false },
        black: { developedMinorPieces: 4, undevelopedMinorPieces: 0, rooksConnected: true, castled: true, earlyQueenMove: false, sameMovedTwice: false },
      },
    })
    const result = classifyPrinciple(features, makeMoment({ evalSwing: 50 }), 1200)
    expect(result).toBeNull()
  })
})

// ─── Elo gate helper ─────────────────────────────────────────────────────────

describe('isInEloGate', () => {
  it('returns true when Elo is within bounds', () => {
    expect(isInEloGate('TACTICAL_01', 1200)).toBe(true)
    expect(isInEloGate('TACTICAL_01', 0)).toBe(true)
    expect(isInEloGate('TACTICAL_01', 1400)).toBe(true)
  })

  it('returns false when Elo is above max', () => {
    expect(isInEloGate('TACTICAL_01', 1401)).toBe(false)
    expect(isInEloGate('TACTICAL_01', 1800)).toBe(false)
  })

  it('returns false for unknown principle', () => {
    expect(isInEloGate('UNKNOWN_99', 1200)).toBe(false)
  })
})
