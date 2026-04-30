import { useState, useEffect, useCallback, useRef } from 'react'
import { getRecentGames, getNewGames, resolveChessComUsername, type ChessComGame, type ChessComLoadResult } from '../../api/chesscom'
import { getUserGames, getNewLichessGames, type LichessGame, type LichessLoadResult } from '../../api/lichess'
import { getMyUsername, setIdentity, isMe, isDismissed, dismiss } from '../../services/identity'
import { useAuthStore } from '../../stores/authStore'

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
  /** Called on Reload with only the new games fetched — caller merges them in */
  onGamesAppended?: (games: ChessComGame[] | LichessGame[], pagination: PaginationState) => void
  /** Newest end_time (unix seconds) already loaded — used to delta-fetch on Reload */
  newestEndTime?: number
}

const STORAGE_KEY: Record<Platform, string> = {
  chesscom: 'deepmove_chesscom_username',
  lichess: 'deepmove_lichess_username',
}

const HISTORY_KEY: Record<Platform, string> = {
  chesscom: 'deepmove_search_history_chesscom',
  lichess: 'deepmove_search_history_lichess',
}

function getStoredUsername(platform: Platform): string {
  return localStorage.getItem(STORAGE_KEY[platform]) ?? getMyUsername(platform) ?? ''
}

const GAMELIST_CACHE_TTL = 7 * 24 * 60 * 60 * 1000 // 7 days

interface GameListCache {
  games: ChessComGame[] | LichessGame[]
  pagination: PaginationState
  fetchedAt: number
}

function getResolvedUsername(platform: Platform, username: string, games: ChessComGame[] | LichessGame[]): string {
  if (platform === 'chesscom') {
    return resolveChessComUsername(username, games as ChessComGame[])
  }
  return username
}

function gameListCacheKey(platform: Platform, username: string): string {
  return `deepmove_gamelist_${platform}_${username.toLowerCase()}`
}

function saveGameListCache(platform: Platform, username: string, games: ChessComGame[] | LichessGame[], pagination: PaginationState) {
  try {
    const entry: GameListCache = { games, pagination, fetchedAt: Date.now() }
    localStorage.setItem(gameListCacheKey(platform, username), JSON.stringify(entry))
  } catch {
    // Silently skip if localStorage quota exceeded
  }
}

function getGameListCache(platform: Platform, username: string): GameListCache | null {
  try {
    const raw = localStorage.getItem(gameListCacheKey(platform, username))
    if (!raw) return null
    const entry: GameListCache = JSON.parse(raw)
    if (Date.now() - entry.fetchedAt > GAMELIST_CACHE_TTL) return null
    return entry
  } catch {
    return null
  }
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

export default function AccountLink({ platform, onGamesLoaded, onGamesAppended, newestEndTime }: AccountLinkProps) {
  const [username, setUsername] = useState(() => getStoredUsername(platform))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadedUser, setLoadedUser] = useState<string | null>(null)
  const [identityVersion, setIdentityVersion] = useState(0)
  const [history, setHistory] = useState<string[]>(() => getHistory(platform))
  const [showSuggestions, setShowSuggestions] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const fetchingRef = useRef(false)

  const bump = useCallback(() => setIdentityVersion(v => v + 1), [])

  const fetchGames = useCallback(async (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    if (fetchingRef.current) return
    fetchingRef.current = true
    setShowSuggestions(false)
    setLoading(true)
    setError(null)
    try {
      // Delta reload: if we already have this user's games loaded, only fetch new ones
      const isReload = loadedUser?.toLowerCase() === trimmed.toLowerCase() && onGamesAppended && newestEndTime != null
      if (isReload && platform === 'chesscom') {
        const newGames = await getNewGames(trimmed, newestEndTime)
        if (newGames.length > 0) {
          const pag: PaginationState = { platform, hasMore: true }  // pagination unchanged — just append
          onGamesAppended(newGames, pag)
        }
        return
      }
      if (isReload && platform === 'lichess') {
        try {
          const newGames = await getNewLichessGames(trimmed, newestEndTime)
          if (newGames.length > 0) {
            const pag: PaginationState = { platform, hasMore: false }
            onGamesAppended(newGames, pag)
          }
        } catch {
          // Silently ignore transient reload errors — existing games still shown
        }
        return
      }

      let games: ChessComGame[] | LichessGame[]
      let pagination: PaginationState
      let resolvedUsername = trimmed
      if (platform === 'chesscom') {
        const result: ChessComLoadResult = await getRecentGames(trimmed)
        games = result.games
        resolvedUsername = result.username ?? trimmed
        pagination = { platform, fetchedArchives: result.fetchedArchives, allArchives: result.allArchives, hasMore: result.hasMore }
      } else {
        const result: LichessLoadResult = await getUserGames(trimmed, 100)
        games = result.games
        pagination = { platform, hasMore: result.hasMore }
      }
      localStorage.setItem(STORAGE_KEY[platform], resolvedUsername)
      setUsername(resolvedUsername)
      addToHistory(platform, resolvedUsername)
      setHistory(getHistory(platform))
      setLoadedUser(resolvedUsername)
      saveGameListCache(platform, resolvedUsername, games, pagination)
      onGamesLoaded(games, resolvedUsername, pagination)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(msg.includes('404') || msg.includes('403')
        ? 'User not found.'
        : 'Failed to fetch games. Check the username and try again.')
    } finally {
      fetchingRef.current = false
      setLoading(false)
    }
  }, [platform, onGamesLoaded, onGamesAppended, newestEndTime, loadedUser])

  // On mount: restore game list from cache if fresh, skipping the API call
  useEffect(() => {
    const savedUsername = getStoredUsername(platform)
    if (!savedUsername) return
    const cached = getGameListCache(platform, savedUsername)
    if (!cached) return
    const resolvedUsername = getResolvedUsername(platform, savedUsername, cached.games)
    setUsername(resolvedUsername)
    setLoadedUser(resolvedUsername)
    localStorage.setItem(STORAGE_KEY[platform], resolvedUsername)
    onGamesLoaded(cached.games, resolvedUsername, cached.pagination)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform])

  useEffect(() => {
    setHistory(getHistory(platform))
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
          <label className="sr-only" htmlFor={`${platform}-account-link-input`}>
            {platform === 'chesscom' ? 'Chess.com username' : 'Lichess username'}
          </label>
          <input
            id={`${platform}-account-link-input`}
            name={`${platform}_username`}
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
          {loading ? 'Loading…' : loadedUser ? 'Reload' : 'Load'}
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
    if (!loadedUser) return
    setIdentity(platform, loadedUser)
    bump()
    // If logged in, also persist the username to the backend profile so
    // the avatar loads in the nav sidebar immediately.
    const { user, updateProfile } = useAuthStore.getState()
    if (user) {
      const patch = platform === 'chesscom'
        ? { chesscom_username: loadedUser }
        : { lichess_username: loadedUser }
      updateProfile(patch).catch(() => { /* best-effort */ })
    }
  }
  function handleNo() {
    if (loadedUser) { dismiss(platform, loadedUser); bump() }
  }
}
