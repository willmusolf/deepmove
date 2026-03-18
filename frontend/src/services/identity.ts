const STORAGE_KEY = 'deepmove_identity'
const DISMISSED_KEY = 'deepmove_identity_dismissed'

type Platform = 'chesscom' | 'lichess'
interface Identity { chesscom?: string; lichess?: string }
interface Dismissed { chesscom?: string[]; lichess?: string[] }

export function getIdentity(): Identity {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export function setIdentity(platform: Platform, username: string | null): void {
  const identity = getIdentity()
  if (username) {
    identity[platform] = username.toLowerCase()
  } else {
    delete identity[platform]
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(identity))
}

export function getMyUsername(platform: Platform): string | undefined {
  return getIdentity()[platform]
}

export function isMe(platform: Platform, username: string): boolean {
  const my = getMyUsername(platform)
  return !!my && my === username.toLowerCase()
}

function getDismissed(): Dismissed {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export function isDismissed(platform: Platform, username: string): boolean {
  const d = getDismissed()
  return (d[platform] ?? []).includes(username.toLowerCase())
}

export function dismiss(platform: Platform, username: string): void {
  const d = getDismissed()
  const list = d[platform] ?? []
  const lower = username.toLowerCase()
  if (!list.includes(lower)) {
    d[platform] = [...list, lower]
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(d))
  }
}
