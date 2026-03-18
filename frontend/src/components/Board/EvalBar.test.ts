import { describe, it, expect } from 'vitest'
import { cpToWhitePct } from './EvalBar'

describe('cpToWhitePct', () => {
  it('returns 50 for even position (cp=0)', () => {
    expect(cpToWhitePct(0)).toBe(50)
  })

  it('returns ~73.1 for +150cp', () => {
    expect(cpToWhitePct(150)).toBeCloseTo(73.1, 0)
  })

  it('returns ~26.9 for -150cp (symmetric)', () => {
    expect(cpToWhitePct(-150)).toBeCloseTo(26.9, 0)
  })

  it('returns ~88.1 for +300cp (decisive)', () => {
    expect(cpToWhitePct(300)).toBeCloseTo(88.1, 0)
  })

  it('returns ~11.9 for -300cp', () => {
    expect(cpToWhitePct(-300)).toBeCloseTo(11.9, 0)
  })

  it('approaches 100 for mate-like scores (+30000)', () => {
    expect(cpToWhitePct(30000)).toBeGreaterThan(99.99)
  })

  it('approaches 0 for mate-like scores (-30000)', () => {
    expect(cpToWhitePct(-30000)).toBeLessThan(0.01)
  })
})
