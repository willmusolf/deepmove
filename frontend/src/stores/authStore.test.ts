import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('authStore refresh session hint behavior', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    localStorage.clear()
    document.documentElement.className = ''
    document.documentElement.removeAttribute('data-board')
  })

  it('preserves dm_has_session on transient refresh failures', async () => {
    localStorage.setItem('dm_has_session', '1')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')))

    const { useAuthStore } = await import('./authStore')
    await useAuthStore.getState().refresh()

    expect(localStorage.getItem('dm_has_session')).toBe('1')
    expect(useAuthStore.getState().isLoading).toBe(false)
  })

  it('clears dm_has_session when refresh token is invalid', async () => {
    localStorage.setItem('dm_has_session', '1')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Invalid refresh token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    ))

    const { useAuthStore } = await import('./authStore')
    await useAuthStore.getState().refresh()

    expect(localStorage.getItem('dm_has_session')).toBeNull()
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(useAuthStore.getState().isLoading).toBe(false)
  })
})
