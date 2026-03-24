import { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import { loadMoreGames, type ChessComGame } from '../../api/chesscom'
import { loadMoreLichessGames, searchGamesByOpponent, type LichessGame } from '../../api/lichess'
import type { PaginationState } from './AccountLink'
import { useGameStore } from '../../stores/gameStore'
import { cleanPgn } from '../../chess/pgn'
import {
  getGameId,
  getAnalyzedGame,
  getAnalyzedGameIds,
  getCachedGamesForUser,
  type AnalyzedGameRecord,
} from '../../services/gameDB'
import { normalizeChessCom, normalizeLichess, tcToSeconds, type NormalizedGame } from './normalizeGame'
import { formatTimestamp } from '../../utils/format'

interface GameSelectorProps {
  games: ChessComGame[] | LichessGame[]
  username: string
  platform: 'chesscom' | 'lichess'
  onGameLoaded: () => void
  pagination: PaginationState | null
  onGamesAppended: (games: ChessComGame[] | LichessGame[], pagination: PaginationState) => void
}

type SortKey = 'date-desc' | 'date-asc' | 'opp-desc' | 'opp-asc' | 'user-desc' | 'user-asc'
type ResultFilter = 'all' | 'W' | 'L' | 'D'
type ColorFilter = 'all' | 'white' | 'black'
type TCFilter = 'all' | 'bullet' | 'blitz' | 'rapid' | 'classical'

const DISPLAY_PAGE = 150

function tcCategory(tc: string): TCFilter {
  const secs = tcToSeconds(tc)
  if (secs < 180) return 'bullet'
  if (secs < 600) return 'blitz'
  if (secs < 1800) return 'rapid'
  return 'classical'
}

function isChessComGame(g: ChessComGame | LichessGame): g is ChessComGame {
  return 'end_time' in g
}

function normalizeFromCache(record: AnalyzedGameRecord): NormalizedGame {
  return {
    pgn: record.rawPgn,
    opponent: record.opponent,
    opponentRating: record.opponentRating,
    userRating: record.userElo,
    result: record.result,
    timeControl: record.timeControl,
    date: formatTimestamp(record.endTime),
    isWhite: record.userColor === 'white',
    gameId: record.id,
    endTime: record.endTime,
    isCachedOnly: true,
  }
}

export default function GameSelector({ games, username, platform, onGameLoaded, pagination, onGamesAppended }: GameSelectorProps) {
  const setPgn = useGameStore(s => s.setPgn)
  const setRawPgn = useGameStore(s => s.setRawPgn)
  const setLoadedPgn = useGameStore(s => s.setLoadedPgn)
  const loadedPgn = useGameStore(s => s.loadedPgn)
  const setUserColor = useGameStore(s => s.setUserColor)
  const setUserElo = useGameStore(s => s.setUserElo)
  const setPlatform = useGameStore(s => s.setPlatform)
  const setMoveEvals = useGameStore(s => s.setMoveEvals)
  const setCriticalMoments = useGameStore(s => s.setCriticalMoments)
  const setCurrentGameId = useGameStore(s => s.setCurrentGameId)
  const setBackendGameId = useGameStore(s => s.setBackendGameId)
  const setCurrentGameMeta = useGameStore(s => s.setCurrentGameMeta)
  const setSkipNextAnalysis = useGameStore(s => s.setSkipNextAnalysis)
  const reset = useGameStore(s => s.reset)
  const listRef = useRef<HTMLDivElement>(null)

  // Ref for async load loop — JSX uses pagination prop directly
  const paginationRef = useRef(pagination)
  useEffect(() => { paginationRef.current = pagination }, [pagination])

  const [analyzedIds, setAnalyzedIds] = useState<Set<string>>(new Set())
  const [cachedOnlyGames, setCachedOnlyGames] = useState<NormalizedGame[]>([])
  const [loadingMore, setLoadingMore] = useState(false)
  const [isLoadingAll, setIsLoadingAll] = useState(false)
  const cancelLoadAllRef = useRef(false)

  // Auto-load tracking — fires once per username load when hasMore is true
  const hasAutoStarted = useRef(false)

  const [sortKey, setSortKey] = useState<SortKey>('date-desc')
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all')
  const [colorFilter, setColorFilter] = useState<ColorFilter>('all')
  const [tcFilter, setTCFilter] = useState<TCFilter>('all')
  const [displayLimit, setDisplayLimit] = useState(DISPLAY_PAGE)

  // Debounced opponent search — input updates immediately, filter waits 300ms
  const [opponentInput, setOpponentInput] = useState('')
  const [opponentSearch, setOpponentSearch] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setOpponentSearch(opponentInput), 300)
    return () => clearTimeout(t)
  }, [opponentInput])

  // Lichess opponent API search
  const [lichessOppResults, setLichessOppResults] = useState<NormalizedGame[] | null>(null)
  const [lichessOppLoading, setLichessOppLoading] = useState(false)
  const [lichessOppQuery, setLichessOppQuery] = useState('')

  // Reset everything on username change
  useEffect(() => {
    setSortKey('date-desc')
    setResultFilter('all')
    setColorFilter('all')
    setTCFilter('all')
    setOpponentInput('')
    setOpponentSearch('')
    setLichessOppResults(null)
    setLichessOppQuery('')
    setDisplayLimit(DISPLAY_PAGE)
    cancelLoadAllRef.current = true
    setIsLoadingAll(false)
    hasAutoStarted.current = false
  }, [username])

  // Reset displayLimit when filters/sort change
  useEffect(() => {
    setDisplayLimit(DISPLAY_PAGE)
  }, [resultFilter, colorFilter, tcFilter, opponentSearch, sortKey])

  // Clear Lichess opponent results when search is cleared
  useEffect(() => {
    if (!opponentInput.trim()) {
      setLichessOppResults(null)
      setLichessOppQuery('')
    }
  }, [opponentInput])

  // Load analyzed IDs + cached-only games
  useEffect(() => {
    let cancelled = false
    async function load() {
      const [ids, cached] = await Promise.all([
        getAnalyzedGameIds(username, platform),
        getCachedGamesForUser(username, platform),
      ])
      if (cancelled) return
      setAnalyzedIds(ids)
      const apiIds = new Set(games.map(g =>
        isChessComGame(g) ? getGameId(g, 'chesscom') : getGameId(g as LichessGame, 'lichess')
      ))
      const fallen = cached
        .filter(r => !apiIds.has(r.id))
        .map(normalizeFromCache)
        .sort((a, b) => b.endTime - a.endTime)
      setCachedOnlyGames(fallen)
    }
    load()
    return () => { cancelled = true }
  }, [games, username, platform])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0
  }, [username])

  const normalized = useMemo(() => games.map(g =>
    isChessComGame(g)
      ? normalizeChessCom(g, username)
      : normalizeLichess(g as LichessGame, username)
  ), [games, username])

  const allGames = useMemo(() => {
    if (cachedOnlyGames.length === 0) return normalized
    return [...normalized, ...cachedOnlyGames]
  }, [normalized, cachedOnlyGames])

  const displayedGames = useMemo(() => {
    const base = lichessOppResults ?? allGames
    let list = base
    if (resultFilter !== 'all') list = list.filter(g => g.result === resultFilter)
    if (colorFilter !== 'all') list = list.filter(g => (colorFilter === 'white') === g.isWhite)
    if (tcFilter !== 'all') list = list.filter(g => tcCategory(g.timeControl) === tcFilter)
    if (opponentSearch.trim() && !lichessOppResults) {
      const q = opponentSearch.trim().toLowerCase()
      list = list.filter(g => g.opponent.toLowerCase().includes(q))
    }
    const sorted = [...list]
    switch (sortKey) {
      case 'date-desc': sorted.sort((a, b) => b.endTime - a.endTime); break
      case 'date-asc':  sorted.sort((a, b) => a.endTime - b.endTime); break
      case 'opp-desc':  sorted.sort((a, b) => b.opponentRating - a.opponentRating); break
      case 'opp-asc':   sorted.sort((a, b) => a.opponentRating - b.opponentRating); break
      case 'user-desc': sorted.sort((a, b) => b.userRating - a.userRating); break
      case 'user-asc':  sorted.sort((a, b) => a.userRating - b.userRating); break
    }
    return sorted
  }, [allGames, lichessOppResults, resultFilter, colorFilter, tcFilter, opponentSearch, sortKey])

  const visibleGames = useMemo(
    () => displayedGames.slice(0, displayLimit),
    [displayedGames, displayLimit]
  )

  const moveEvalsLength = useGameStore(s => s.moveEvals.length)
  const isAnalyzing = useGameStore(s => s.isAnalyzing)
  useEffect(() => {
    if (moveEvalsLength > 0 && !isAnalyzing) {
      getAnalyzedGameIds(username, platform).then(setAnalyzedIds)
    }
  }, [moveEvalsLength, isAnalyzing, username, platform])

  const handleSelect = useCallback(async (g: NormalizedGame) => {
    reset()
    setCurrentGameId(g.gameId)
    setCurrentGameMeta({
      opponent: g.opponent,
      opponentRating: g.opponentRating,
      result: g.result,
      timeControl: g.timeControl,
      endTime: g.endTime,
    })
    setUserColor(g.isWhite ? 'white' : 'black')
    if (g.userRating && g.userRating > 0) setUserElo(g.userRating)
    setPlatform(platform)

    const cached = await getAnalyzedGame(g.gameId)
    if (cached) {
      setBackendGameId(cached.backendGameId ?? null)
      setSkipNextAnalysis(true)
      setRawPgn(cached.rawPgn)
      setLoadedPgn(cached.rawPgn)
      setPgn(cached.cleanedPgn)
      setMoveEvals(cached.moveEvals)
      setCriticalMoments(cached.criticalMoments)
      onGameLoaded()
      return
    }

    setRawPgn(g.pgn)
    setLoadedPgn(g.pgn)
    setPgn(cleanPgn(g.pgn))
    onGameLoaded()
  }, [reset, setCurrentGameId, setBackendGameId, setCurrentGameMeta, setSkipNextAnalysis, setUserColor, setUserElo, setPlatform, setRawPgn, setLoadedPgn, setPgn, setMoveEvals, setCriticalMoments, onGameLoaded, platform])

  // Uses paginationRef for async safety — JSX uses pagination prop for rendering
  const handleLoadMore = useCallback(async (): Promise<boolean> => {
    const pag = paginationRef.current
    if (!pag?.hasMore || loadingMore) return false
    setLoadingMore(true)
    try {
      if (platform === 'chesscom' && pag.fetchedArchives && pag.allArchives) {
        const result = await loadMoreGames(pag.allArchives, pag.fetchedArchives)
        onGamesAppended(result.games, {
          platform: 'chesscom',
          fetchedArchives: result.fetchedArchives,
          allArchives: result.allArchives,
          hasMore: result.hasMore,
        })
        return result.hasMore
      } else if (platform === 'lichess') {
        const oldest = normalized.length > 0
          ? Math.min(...normalized.map(g => g.endTime))
          : Date.now()
        const result = await loadMoreLichessGames(username, oldest, 100)
        onGamesAppended(result.games, { platform: 'lichess', hasMore: result.hasMore })
        return result.hasMore
      }
    } catch {
      // Silently fail
    } finally {
      setLoadingMore(false)
    }
    return false
  }, [loadingMore, platform, normalized, username, onGamesAppended])

  const handleLoadAll = useCallback(async () => {
    cancelLoadAllRef.current = false
    setIsLoadingAll(true)
    let stillMore = paginationRef.current?.hasMore ?? false
    while (stillMore && !cancelLoadAllRef.current) {
      stillMore = await handleLoadMore()
    }
    setIsLoadingAll(false)
  }, [handleLoadMore])

  // Auto-load all when a username is freshly loaded with hasMore=true
  useEffect(() => {
    if (!hasAutoStarted.current && pagination?.hasMore) {
      hasAutoStarted.current = true
      void handleLoadAll()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination?.hasMore])

  const handleLichessOppSearch = useCallback(async () => {
    const q = opponentInput.trim()
    if (!q || platform !== 'lichess') return
    setLichessOppLoading(true)
    setLichessOppQuery(q)
    try {
      const result = await searchGamesByOpponent(username, q, 200)
      const norm = result.games.map(g => normalizeLichess(g as LichessGame, username))
      setLichessOppResults(norm)
    } catch {
      setLichessOppResults([])
    } finally {
      setLichessOppLoading(false)
    }
  }, [opponentInput, platform, username])

  if (games.length === 0 && cachedOnlyGames.length === 0) {
    return <div className="game-list-empty">No games found.</div>
  }

  // Use pagination PROP for JSX rendering (triggers re-renders when prop changes)
  const hasMore = pagination?.hasMore ?? false
  const isFiltered = resultFilter !== 'all' || colorFilter !== 'all' || tcFilter !== 'all' || opponentSearch.trim() !== ''
  const remaining = hasMore && pagination && 'allArchives' in pagination && 'fetchedArchives' in pagination
    ? (pagination.allArchives?.length ?? 0) - (pagination.fetchedArchives?.length ?? 0)
    : null

  const oppInputTrimmed = opponentInput.trim()
  const showChessComHint = platform === 'chesscom' && hasMore && oppInputTrimmed && !lichessOppResults
  const showLichessOppBtn = platform === 'lichess' && oppInputTrimmed && !lichessOppResults
  const showLichessOppActive = lichessOppResults !== null

  return (
    <>
    <div className="game-list-controls">
    {/* Count + loading status at top */}
    <div className="game-list-header">
      <span className="game-list-count">
        {showLichessOppActive
          ? `${displayedGames.length} vs ${lichessOppQuery}`
          : isFiltered
            ? `${displayedGames.length} of ${allGames.length}`
            : `${allGames.length} game${allGames.length !== 1 ? 's' : ''}`
        }
        {isLoadingAll && remaining != null && remaining > 0 && (
          <span className="game-list-loading-status"> · loading…</span>
        )}
      </span>
      {isLoadingAll && (
        <button
          className="game-list__cancel-btn"
          onClick={() => { cancelLoadAllRef.current = true; setIsLoadingAll(false) }}
        >
          Cancel
        </button>
      )}
    </div>

    <div className="game-filter-bar">
      <div className="game-opponent-row">
        <input
          className="game-opponent-search"
          type="text"
          placeholder="vs opponent…"
          value={opponentInput}
          onChange={e => setOpponentInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && showLichessOppBtn) void handleLichessOppSearch() }}
          autoComplete="off"
        />
        {showLichessOppBtn && (
          <button
            className="game-filter-btn game-opponent-search-btn"
            onClick={() => void handleLichessOppSearch()}
            disabled={lichessOppLoading}
          >
            {lichessOppLoading ? '…' : 'Search all'}
          </button>
        )}
        {showLichessOppActive && (
          <button
            className="game-filter-btn game-opponent-clear-btn"
            onClick={() => { setLichessOppResults(null); setLichessOppQuery('') }}
          >
            ✕ Clear
          </button>
        )}
      </div>
      {showChessComHint && (
        <div className="game-opponent-hint">
          Searching loaded games only — loading all now…
        </div>
      )}
      <div className="game-filter-row">
        <div className="game-filter-group">
          {(['all', 'W', 'L', 'D'] as ResultFilter[]).map(v => (
            <button
              key={v}
              className={`game-filter-btn${resultFilter === v ? ' game-filter-btn--active' : ''}`}
              onClick={() => setResultFilter(v)}
            >
              {v === 'all' ? 'All' : v}
            </button>
          ))}
        </div>
        <div className="game-filter-group">
          {([['all', 'Both'], ['white', '⬜'], ['black', '⬛']] as [ColorFilter, string][]).map(([v, label]) => (
            <button
              key={v}
              className={`game-filter-btn${colorFilter === v ? ' game-filter-btn--active' : ''}`}
              onClick={() => setColorFilter(v)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="game-filter-group">
          {([['all', 'All'], ['bullet', 'Bullet'], ['blitz', 'Blitz'], ['rapid', 'Rapid'], ['classical', 'Classic']] as [TCFilter, string][]).map(([v, label]) => (
            <button
              key={v}
              className={`game-filter-btn${tcFilter === v ? ' game-filter-btn--active' : ''}`}
              onClick={() => setTCFilter(v)}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          className="game-sort-select"
          value={sortKey}
          onChange={e => setSortKey(e.target.value as SortKey)}
        >
          <option value="date-desc">Newest</option>
          <option value="date-asc">Oldest</option>
          <option value="opp-desc">Opp ↓</option>
          <option value="opp-asc">Opp ↑</option>
          <option value="user-desc">My rating ↓</option>
          <option value="user-asc">My rating ↑</option>
        </select>
      </div>
    </div>
    </div>{/* end game-list-controls */}

    <div className="game-list" ref={listRef}>
      {displayedGames.length === 0 && (
        <div className="game-list-empty">
          {showLichessOppActive ? `No Lichess games found vs "${lichessOppQuery}".` : 'No games match these filters.'}
        </div>
      )}
      {visibleGames.map((g) => (
        <button
          key={g.gameId}
          className={`game-row${g.pgn === loadedPgn ? ' game-row--loaded' : ''}${g.isCachedOnly ? ' game-row--cached' : ''}`}
          onClick={() => handleSelect(g)}
        >
          <span className="game-row__line1">
            <span className="game-row__players">
              {analyzedIds.has(g.gameId) && (
                <span className="game-row__analyzed-badge" title="Analysis cached">✓</span>
              )}
              <span className="game-row__color-dot" data-color={g.isWhite ? 'white' : 'black'} />
              <span className="game-row__username" title={username}>{username}</span>
              <span className="game-row__vs">vs</span>
              <span className="game-row__color-dot" data-color={g.isWhite ? 'black' : 'white'} />
              <span className="game-row__opponent" title={g.opponent}>{g.opponent}</span>
            </span>
            <span className={`game-row__result game-row__result--${g.result.toLowerCase()}`}>
              {g.result}
            </span>
          </span>
          <span className="game-row__line2">
            <span className="game-row__meta">{g.userRating} vs {g.opponentRating}</span>
            <span className="game-row__line2-sep">·</span>
            <span className="game-row__meta">{g.timeControl}</span>
            <span className="game-row__line2-sep">·</span>
            <span className="game-row__meta">{g.date}</span>
          </span>
        </button>
      ))}
      {displayLimit < displayedGames.length && (
        <button
          className="game-list__show-more"
          onClick={() => setDisplayLimit(d => d + DISPLAY_PAGE)}
        >
          Show more ({displayedGames.length - displayLimit} remaining)
        </button>
      )}
      {!showLichessOppActive && !hasMore && allGames.length >= 100 && displayLimit >= displayedGames.length && (
        <div className="game-list__all-loaded">All games loaded</div>
      )}
    </div>
    </>
  )
}
