import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('useSound audio session', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    localStorage.setItem('soundEnabled', 'true')
  })

  it('uses an ambient audio session for sound effects and restores auto when muted', async () => {
    const play = vi.fn(() => Promise.resolve())
    const pause = vi.fn()

    class MockAudio {
      currentTime = 0
      paused = true
      ended = false
      muted = false
      readyState = 1
      preload = 'auto'

      constructor(_src?: string) {}

      load() {}
      setAttribute() {}
      play() {
        this.paused = false
        return play()
      }
      pause() {
        this.paused = true
        pause()
      }
    }

    Object.defineProperty(globalThis, 'Audio', {
      configurable: true,
      writable: true,
      value: MockAudio,
    })

    const audioSession = { type: 'auto' }
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { ...navigator, audioSession },
    })

    const { useSound } = await import('./useSound')
    const { result } = renderHook(() => useSound())

    expect(audioSession.type).toBe('ambient')

    act(() => {
      result.current.playMoveSound('Nf3')
    })

    expect(audioSession.type).toBe('ambient')
    expect(play).toHaveBeenCalled()

    await act(async () => {
      result.current.toggle()
      await Promise.resolve()
    })

    expect(audioSession.type).toBe('auto')
    expect(result.current.enabled).toBe(false)
    expect(pause).toHaveBeenCalled()
  })
})
