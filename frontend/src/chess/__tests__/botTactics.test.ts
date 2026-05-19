import { describe, expect, it } from 'vitest'
import { chooseMaterialAwareBotMove, findObviousCapture } from '../botTactics'

describe('botTactics', () => {
  it('overrides a quiet engine move when a free queen can be taken at 1200', () => {
    const fen = '6k1/4q3/8/8/8/8/8/4R1K1 w - - 0 1'

    expect(findObviousCapture(fen, 1200)).toMatchObject({
      uci: 'e1e7',
      targetValue: 9,
    })
    expect(chooseMaterialAwareBotMove(fen, 'e1e2', 1200)).toBe('e1e7')
  })

  it('does not force a pawn grab for the 1200 bot', () => {
    const fen = '6k1/8/8/3p4/8/8/8/3Q2K1 w - - 0 1'

    expect(findObviousCapture(fen, 1200)).toBeNull()
    expect(chooseMaterialAwareBotMove(fen, 'd1d2', 1200)).toBe('d1d2')
  })

  it('keeps the engine move when it is already a forcing move', () => {
    const fen = '6k1/4q3/8/7Q/8/8/8/4R1K1 w - - 0 1'

    expect(findObviousCapture(fen, 1200)).toMatchObject({
      uci: 'e1e7',
      targetValue: 9,
    })
    expect(chooseMaterialAwareBotMove(fen, 'h5h7', 1200)).toBe('h5h7')
  })
})
