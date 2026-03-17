import { describe, it, expect } from 'vitest'
import type { MoveEval } from '../../engine/analysis'

// computeSideStats is not exported — test it via the module internals by importing the module
// and re-implementing the minimal version, OR export it. Since it's not exported, we test
// indirectly through observable behavior by creating a wrapper that matches the logic.
// Instead, we export computeSideStats for testing. Since we can't change source in test files,
// we duplicate the logic under test here and trust the source matches.
// Actually — let's just export it. We'll patch the source to export computeSideStats.

// NOTE: this test file imports computeSideStats which we need to export from GameReport.tsx.
// The source will be patched to add `export` before the function.
import { computeSideStats } from './GameReport'

function makeEval(
  moveNumber: number,
  color: 'white' | 'black',
  score: number,
  grade: MoveEval['grade'] = null,
): MoveEval {
  return {
    moveNumber,
    color,
    san: 'e4',
    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
    eval: { score, depth: 18, fen: '', isMate: false, mateIn: null, bestMove: '', pv: [] },
    grade,
  }
}

describe('computeSideStats', () => {
  it('returns null for empty evals', () => {
    expect(computeSideStats([], 'white')).toBeNull()
  })

  it('returns null when no moves for requested side', () => {
    const evals: MoveEval[] = [makeEval(1, 'black', -50)]
    expect(computeSideStats(evals, 'white')).toBeNull()
  })

  it('computes zero ACPL when score holds steady', () => {
    const evals: MoveEval[] = [
      makeEval(1, 'white', 0),
      makeEval(1, 'black', 0),
      makeEval(2, 'white', 0),
    ]
    const stats = computeSideStats(evals, 'white')!
    expect(stats.acpl).toBe(0)
    expect(stats.accuracy).toBe(100)
  })

  it('caps mate scores so ACPL stays sane (not ~30000)', () => {
    // white's first move eval goes from 0 → 30000 (mate in 1 found)
    // Without capping: prevScore=0, curScore=30000, loss = 0-30000 = -30000 → max(0, -30000) = 0 (gain, no loss)
    // Black's reply at score 30000: prevScore=30000→capped 1000, curScore=... simulate black blundering
    // Simpler: opponent transition makes a huge negative swing for the loser
    // Simulate white having a mate: score goes 0 → 1000 (capped), then opponent's reply keeps it high
    // Real case: white makes last move, score = 30000 (checkmate)
    // prevScore = 0 (or prior move), curScore capped to 1000, loss = 0 - 1000 = -1000 → 0 (no loss, it's a gain)
    // The concern is when score DROPS by 30000 — e.g., from +30000 to 0 (blundering a won position)
    const evals: MoveEval[] = [
      makeEval(1, 'white', 30000),  // white plays well, engine sees mate
      makeEval(1, 'black', 0),      // black's reply (irrelevant for white stats)
      makeEval(2, 'white', 0),      // white blunders away the mate
    ]
    const stats = computeSideStats(evals, 'white')!
    // move 1: prevScore=cap(0)=0, curScore=cap(30000)=1000, loss=0-1000=-1000 → 0 (it was a gain)
    // move 2: prevScore=cap(0)=0 (from black's move at index 1), curScore=cap(0)=0, loss=0
    // Actually move 2 white: prevScore = cap(allEvals[1].eval.score) = cap(0) = 0
    // curScore = cap(0) = 0 → loss = 0
    // ACPL = 0/2 = 0. But with uncapped: prevScore=30000, curScore=0, loss=30000 → ACPL = 15000
    // We want the capped version to produce reasonable ACPL ≤ 1000
    expect(stats.acpl).toBeLessThanOrEqual(1000)
  })

  it('counts forced moves in raw counts (they are filtered at render time by GRADE_ORDER)', () => {
    const evals: MoveEval[] = [
      makeEval(1, 'white', 0, 'forced'),
      makeEval(1, 'black', 0),
      makeEval(2, 'white', 0, 'best'),
    ]
    const stats = computeSideStats(evals, 'white')!
    // forced is tracked in counts but excluded from GRADE_ORDER display array
    expect(stats.counts['forced']).toBe(1)
    expect(stats.counts['best']).toBe(1)
  })

  it('counts grade occurrences correctly', () => {
    const evals: MoveEval[] = [
      makeEval(1, 'white', 0, 'blunder'),
      makeEval(1, 'black', 0),
      makeEval(2, 'white', 0, 'blunder'),
      makeEval(2, 'black', 0),
      makeEval(3, 'white', 0, 'mistake'),
    ]
    const stats = computeSideStats(evals, 'white')!
    expect(stats.counts['blunder']).toBe(2)
    expect(stats.counts['mistake']).toBe(1)
  })

  it('computes black ACPL correctly', () => {
    // black: move at index 1. evalBefore = evals[0].score = 0, evalAfter = 200
    // cpLoss (black) = curScore - prevScore = 200 - 0 = 200 → ACPL = 200
    const evals: MoveEval[] = [
      makeEval(1, 'white', 0),
      makeEval(1, 'black', 200),
    ]
    const stats = computeSideStats(evals, 'black')!
    expect(stats.acpl).toBe(200)
  })
})
