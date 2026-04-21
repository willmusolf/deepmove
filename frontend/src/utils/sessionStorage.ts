export function readSessionJson<T>(key: string): T | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.sessionStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function writeSessionJson(key: string, value: unknown) {
  if (typeof window === 'undefined') return

  try {
    window.sessionStorage.setItem(key, JSON.stringify(value))
  } catch {}
}

export function removeSessionValue(key: string) {
  if (typeof window === 'undefined') return

  try {
    window.sessionStorage.removeItem(key)
  } catch {}
}
