import { describe, it, expect } from 'vitest'
import { classifyMove } from './analysis'

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
