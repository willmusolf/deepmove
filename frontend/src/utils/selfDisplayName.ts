interface SelfDisplayNameSource {
  chesscom_username?: string | null
  lichess_username?: string | null
}

const CHESSCOM_USERNAME_KEY = 'deepmove_chesscom_username'
const LICHESS_USERNAME_KEY = 'deepmove_lichess_username'

function readStoredUsername(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    const value = window.localStorage.getItem(key)?.trim()
    return value ? value : null
  } catch {
    return null
  }
}

export function getSelfDisplayName(source?: SelfDisplayNameSource | null): string {
  const linkedChessCom = source?.chesscom_username?.trim()
  if (linkedChessCom) return linkedChessCom

  const linkedLichess = source?.lichess_username?.trim()
  if (linkedLichess) return linkedLichess

  return readStoredUsername(CHESSCOM_USERNAME_KEY)
    ?? readStoredUsername(LICHESS_USERNAME_KEY)
    ?? 'You'
}
