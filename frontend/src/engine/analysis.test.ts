import { describe, it, expect, vi } from 'vitest'
import { analyzeGame, classifyMove, isSacrificeFn } from './analysis'
import type { TopLine } from './stockfish'

describe('classifyMove', () => {
  it('returns forced when only one legal move', () => {
    expect(classifyMove(100, -500, 'white', 1)).toBe('forced')
  })

  it('returns brilliant on tiny loss with sacrifice when it is the only good move', () => {
    expect(classifyMove(100, 96, 'white', 20, true, null, true, true)).toBe('brilliant')
  })

  it('does not return brilliant for a sacrifice that is not the only good move', () => {
    expect(classifyMove(100, 96, 'white', 20, true)).toBe('best')
  })

  it('does not return brilliant for a sacrifice that is not top-suggested', () => {
    expect(classifyMove(100, 96, 'white', 20, true, null, false, true)).toBe('excellent')
  })

  it('returns best on 0 cp loss', () => {
    expect(classifyMove(50, 50, 'white', 20)).toBe('best')
  })

  it('returns best on <=5 cp loss', () => {
    expect(classifyMove(50, 45, 'white', 20)).toBe('best')
  })

  it('returns excellent when small loss but not top-suggested', () => {
    // 14cp from +50cp ≈ 1.28% win-probability loss; ≤2% but NOT top-suggested → excellent
    expect(classifyMove(50, 36, 'white', 20, false, null, false)).toBe('excellent')
  })

  it('returns good on <=50 cp loss', () => {
    expect(classifyMove(100, 60, 'white', 20)).toBe('good')
  })

  it('returns inaccuracy on ~9% win-probability loss', () => {
    // 100cp loss from +200cp ≈ 9% win-probability loss; ≤10% → inaccuracy
    expect(classifyMove(200, 100, 'white', 20)).toBe('inaccuracy')
  })

  it('returns mistake on <=300 cp loss', () => {
    expect(classifyMove(300, 50, 'white', 20)).toBe('mistake')
  })

  it('returns blunder on >300 cp loss', () => {
    expect(classifyMove(400, 0, 'white', 20)).toBe('blunder')
  })

  describe('black perspective', () => {
    it('returns best when black holds eval', () => {
      // black: cpLoss = evalAfter - evalBefore = -50 - (-50) = 0
      expect(classifyMove(-50, -50, 'black', 20)).toBe('best')
    })

    it('returns blunder when black worsens by large win-probability swing', () => {
      // black: +100cp → -200cp = 26.7% win-probability loss → blunder
      expect(classifyMove(-100, 200, 'black', 20)).toBe('blunder')
    })

    it('returns blunder when black worsens by >300', () => {
      // black: cpLoss = 250 - (-100) = 350
      expect(classifyMove(-100, 250, 'black', 20)).toBe('blunder')
    })
  })

  describe('mate score capping', () => {
    it('caps +30000 to 1000 before computing loss', () => {
      // white: before=30000→1000, after=100. cpLoss = 1000-100 = 900 → blunder
      expect(classifyMove(30000, 100, 'white', 20)).toBe('blunder')
    })

    it('caps -30000 correctly for black', () => {
      // black: before=-30000→-1000, after=100. cpLoss = 100-(-1000) = 1100 → blunder
      expect(classifyMove(-30000, 100, 'black', 20)).toBe('blunder')
    })
  })
})


describe('isSacrificeFn', () => {
  // Starting position FEN — white to move
  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

  it('returns false when no net material is given up (pawn captures pawn)', () => {
    // FEN after 1.e4 d5 2.exd5 — white pawn captured black pawn (even trade)
    const fen = 'rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2'
    const move = { piece: 'p', captured: 'p', to: 'd5' }
    expect(isSacrificeFn(move, fen)).toBe(false)
  })

  it('returns false when capturing a more valuable piece (piece gain, not sacrifice)', () => {
    // Knight captures queen — not a sacrifice
    const move = { piece: 'n', captured: 'q', to: 'd5' }
    // netGiven = 3 - 9 = -6 ≤ 0 → false immediately
    expect(isSacrificeFn(move, START_FEN)).toBe(false)
  })

  it('returns false when piece is not immediately recapturable by a lesser piece', () => {
    // Queen moves to d5, black cannot recapture with anything cheaper
    // Use a position where no recapture is available
    // FEN: white queen on d5, no black pawn/minor piece can capture it
    const fen = '4k3/8/8/3Q4/8/8/8/4K3 b - - 0 1'
    const move = { piece: 'q', captured: undefined, to: 'd5' }
    expect(isSacrificeFn(move, fen)).toBe(false)
  })

  it('returns true for a genuine sacrifice (queen sac recapturable by pawn)', () => {
    // White queen goes to e6, black pawn on d7 can capture it
    // FEN: white queen just moved to e6, black pawn on d7, black to move
    // Queen on e6, black pawn on d7 can take it: pawn value(1) < netGiven(9-0=9)
    const sacrificeFen = '4k3/3p4/4Q3/8/8/8/8/4K3 b - - 0 1'
    const move2 = { piece: 'q', captured: undefined as string | undefined, to: 'e6' }
    expect(isSacrificeFn(move2, sacrificeFen)).toBe(true)
  })
})

