import { describe, expect, it } from 'vitest'
import { formatEval } from './format'

describe('formatEval', () => {
  it('formats positive mate with an explicit plus sign', () => {
    expect(formatEval(30000, true, 3)).toBe('+M3')
  })

  it('formats negative mate with an explicit minus sign', () => {
    expect(formatEval(-30000, true, -2)).toBe('-M2')
  })

  it('falls back to the score sign when mate distance is unavailable', () => {
    expect(formatEval(-30000, true, null)).toBe('-M')
  })

  it('shows checkmate for mate in zero', () => {
    expect(formatEval(30000, true, 0)).toBe('#')
  })
})
