import { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import { loadMoreGames, type ChessComGame } from '../../api/chesscom'
import { loadMoreLichessGames, type LichessGame } from '../../api/lichess'
import type { PaginationState } from './AccountLink'
import { useGameStore } from '../../stores/gameStore'
import { cleanPgn } from '../../chess/pgn'
import { getMyUsername } from '../../services/identity'
import {
  getGameId,
  getAnalyzedGame,
  getAnalyzedGameIds,
  getCachedGamesForUser,
  type AnalyzedGameRecord,
} from '../../services/gameDB'

interface GameSelectorProps {
  games: ChessComGame[] | LichessGame[]
  username: string
  platform: 'chesscom' | 'lichess'
  onGameLoaded: () => void
  pagination: PaginationState | null
  onGamesAppended: (games: ChessComGame[] | LichessGame[], pagination: PaginationState) => void
}

import { normalizeChessCom, normalizeLichess, type NormalizedGame } from './normalizeGame'

function formatTimestamp(ms: number): string {
  const d = new Date(ms)
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).replace(',', '')
  return `${date} - ${time}`
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

  const [analyzedIds, setAnalyzedIds] = useState<Set<string>>(new Set())
  const [cachedOnlyGames, setCachedOnlyGames] = useState<NormalizedGame[]>([])
  const [loadingMore, setLoadingMore] = useState(false)

  // Load analyzed IDs + cached-only games on mount and when games/username change
  useEffect(() => {
    let cancelled = false
    async function load() {
      const [ids, cached] = await Promise.all([
        getAnalyzedGameIds(username, platform),
        getCachedGamesForUser(username, platform),
      ])
      if (cancelled) return
      setAnalyzedIds(ids)

      // Find cached games that aren't in the current API results
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

  // Merge API games + cached-only games (fallen off API window)
  const allGames = useMemo(() => {
    if (cachedOnlyGames.length === 0) return normalized
    return [...normalized, ...cachedOnlyGames]
  }, [normalized, cachedOnlyGames])

  // Refresh analyzedIds after an analysis completes (listen to moveEvals changes)
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
    const myUser = getMyUsername(platform); const browsingOther = myUser && myUser !== username.toLowerCase(); setUserColor(browsingOther ? null : (g.isWhite ? 'white' : 'black'))
    if (g.userRating && g.userRating > 0) setUserElo(g.userRating)
    setPlatform(platform)

    // Check IndexedDB for cached analysis
    const cached = await getAnalyzedGame(g.gameId)
    if (cached) {
      // Load instantly from cache — no re-analysis needed
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

    // Not cached — proceed normally (triggers Stockfish analysis)
    setRawPgn(g.pgn)
    setLoadedPgn(g.pgn)
    setPgn(cleanPgn(g.pgn))
    onGameLoaded()
  }, [reset, setCurrentGameId, setBackendGameId, setCurrentGameMeta, setSkipNextAnalysis, setUserColor, setUserElo, setPlatform, setRawPgn, setLoadedPgn, setPgn, setMoveEvals, setCriticalMoments, onGameLoaded, platform])

  const handleLoadMore = useCallback(async () => {
    if (!pagination?.hasMore || loadingMore) return
    setLoadingMore(true)
    try {
      if (platform === 'chesscom' && pagination.fetchedArchives && pagination.allArchives) {
        const result = await loadMoreGames(pagination.allArchives, pagination.fetchedArchives)
        onGamesAppended(result.games, {
          platform: 'chesscom',
          fetchedArchives: result.fetchedArchives,
          allArchives: result.allArchives,
          hasMore: result.hasMore,
        })
      } else if (platform === 'lichess') {
        // Find oldest game timestamp for pagination
        const oldest = normalized.length > 0
          ? Math.min(...normalized.map(g => g.endTime))
          : Date.now()
        const result = await loadMoreLichessGames(username, oldest, 100)
        onGamesAppended(result.games, { platform: 'lichess', hasMore: result.hasMore })
      }
    } catch {
      // Silently fail — user can retry
    } finally {
      setLoadingMore(false)
    }
  }, [pagination, loadingMore, platform, normalized, username, onGamesAppended])

  if (games.length === 0 && cachedOnlyGames.length === 0) {
    return <div className="game-list-empty">No games found.</div>
  }

  const hasMore = pagination?.hasMore ?? false

  return (
    <>
    <div className="game-list-count">
      {allGames.length} game{allGames.length !== 1 ? 's' : ''}
      {hasMore && ' (most recent)'}
    </div>
    <div className="game-list" ref={listRef}>
      {allGames.map((g) => (
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
      {hasMore && (
        <button
          className="game-list__load-more"
          onClick={handleLoadMore}
          disabled={loadingMore}
        >
          {loadingMore ? 'Loading…' : 'Load more games'}
        </button>
      )}
      {!hasMore && allGames.length >= 100 && (
        <div className="game-list__all-loaded">All games loaded</div>
      )}
    </div>
    </>
  )
}
