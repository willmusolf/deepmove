import { describe, expect, it, vi, afterEach } from 'vitest'
import { detectPerformanceTier, getEngineProfile } from './engineProfile'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getEngineProfile', () => {
  it('returns correct normal tier profile', () => {
    expect(getEngineProfile('normal')).toEqual({
      backgroundHashMB: 64,
      interactiveHashMB: 24,
      branchHashMB: 16,
    })
  })

  it('returns correct low-memory tier profile', () => {
    expect(getEngineProfile('low-memory')).toEqual({
      backgroundHashMB: 32,
      interactiveHashMB: 16,
      branchHashMB: 8,
    })
  })
})

describe('detectPerformanceTier', () => {
  it('returns low-memory when deviceMemory <= 4', () => {
    vi.stubGlobal('navigator', { deviceMemory: 4 })
    vi.stubGlobal('window', { innerWidth: 1920 })
    expect(detectPerformanceTier()).toBe('low-memory')
  })

  it('returns normal when deviceMemory > 4', () => {
    vi.stubGlobal('navigator', { deviceMemory: 8 })
    vi.stubGlobal('window', { innerWidth: 1920 })
    expect(detectPerformanceTier()).toBe('normal')
  })

  it('returns low-memory when viewport width <= 768', () => {
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('window', { innerWidth: 768 })
    expect(detectPerformanceTier()).toBe('low-memory')
  })

  it('returns normal when viewport width > 768 and no deviceMemory hint', () => {
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('window', { innerWidth: 1024 })
    expect(detectPerformanceTier()).toBe('normal')
  })

  it('deviceMemory check takes priority over viewport', () => {
    vi.stubGlobal('navigator', { deviceMemory: 2 })
    vi.stubGlobal('window', { innerWidth: 1920 })
    expect(detectPerformanceTier()).toBe('low-memory')
  })
})
