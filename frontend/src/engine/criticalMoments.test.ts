import { describe, it, expect } from 'vitest'
import { detectCriticalMoments } from './criticalMoments'
import type { MoveEval } from './analysis'

function makeEval(
  moveNumber: number,
  color: 'white' | 'black',
  score: number,
  san = 'e4',
): MoveEval {
  return {
    moveNumber,
    color,
    san,
    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
    eval: { score, depth: 18, fen: '', isMate: false, mateIn: null, bestMove: '', pv: [] },
    grade: null,
  }
}

describe('detectCriticalMoments', () => {
  it('returns empty when no moves exceed threshold', () => {
    const evals: MoveEval[] = [
      makeEval(1, 'white', 20),
      makeEval(1, 'black', 10),
      makeEval(2, 'white', 15),
    ]
    expect(detectCriticalMoments(evals, 'white', 1300)).toHaveLength(0)
  })

  it('only includes userColor moves', () => {
    const evals: MoveEval[] = [
      makeEval(1, 'white', 20),
      makeEval(1, 'black', -300), // big swing but black's move
      makeEval(2, 'white', -280),
    ]
    // white: move 2 has cpLoss = -300 - (-280) = -20 (from black's perspective that was a gain)
    // actually for white at move index 2: evalBefore = evals[1].eval.score = -300, evalAfter = -280
    // cpLoss (white) = evalBefore - evalAfter = -300 - (-280) = -20 → negative, won't be filtered
    const result = detectCriticalMoments(evals, 'white', 1300)
    result.forEach(m => expect(m.color).toBe('white'))
  })

  it('applies correct threshold for elo < 1200 (150cp)', () => {
    const evals: MoveEval[] = [
      makeEval(1, 'white', 0),     // evalBefore for move 1 = 0 (baseline)
      makeEval(1, 'black', -120),  // black's move — skip
      makeEval(2, 'white', -140),  // white cpLoss = -120 - (-140) = 20 → below 150
    ]
    expect(detectCriticalMoments(evals, 'white', 1000)).toHaveLength(0)
  })

  it('detects move above threshold for elo < 1200', () => {
    // white's move at index 2: evalBefore = evals[1].score = 0, evalAfter = -200
    // cpLoss (white) = 0 - (-200) = 200 > 150 ✓
    const evals: MoveEval[] = [
      makeEval(1, 'white', 20),
      makeEval(1, 'black', 0),
      makeEval(2, 'white', -200),
    ]
    const result = detectCriticalMoments(evals, 'white', 1000)
    expect(result).toHaveLength(1)
    expect(result[0].evalSwing).toBe(200)
  })

  it('applies tighter threshold for elo 1200-1600 (100cp)', () => {
    const evals: MoveEval[] = [
      makeEval(1, 'white', 20),
      makeEval(1, 'black', 0),
      makeEval(2, 'white', -110), // cpLoss = 0 - (-110) = 110 > 100 ✓
    ]
    expect(detectCriticalMoments(evals, 'white', 1300)).toHaveLength(1)
  })

  it('returns at most 3 moments', () => {
    const evals: MoveEval[] = []
    // Alternate white moves with big swings
    for (let i = 0; i < 8; i++) {
      evals.push(makeEval(i + 1, 'black', i * 100))
      evals.push(makeEval(i + 1, 'white', i * 100 - 200))
    }
    const result = detectCriticalMoments(evals, 'white', 1300)
    expect(result.length).toBeLessThanOrEqual(3)
  })

  it('returns top moments sorted by severity (worst first)', () => {
    const evals: MoveEval[] = [
      makeEval(1, 'white', 0),
      makeEval(1, 'black', 0),
      makeEval(2, 'white', -150), // cpLoss = 150
      makeEval(2, 'black', -150),
      makeEval(3, 'white', -550), // cpLoss = 400
      makeEval(3, 'black', -550),
      makeEval(4, 'white', -800), // cpLoss = 250
    ]
    const result = detectCriticalMoments(evals, 'white', 1300)
    expect(result[0].evalSwing).toBeGreaterThanOrEqual(result[1]?.evalSwing ?? 0)
  })

  it('handles black perspective cpLoss correctly', () => {
    // black move at index 1: evalBefore = evals[0].score = -20, evalAfter = 200
    // cpLoss (black) = evalAfter - evalBefore = 200 - (-20) = 220 > 100 ✓
    const evals: MoveEval[] = [
      makeEval(1, 'white', -20),
      makeEval(1, 'black', 200),
    ]
    const result = detectCriticalMoments(evals, 'black', 1300)
    expect(result).toHaveLength(1)
    expect(result[0].evalSwing).toBe(220)
  })

  it('uses 0 as evalBefore for the first move in the game', () => {
    // white's first move: evalBefore = 0 (baseline), evalAfter = -200
    // cpLoss = 0 - (-200) = 200 > 150 ✓
    const evals: MoveEval[] = [
      makeEval(1, 'white', -200),
    ]
    const result = detectCriticalMoments(evals, 'white', 1000)
    expect(result).toHaveLength(1)
    expect(result[0].evalBefore).toBe(0)
  })
})
