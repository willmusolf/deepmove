// client.ts — HTTP client for the DeepMove backend API.
// All calls to the FastAPI backend go through this module.
// Adds auth headers automatically and retries on 401 via silent refresh.

import { useAuthStore } from '../stores/authStore'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

type RequestOptions = RequestInit & { timeoutMs?: number }

async function fetchWithTimeout(
  url: string,
  options: RequestOptions,
  headers: Record<string, string>,
): Promise<Response> {
  const controller = new AbortController()
  const timeoutMs = options.timeoutMs ?? 25000
  const { signal: callerSignal, timeoutMs: _timeoutMs, ...restOptions } = options
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  if (callerSignal) callerSignal.addEventListener('abort', () => controller.abort())

  try {
    return await fetch(url, {
      credentials: 'include',
      ...restOptions,
      headers,
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError(0, 'Request timed out')
    }
    throw new ApiError(0, 'Could not reach the server')
  } finally {
    clearTimeout(timer)
  }
}

async function request<T>(path: string, options?: RequestOptions): Promise<T> {
  const token = useAuthStore.getState().accessToken
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> | undefined),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetchWithTimeout(`${API_BASE}${path}`, options ?? {}, headers)

  // On 401, try to refresh and retry once
  if (res.status === 401 && token) {
    try {
      await useAuthStore.getState().refresh()
      const newToken = useAuthStore.getState().accessToken
      if (newToken) {
        headers['Authorization'] = `Bearer ${newToken}`
        const retry = await fetchWithTimeout(`${API_BASE}${path}`, options ?? {}, headers)
        if (!retry.ok) {
          const body = await retry.json().catch(() => ({ detail: `Error ${retry.status}` }))
          throw new ApiError(retry.status, body.detail ?? `Error ${retry.status}`)
        }
        return retry.json() as Promise<T>
      }
    } catch {
      // Refresh failed — user is logged out
      useAuthStore.getState().clearAuth()
    }
    throw new ApiError(401, 'Authentication required')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: `Error ${res.status}` }))
    throw new ApiError(res.status, body.detail ?? `Error ${res.status}`)
  }
  return res.json() as Promise<T>
}

export { ApiError }

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, {
      method: 'POST',
      ...options,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path: string) =>
    request<{ deleted: boolean }>(path, { method: 'DELETE' }),
}
