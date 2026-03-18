// authStore.ts — Authentication state (Zustand)
import { create } from 'zustand'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export interface UserResponse {
  id: number
  email: string
  is_premium: boolean
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
    chesscom_username?: string
    lichess_username?: string
    elo_estimate?: number
    preferences?: Record<string, unknown>
  }) => Promise<void>
  clearAuth: () => void
}

async function authFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // Send HttpOnly cookies
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: `Error ${res.status}` }))
    throw new Error(body.detail ?? `Error ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  isLoading: true, // starts true — resolved by initial refresh attempt
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
    set({ user: null, accessToken: null, isPremium: false })
  },

  refresh: async () => {
    set({ isLoading: true })
    try {
      const data = await authFetch<AuthResponse>('/auth/refresh', { method: 'POST' })
      set({
        user: data.user,
        accessToken: data.access_token,
        isPremium: data.user.is_premium,
        isLoading: false,
      })
    } catch {
      // No valid refresh token — user is anonymous (that's fine)
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

  clearAuth: () => set({ user: null, accessToken: null, isPremium: false }),
}))