describe('analyzeGame', () => {
  it('preserves white-perspective engine scores and mate distances', async () => {
    // analyzeGame now uses analyzePositionMultiPV (multi-PV for top-suggestion tracking)
    const makeLines = (score: number, isMate: boolean, mateIn: number | null, pv: string[]): TopLine[] => [
      { rank: 1, score, isMate, mateIn, pv, san: pv[0] ?? '', depth: 16 },
    ]
    const engine = {
      analyzePositionMultiPV: vi
        .fn()
        .mockResolvedValueOnce(makeLines(0, false, null, ['e2e4']))
        .mockResolvedValueOnce(makeLines(120, true, 4, ['e7e5']))
        .mockResolvedValueOnce(makeLines(15, false, null, ['g1f3'])),
    } as any

    const results = await analyzeGame('1. e4 e5', engine, 16)

    expect(results).toHaveLength(2)
    expect(results[0].color).toBe('white')
    expect(results[0].eval.score).toBe(120)
    expect(results[0].eval.mateIn).toBe(4)
    expect(results[1].color).toBe('black')
    expect(results[1].eval.score).toBe(15)
    expect(results[1].eval.mateIn).toBeNull()
  })

  it('checks the opening move against the initial position top line', async () => {
    const makeLines = (score: number, pv: string[]): TopLine[] => [
      { rank: 1, score, isMate: false, mateIn: null, pv, san: pv[0] ?? '', depth: 16 },
    ]
    const engine = {
      analyzePositionMultiPV: vi
        .fn()
        .mockResolvedValueOnce(makeLines(0, ['d2d4']))
        .mockResolvedValueOnce(makeLines(4, ['e7e5']))
        .mockResolvedValueOnce(makeLines(0, ['g1f3'])),
    } as any

    const results = await analyzeGame('1. e4 e5', engine, 16)

    expect(results[0].san).toBe('e4')
    expect(results[0].grade).toBe('excellent')
  })

  it('still records the final move when the resulting position is terminal', async () => {
    const makeLines = (score: number, pv: string[]): TopLine[] => [
      { rank: 1, score, isMate: false, mateIn: null, pv, san: pv[0] ?? '', depth: 16 },
    ]
    const engine = {
      analyzePositionMultiPV: vi
        .fn()
        .mockResolvedValueOnce(makeLines(0, ['e2e4']))
        .mockResolvedValueOnce(makeLines(0, ['f2f3']))
        .mockResolvedValueOnce(makeLines(-60, ['e7e5']))
        .mockResolvedValueOnce(makeLines(-120, ['g2g4']))
        .mockResolvedValueOnce([]),
    } as any

    const results = await analyzeGame('1. f3 e5 2. g4 Qh4#', engine, 16)

    expect(results).toHaveLength(4)
    expect(results[3].san).toBe('Qh4#')
    expect(results[3].eval.isMate).toBe(true)
    expect(results[3].eval.score).toBeLessThan(0)
  })
})

describe('classifyMove – great moves', () => {
  // "great" = top-suggested + only good move + winPctLoss ≤ WINPCT_GOOD (5%)
  // Key: uses 5% not 2% so defensive resources (costing a few %) still qualify.

  it('returns great on zero win% loss', () => {
    // isOnlyGoodMove=true, no loss → great
    expect(classifyMove(100, 100, 'white', 20, false, null, true, true)).toBe('great')
  })

  it('returns great on ~2.7% loss (was silently downgraded to good before fix)', () => {
    // evalBefore=100 evalAfter=70 → winPctLoss ≈ 2.69% ≤ 5% → great
    // Before fix (threshold was 2%), this returned 'good'.
    expect(classifyMove(100, 70, 'white', 20, false, null, true, true)).toBe('great')
  })

  it('returns great at the boundary (~4.97% loss)', () => {
    // evalBefore=100 evalAfter=45 → winPctLoss ≈ 4.97% ≤ 5% → great
    expect(classifyMove(100, 45, 'white', 20, false, null, true, true)).toBe('great')
  })

  it('does not return great just over the 5% boundary (~5.4% loss)', () => {
    // evalBefore=100 evalAfter=40 → winPctLoss ≈ 5.43% > 5% → not great
    expect(classifyMove(100, 40, 'white', 20, false, null, true, true)).not.toBe('great')
  })

  it('does not return great when not top-suggested', () => {
    // isOnlyGoodMove=true but isTopSuggested=false → not great
    expect(classifyMove(100, 100, 'white', 20, false, null, false, true)).toBe('excellent')
  })

  it('does not return great when isOnlyGoodMove is false', () => {
    // isTopSuggested=true but no gap from second move → best, not great
    expect(classifyMove(100, 100, 'white', 20, false, null, true, false)).toBe('best')
  })

  it('brilliant takes priority over great when sacrifice conditions are met', () => {
    // sacrifice + isTopSuggested + isOnlyGoodMove + tiny loss + before win% ≥ 20%
    expect(classifyMove(100, 96, 'white', 20, true, null, true, true)).toBe('brilliant')
  })

  it('returns great for black too (perspective flipped correctly)', () => {
    // black: evalBefore=-100 (white down 100), evalAfter=-100 (no change) → winPctLoss=0 → great
    expect(classifyMove(-100, -100, 'black', 20, false, null, true, true)).toBe('great')
  })
})

