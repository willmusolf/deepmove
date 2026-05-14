import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('prefsStore', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    document.documentElement.className = ''
    document.documentElement.removeAttribute('data-board')
  })

  it('preserves local appearance when the server has no saved prefs', async () => {
    localStorage.setItem('deepmove_prefs', JSON.stringify({
      appTheme: 'light',
      boardTheme: 'green',
    }))
    localStorage.setItem('soundEnabled', 'false')

    const { usePrefsStore } = await import('./prefsStore')
    usePrefsStore.getState().loadFromUser({})

    expect(usePrefsStore.getState().appTheme).toBe('light')
    expect(usePrefsStore.getState().boardTheme).toBe('green')
    expect(usePrefsStore.getState().soundEnabled).toBe(false)
    expect(document.documentElement.classList.contains('theme-light')).toBe(true)
    expect(document.documentElement.getAttribute('data-board')).toBe('green')
  })

  it('applies valid server appearance prefs when present', async () => {
    localStorage.setItem('deepmove_prefs', JSON.stringify({
      appTheme: 'dark',
      boardTheme: 'blue',
    }))
    localStorage.setItem('soundEnabled', 'true')

    const { usePrefsStore } = await import('./prefsStore')
    usePrefsStore.getState().loadFromUser({
      appTheme: 'light',
      boardTheme: 'purple',
      soundEnabled: false,
    })

    expect(usePrefsStore.getState().appTheme).toBe('light')
    expect(usePrefsStore.getState().boardTheme).toBe('purple')
    expect(usePrefsStore.getState().soundEnabled).toBe(false)
    expect(document.documentElement.classList.contains('theme-light')).toBe(true)
    expect(document.documentElement.getAttribute('data-board')).toBe('purple')
  })
})
