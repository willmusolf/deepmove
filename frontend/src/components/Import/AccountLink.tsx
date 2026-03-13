import { useState, useEffect } from 'react'
import { getRecentGames, type ChessComGame } from '../../api/chesscom'
import { getUserGames, type LichessGame } from '../../api/lichess'

type Platform = 'chesscom' | 'lichess'

interface AccountLinkProps {
  platform: Platform
  onGamesLoaded: (games: ChessComGame[] | LichessGame[], username: string) => void
}

const STORAGE_KEY: Record<Platform, string> = {
  chesscom: 'deepmove_chesscom_username',
  lichess: 'deepmove_lichess_username',
}

export default function AccountLink({ platform, onGamesLoaded }: AccountLinkProps) {
  const [username, setUsername] = useState(() => localStorage.getItem(STORAGE_KEY[platform]) ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Auto-load if we have a saved username
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY[platform])
    if (saved) {
      void fetchGames(saved)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform])

  async function fetchGames(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    try {
      if (platform === 'chesscom') {
        const games = await getRecentGames(trimmed, 50)
        localStorage.setItem(STORAGE_KEY[platform], trimmed)
        onGamesLoaded(games, trimmed)
      } else {
        const games = await getUserGames(trimmed, 50)
        localStorage.setItem(STORAGE_KEY[platform], trimmed)
        onGamesLoaded(games, trimmed)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      if (msg.includes('404') || msg.includes('403')) {
        setError('User not found.')
      } else {
        setError('Failed to fetch games. Check the username and try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const placeholder = platform === 'chesscom' ? 'Chess.com username' : 'Lichess username'

  return (
    <div className="account-link">
      <div className="account-link-row">
        <input
          className="account-link-input"
          type="text"
          placeholder={placeholder}
          value={username}
          onChange={e => setUsername(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void fetchGames(username) }}
          disabled={loading}
        />
        <button
          className="btn btn-primary"
          onClick={() => void fetchGames(username)}
          disabled={loading || !username.trim()}
        >
          {loading ? 'Loading…' : 'Load'}
        </button>
      </div>
      {error && <div className="import-error">{error}</div>}
    </div>
  )
}
