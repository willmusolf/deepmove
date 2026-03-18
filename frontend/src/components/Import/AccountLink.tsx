import { useState, useEffect, useCallback, useRef } from 'react'
import { getRecentGames, type ChessComGame, type ChessComLoadResult } from '../../api/chesscom'
import { getUserGames, type LichessGame, type LichessLoadResult } from '../../api/lichess'
import { getMyUsername, setIdentity, isMe, isDismissed, dismiss } from '../../services/identity'

type Platform = 'chesscom' | 'lichess'

export interface PaginationState {
  platform: 'chesscom' | 'lichess'
  // Chess.com
  fetchedArchives?: string[]
  allArchives?: string[]
  // Common
  hasMore: boolean
}

interface AccountLinkProps {
  platform: Platform
  onGamesLoaded: (games: ChessComGame[] | LichessGame[], username: string, pagination: PaginationState) => void
}

const STORAGE_KEY: Record<Platform, string> = {
  chesscom: 'deepmove_chesscom_username',
  lichess: 'deepmove_lichess_username',
}

const HISTORY_KEY: Record<Platform, string> = {
  chesscom: 'deepmove_search_history_chesscom',
  lichess: 'deepmove_search_history_lichess',
}

function getHistory(platform: Platform): string[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY[platform]) ?? '[]')
  } catch {
    return []
  }
}

function addToHistory(platform: Platform, username: string) {
  const lower = username.toLowerCase()
  const prev = getHistory(platform).filter(u => u !== lower)
  localStorage.setItem(HISTORY_KEY[platform], JSON.stringify([lower, ...prev].slice(0, 10)))
}

export default function AccountLink({ platform, onGamesLoaded }: AccountLinkProps) {
  const [username, setUsername] = useState(() => {
    const identity = getMyUsername(platform)
    return identity ?? localStorage.getItem(STORAGE_KEY[platform]) ?? ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadedUser, setLoadedUser] = useState<string | null>(null)
  const [identityVersion, setIdentityVersion] = useState(0)
  const [history, setHistory] = useState<string[]>(() => getHistory(platform))
  const [showSuggestions, setShowSuggestions] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const bump = useCallback(() => setIdentityVersion(v => v + 1), [])

  const fetchGames = useCallback(async (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setShowSuggestions(false)
    setLoading(true)
    setError(null)
    try {
      let games: ChessComGame[] | LichessGame[]
      let pagination: PaginationState
      if (platform === 'chesscom') {
        const result: ChessComLoadResult = await getRecentGames(trimmed, 100)
        games = result.games
        pagination = { platform, fetchedArchives: result.fetchedArchives, allArchives: result.allArchives, hasMore: result.hasMore }
      } else {
        const result: LichessLoadResult = await getUserGames(trimmed, 100)
        games = result.games
        pagination = { platform, hasMore: result.hasMore }
      }
      localStorage.setItem(STORAGE_KEY[platform], trimmed)
      addToHistory(platform, trimmed)
      setHistory(getHistory(platform))
      setLoadedUser(trimmed)
      onGamesLoaded(games, trimmed, pagination)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(msg.includes('404') || msg.includes('403')
        ? 'User not found.'
        : 'Failed to fetch games. Check the username and try again.')
    } finally {
      setLoading(false)
    }
  }, [platform, onGamesLoaded])

  useEffect(() => {
    setHistory(getHistory(platform))
    const identity = getMyUsername(platform)
    const saved = identity ?? localStorage.getItem(STORAGE_KEY[platform])
    if (saved) void fetchGames(saved)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform])

  // Close suggestions on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  void identityVersion
  const myUsername = getMyUsername(platform)
  const confirmed = loadedUser ? isMe(platform, loadedUser) : false
  const showPrompt = loadedUser != null &&
    !confirmed &&
    !isDismissed(platform, loadedUser) &&
    myUsername == null

  const suggestions = username.trim()
    ? history.filter(u => u.startsWith(username.toLowerCase()) && u !== username.toLowerCase())
    : history

  const placeholder = platform === 'chesscom' ? 'Chess.com username' : 'Lichess username'

  return (
    <div className="account-link">
      <div className="account-link-row">
        <div
          className={`account-link-input-wrap${confirmed ? ' account-link-input-wrap--crowned' : ''}`}
          ref={wrapRef}
        >
          <input
            className="account-link-input"
            type="text"
            placeholder={placeholder}
            value={username}
            onChange={e => { setUsername(e.target.value); setShowSuggestions(true) }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={e => {
              if (e.key === 'Enter') void fetchGames(username)
              if (e.key === 'Escape') setShowSuggestions(false)
            }}
            disabled={loading}
            autoComplete="off"
          />
          {confirmed && <span className="identity-crown" title="Your account">♔</span>}
          {showSuggestions && suggestions.length > 0 && (
            <ul className="username-suggestions">
              {suggestions.map(u => (
                <li
                  key={u}
                  className="username-suggestions__item"
                  onMouseDown={() => { setUsername(u); setShowSuggestions(false); void fetchGames(u) }}
                >
                  {u}
                  {isMe(platform, u) && <span className="username-suggestions__crown">♔</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          className="btn btn-primary"
          onClick={() => void fetchGames(username)}
          disabled={loading || !username.trim()}
        >
          {loading ? 'Loading…' : 'Load'}
        </button>
      </div>
      {error && <div className="import-error">{error}</div>}
      {showPrompt && (
        <div className="identity-prompt">
          <span className="identity-prompt__text">Is this your account?</span>
          <button className="identity-prompt__yes" onClick={handleYes}>Yes</button>
          <button className="identity-prompt__no" onClick={handleNo}>No</button>
        </div>
      )}
    </div>
  )

  function handleYes() {
    if (loadedUser) { setIdentity(platform, loadedUser); bump() }
  }
  function handleNo() {
    if (loadedUser) { dismiss(platform, loadedUser); bump() }
  }
}
