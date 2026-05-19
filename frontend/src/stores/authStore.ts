// authStore.ts — Authentication state (Zustand)
import { create } from 'zustand'
import { extractValidAppearancePrefs, usePrefsStore } from './prefsStore'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export interface UserResponse {
  id: number
  email: string
  is_premium: boolean
  subscription_status: string
  is_admin: boolean
  elo_estimate: number | null
  chesscom_username: string | null
  lichess_username: string | null
  avatar_url: string | null
  lichess_oauth_linked: boolean
  google_oauth_linked: boolean
  preferences: Record<string, unknown>
  created_at: string
}

interface AuthResponse {
  access_token: string
  user: UserResponse
}

interface AuthState {
  user: UserResponse | null
  accessToken: string | null
  isLoading: boolean
  isPremium: boolean

  register: (email: string, password: string) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  updateProfile: (data: {
    chesscom_username?: string | null
    lichess_username?: string | null
    elo_estimate?: number
    preferences?: Record<string, unknown>
  }) => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
  reloadUser: () => Promise<void>
  clearAuth: () => void
}

let refreshInFlight: Promise<void> | null = null

class AuthFetchError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'AuthFetchError'
    this.status = status
  }
}

function hasStoredSessionHint(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return !!window.localStorage.getItem('dm_has_session')
  } catch {
    return false
  }
}


async function authFetch<T>(path: string, options?: RequestInit): Promise<T> {
  // Merge caller's signal with a 10s timeout so auth calls never hang indefinitely.
  // 10s allows for Neon free-tier cold-start wake-up (~3-5s).
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  const { signal: callerSignal, ...restOptions } = options ?? {}
  if (callerSignal) callerSignal.addEventListener('abort', () => controller.abort())

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // Send HttpOnly cookies
      ...restOptions,
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new AuthFetchError(0, 'The server took too long to respond')
    }
    throw new AuthFetchError(0, 'Could not reach the server. Is the backend running?')
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: `Error ${res.status}` }))
    throw new AuthFetchError(res.status, body.detail ?? `Error ${res.status}`)
  }
  return res.json() as Promise<T>
}

function shouldClearSessionHint(err: unknown): boolean {
  return err instanceof AuthFetchError && (err.status === 401 || err.status === 403)
}

function getMissingAppearancePrefs(userPrefs: Record<string, unknown>) {
  const validPrefs = extractValidAppearancePrefs(userPrefs)
  const currentPrefs = usePrefsStore.getState()
  const missing: Record<string, unknown> = {}

  if (validPrefs.appTheme == null) missing.appTheme = currentPrefs.appTheme
  if (validPrefs.boardTheme == null) missing.boardTheme = currentPrefs.boardTheme
  if (validPrefs.soundEnabled == null) missing.soundEnabled = currentPrefs.soundEnabled

  return missing
}

async function syncMissingAppearancePrefs(
  userPrefs: Record<string, unknown>,
  accessToken: string,
  set: (partial: Partial<AuthState>) => void,
) {
  const missingPrefs = getMissingAppearancePrefs(userPrefs)
  if (Object.keys(missingPrefs).length === 0) return

  try {
    const updated = await authFetch<UserResponse>('/users/me', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ preferences: missingPrefs }),
    })
    set({ user: updated, isPremium: updated.is_premium })
    usePrefsStore.getState().loadFromUser(updated.preferences)
  } catch {
    // Best-effort only — login/refresh should still succeed even if the sync misses.
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  isLoading: hasStoredSessionHint(),
  isPremium: false,

  register: async (email, password) => {
    const data = await authFetch<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    set({
      user: data.user,
      accessToken: data.access_token,
      isPremium: data.user.is_premium,
      isLoading: false,
    })
    localStorage.setItem('dm_has_session', '1')
    usePrefsStore.getState().loadFromUser(data.user.preferences)
    void syncMissingAppearancePrefs(data.user.preferences, data.access_token, set)
  },

  login: async (email, password) => {
    const data = await authFetch<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    set({
      user: data.user,
      accessToken: data.access_token,
      isPremium: data.user.is_premium,
      isLoading: false,
    })
    localStorage.setItem('dm_has_session', '1')
    usePrefsStore.getState().loadFromUser(data.user.preferences)
    void syncMissingAppearancePrefs(data.user.preferences, data.access_token, set)
  },

  logout: async () => {
    const token = get().accessToken
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
    } catch {
      // Logout is best-effort
    }
    localStorage.removeItem('dm_has_session')
    set({ user: null, accessToken: null, isPremium: false })
  },

  refresh: async () => {
    // Skip network call when there is no hint of an existing session.
    // The browser always logs a red 401 "Failed to load resource" for any
    // non-2xx fetch, even when the error is caught in JS — the only way to
    // suppress it for anonymous visitors is to not make the request at all.
    if (!localStorage.getItem('dm_has_session')) {
      set({ user: null, accessToken: null, isPremium: false, isLoading: false })
      return
    }
    if (refreshInFlight) {
      return refreshInFlight
    }
    set({ isLoading: true })
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    refreshInFlight = (async () => {
      try {
        const data = await authFetch<AuthResponse>('/auth/refresh', {
          method: 'POST',
          signal: controller.signal,
        })
        clearTimeout(timer)
        set({
          user: data.user,
          accessToken: data.access_token,
          isPremium: data.user.is_premium,
          isLoading: false,
        })
        usePrefsStore.getState().loadFromUser(data.user.preferences)
        void syncMissingAppearancePrefs(data.user.preferences, data.access_token, set)
      } catch (err) {
        clearTimeout(timer)
        if (shouldClearSessionHint(err)) {
          // Refresh token expired or invalid — clear the session hint so future
          // page loads don't hit the endpoint again until the user logs in.
          localStorage.removeItem('dm_has_session')
          set({ user: null, accessToken: null, isPremium: false, isLoading: false })
        } else {
          // Preserve the session hint on transient failures (cold start/network).
          set({ isLoading: false })
        }
      } finally {
        refreshInFlight = null
      }
    })()
    return refreshInFlight
  },

  updateProfile: async (data) => {
    const token = get().accessToken
    if (!token) throw new Error('Not authenticated')
    const updated = await authFetch<UserResponse>('/users/me', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    })
    set({ user: updated, isPremium: updated.is_premium })
    usePrefsStore.getState().loadFromUser(updated.preferences)
  },


  changePassword: async (currentPassword, newPassword) => {
    const token = get().accessToken
    if (!token) throw new Error('Not authenticated')
    const data = await authFetch<AuthResponse>('/users/me/password', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    })
    set({
      user: data.user,
      accessToken: data.access_token,
      isPremium: data.user.is_premium,
    })
  },
  reloadUser: async () => {
    // Re-fetch /users/me after an account-link operation to get updated oauth flags.
    const token = get().accessToken
    if (!token) return
    try {
      const user = await authFetch<UserResponse>('/users/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
      set({ user, isPremium: user.is_premium })
    } catch {
      // Non-fatal — user data just won't reflect the link until next refresh
    }
  },
  clearAuth: () => set({ user: null, accessToken: null, isPremium: false }),
}))
