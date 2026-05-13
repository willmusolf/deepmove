import { describe, expect, it } from 'vitest'
import { normalizeRestoredPage } from './navigation'

describe('normalizeRestoredPage', () => {
  it('falls back hidden placeholder pages to review', () => {
    expect(normalizeRestoredPage('practice')).toBe('review')
    expect(normalizeRestoredPage('dashboard')).toBe('review')
  })

  it('keeps visible pages unchanged', () => {
    expect(normalizeRestoredPage('review')).toBe('review')
    expect(normalizeRestoredPage('play')).toBe('play')
    expect(normalizeRestoredPage('settings')).toBe('settings')
  })
})
