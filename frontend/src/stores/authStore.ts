// authStore.ts — Authentication state (Zustand)
import { create } from 'zustand'
import { usePrefsStore } from './prefsStore'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export interface UserResponse {
  id: number
  email: string
  is_premium: boolean
  is_admin: boolean
  elo_estimate: number | null
  chesscom_username: string | null
  lichess_username: string | null
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
  clearAuth: () => void
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
  } catch {
    throw new Error('Could not reach the server. Is the backend running?')
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: `Error ${res.status}` }))
    throw new Error(body.detail ?? `Error ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  isLoading: false, // starts false — sign-in button shows immediately; refresh updates state async
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
    })
    localStorage.setItem('dm_has_session', '1')
    usePrefsStore.getState().loadFromUser(data.user.preferences)
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
    })
    localStorage.setItem('dm_has_session', '1')
    usePrefsStore.getState().loadFromUser(data.user.preferences)
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
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
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
    } catch {
      clearTimeout(timer)
      // Refresh token expired or invalid — clear the session hint so future
      // page loads don't hit the endpoint again until the user logs in.
      localStorage.removeItem('dm_has_session')
      set({ user: null, accessToken: null, isPremium: false, isLoading: false })
    }
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
  clearAuth: () => set({ user: null, accessToken: null, isPremium: false }),
}))
