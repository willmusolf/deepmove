import { describe, it, expect } from 'vitest'
import { classifyMove, isSacrificeFn } from './analysis'

describe('classifyMove', () => {
  it('returns forced when only one legal move', () => {
    expect(classifyMove(100, -500, 'white', 1)).toBe('forced')
  })

  it('returns brilliant on tiny loss with sacrifice', () => {
    expect(classifyMove(100, 96, 'white', 20, true)).toBe('brilliant')
  })

  it('returns best on 0 cp loss', () => {
    expect(classifyMove(50, 50, 'white', 20)).toBe('best')
  })

  it('returns best on <=5 cp loss', () => {
    expect(classifyMove(50, 45, 'white', 20)).toBe('best')
  })

  it('returns excellent on <=15 cp loss', () => {
    expect(classifyMove(50, 36, 'white', 20)).toBe('excellent')
  })

  it('returns good on <=50 cp loss', () => {
    expect(classifyMove(100, 60, 'white', 20)).toBe('good')
  })

  it('returns inaccuracy on <=150 cp loss', () => {
    expect(classifyMove(200, 80, 'white', 20)).toBe('inaccuracy')
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

    it('returns mistake when black worsens by 300', () => {
      // black: cpLoss = evalAfter - evalBefore = 200 - (-100) = 300
      expect(classifyMove(-100, 200, 'black', 20)).toBe('mistake')
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