describe('analyzeGame – great move detection', () => {
  it('grades a move as great when it has a large gap from the second-best option', async () => {
    // top line e2e4 scores +100, second line d2d4 scores -100 → gap ≈ 18.2% ≥ WINPCT_GREAT_GAP (10%)
    // player plays e2e4 (top-suggested) → isOnlyGoodMove=true → great
    const makeLine = (rank: number, score: number, pv: string[]): TopLine => ({
      rank, score, isMate: false, mateIn: null, pv, san: pv[0] ?? '', depth: 16,
    })
    const engine = {
      analyzePositionMultiPV: vi.fn()
        // Seed: initial position — e2e4 far better than d2d4 (≈18% win-% gap)
        .mockResolvedValueOnce([makeLine(1, 100, ['e2e4']), makeLine(2, -100, ['d2d4'])])
        // Loop i=0: position after e4 (score stays healthy, winPctLoss < 0)
        .mockResolvedValueOnce([makeLine(1, 95, ['e7e5'])]),
    } as any

    const results = await analyzeGame('1. e4', engine, 16)
    expect(results[0].grade).toBe('great')
  })
})

describe('brilliant move regression tests', () => {
  it('isSacrificeFn: pawn push capturable by king is NOT a sacrifice', () => {
    // K+P vs K: white pawn just pushed to e6, black king on e8 can capture it
    // king value (999) is not < netGiven (1), so should return false
    const fen = '4k3/8/4P3/8/8/8/8/4K3 b - - 0 1'
    const move = { piece: 'p', captured: undefined as string | undefined, to: 'e6' }
    expect(isSacrificeFn(move, fen)).toBe(false)
  })

  it('classifyMove: no brilliant in an already-lost position', () => {
    // -600cp before, -620cp after → winPctLoss ≈ 0.5%, but playerBefore win% ≈ 9.5% < 20%
    expect(classifyMove(-600, -620, 'white', 20, true)).toBe('best')
  })
})

describe('classifyMove – check suppression', () => {
  it('returns best (not great) when in check with only one good escape', () => {
    // In check, top-suggested, only good move, zero loss → would be "great"
    // but inCheck=true → suppressed to "best"
    expect(classifyMove(100, 100, 'white', 3, false, null, true, true, true)).toBe('best')
  })

  it('returns best (not brilliant) when in check with sacrifice escape', () => {
    // In check, sacrifice, top-suggested, only good move, tiny loss, high win% before
    // → would be "brilliant" but inCheck=true → suppressed to "best"
    expect(classifyMove(100, 96, 'white', 3, true, null, true, true, true)).toBe('best')
  })

  it('still allows best when in check and top-suggested with low loss', () => {
    expect(classifyMove(100, 100, 'white', 3, false, null, true, false, true)).toBe('best')
  })

  it('still grades blunders normally when in check', () => {
    // Bad escape from check is still a blunder
    expect(classifyMove(100, -300, 'white', 3, false, null, false, false, true)).toBe('blunder')
  })

  it('still grades mistakes normally when in check', () => {
    expect(classifyMove(200, 0, 'white', 5, false, null, false, false, true)).toBe('mistake')
  })

  it('does not suppress great when NOT in check (regression guard)', () => {
    // Same params but inCheck=false → great should still work
    expect(classifyMove(100, 100, 'white', 3, false, null, true, true, false)).toBe('great')
  })

  it('forced still takes priority over check suppression', () => {
    // legalMoveCount=1 → forced, regardless of inCheck
    expect(classifyMove(100, -500, 'white', 1, false, null, true, true, true)).toBe('forced')
  })
})
