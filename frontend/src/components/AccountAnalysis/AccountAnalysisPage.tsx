import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import { getRecentGames, loadMoreGames, type ChessComGame } from '../../api/chesscom'
import { getUserGames, type LichessGame } from '../../api/lichess'
import {
  buildAccountAnalysis,
  type AccountAnalysisEvidenceMoment,
  type AccountAnalysisPlatform,
  type AccountAnalysisSummary,
  type OpeningStats,
  type ScannedAccountGame,
} from '../../accountAnalysis/aggregate'
import { getMissingAnalysisGames, selectAnalysisBatch } from '../../accountAnalysis/queue'
import { cleanPgn } from '../../chess/pgn'
import { analyzeGame, type MoveEval } from '../../engine/analysis'
import { detectCriticalMoments } from '../../engine/criticalMoments'
import { StockfishEngine } from '../../engine/stockfish'
import { getAnalyzedGame, getCachedGamesForUser, saveAnalyzedGame, type AnalyzedGameRecord } from '../../services/gameDB'
import { getIdentity } from '../../services/identity'
import { pushGame } from '../../services/syncService'
import { useAuthStore } from '../../stores/authStore'
import { useGameStore } from '../../stores/gameStore'
import type { CriticalMoment } from '../../chess/types'

interface AccountAnalysisPageProps {
  onOpenReview?: () => void
  onOpenProfile?: () => void
}

interface LoadedAccountGames {
  chesscom: ChessComGame[]
  lichess: LichessGame[]
  analyzed: AnalyzedGameRecord[]
}

interface AnalysisQueueState {
  status: 'idle' | 'initializing' | 'running' | 'paused' | 'error'
  total: number
  completed: number
  currentGame: string | null
  currentMove: number
  totalMoves: number
  error: string | null
}

const GAME_COUNT_OPTIONS = [25, 50, 100, 150, 200]

function getAnalysisDepth(elo: number): number {
  if (!elo || elo < 1200) return 12
  if (elo < 1600) return 14
  return 16
}

function formatDateRange(summary: AccountAnalysisSummary): string {
  const { start, end } = summary.dateRange
  if (!start || !end) return 'No recent games scanned yet'

  const fmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  if (start === end) return fmt.format(new Date(end))
  return `${fmt.format(new Date(start))} - ${fmt.format(new Date(end))}`
}

function formatRecord(opening: OpeningStats): string {
  return `${opening.wins}-${opening.losses}-${opening.draws}`
}

function formatCoverage(confidence: AccountAnalysisSummary['weaknessConfidence']): string {
  switch (confidence) {
    case 'high': return 'Coverage complete'
    case 'medium': return 'Coverage in progress'
    case 'low': return 'Coverage started'
    default: return 'No engine-reviewed games yet'
  }
}

function openingSampleLabel(opening: OpeningStats): string {
  if (opening.games === 1) return '1 game'
  if (opening.games < 5) return `${opening.games} games - early signal`
  return `${opening.games} games - recurring`
}

function formatResult(result: 'W' | 'L' | 'D'): string {
  if (result === 'W') return 'Win'
  if (result === 'L') return 'Loss'
  return 'Draw'
}

function formatEvalSwing(cp: number): string {
  if (cp >= 100) return `${(cp / 100).toFixed(1)} pawn swing`
  return `${cp} cp swing`
}

async function fetchChessComGames(username: string, targetCount: number): Promise<ChessComGame[]> {
  let result = await getRecentGames(username)
  let games = result.games
  let guard = 0

  while (games.length < targetCount && result.hasMore && guard < 12) {
    result = await loadMoreGames(result.allArchives, result.fetchedArchives)
    games = [...games, ...result.games]
    guard++
  }

  const seen = new Set<string>()
  return games
    .filter(game => {
      if (seen.has(game.url)) return false
      seen.add(game.url)
      return true
    })
    .sort((a, b) => b.end_time - a.end_time)
}

async function loadAnalyzedGames(
  identity: ReturnType<typeof getIdentity>,
  platform: AccountAnalysisPlatform,
): Promise<AnalyzedGameRecord[]> {
  const all: AnalyzedGameRecord[] = []
  if (platform !== 'lichess' && identity.chesscom) {
    all.push(...await getCachedGamesForUser(identity.chesscom, 'chesscom'))
  }
  if (platform !== 'chesscom' && identity.lichess) {
    all.push(...await getCachedGamesForUser(identity.lichess, 'lichess'))
  }
  return all
}

function OpeningTable({ title, openings, expanded }: { title: string; openings: OpeningStats[]; expanded: boolean }) {
  const visible = expanded ? openings : openings.slice(0, 3)

  return (
    <section className="account-analysis-card">
      <div className="account-analysis-card__header">
        <h2>{title}</h2>
        <span>{openings.length} opening{openings.length === 1 ? '' : 's'}</span>
      </div>
      {visible.length > 0 ? (
        <div className="account-opening-list">
          {visible.map(opening => (
            <div className="account-opening-row" key={`${opening.color}:${opening.opening}`}>
              <div>
                <strong>{opening.opening}</strong>
                <span>{openingSampleLabel(opening)}</span>
              </div>
              <div className="account-opening-row__score">
                <strong>{opening.scorePct}%</strong>
                <span>{formatRecord(opening)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="account-analysis-empty-copy">No games as {title.toLowerCase()} in this sample.</p>
      )}
    </section>
  )
}

function upsertAnalyzedGame(records: AnalyzedGameRecord[], next: AnalyzedGameRecord): AnalyzedGameRecord[] {
  const without = records.filter(record => record.id !== next.id)
  return [next, ...without]
}

function getTotalMoves(pgn: string): number {
  try {
    const chess = new Chess()
    chess.loadPgn(cleanPgn(pgn))
    return chess.history().length
  } catch {
    return 0
  }
}

function buildAnalyzedRecord(
  game: ScannedAccountGame,
  username: string,
  moveEvals: MoveEval[],
  criticalMoments: CriticalMoment[],
  partial: boolean,
  existing?: AnalyzedGameRecord,
): AnalyzedGameRecord {
  return {
    id: game.gameId,
    username,
    platform: game.platform,
    rawPgn: game.pgn,
    cleanedPgn: cleanPgn(game.pgn),
    userColor: game.isWhite ? 'white' : 'black',
    userElo: game.userRating || existing?.userElo || 1200,
    moveEvals,
    criticalMoments,
    analyzedAt: Date.now(),
    opponent: game.opponent,
    opponentRating: game.opponentRating,
    result: game.result,
    timeControl: game.timeControl,
    endTime: game.endTime,
    backendGameId: existing?.backendGameId ?? null,
    partial,
    ...(existing?.branchState ? { branchState: existing.branchState } : {}),
  }
}

export default function AccountAnalysisPage({ onOpenReview, onOpenProfile }: AccountAnalysisPageProps) {
  const [platform, setPlatform] = useState<AccountAnalysisPlatform>('all')
  const [gameCount, setGameCount] = useState(50)
  const [loaded, setLoaded] = useState<LoadedAccountGames>({ chesscom: [], lichess: [], analyzed: [] })
  const [summary, setSummary] = useState<AccountAnalysisSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [identityVersion, setIdentityVersion] = useState(0)
  const [showAllOpenings, setShowAllOpenings] = useState(false)
  const [queueState, setQueueState] = useState<AnalysisQueueState>({
    status: 'idle',
    total: 0,
    completed: 0,
    currentGame: null,
    currentMove: 0,
    totalMoves: 0,
    error: null,
  })
  const queueEngineRef = useRef<StockfishEngine | null>(null)
  const queueEngineReadyRef = useRef<Promise<StockfishEngine> | null>(null)
  const queueAbortRef = useRef<AbortController | null>(null)
  const queueControlRef = useRef({ paused: false, cancelled: false })
  const queuePendingRef = useRef<ScannedAccountGame[]>([])

  const identity = getIdentity()
  const hasLinkedAccount = !!identity.chesscom || !!identity.lichess
  const canFetchPlatform =
    platform === 'all'
      ? hasLinkedAccount
      : platform === 'chesscom'
        ? !!identity.chesscom
        : !!identity.lichess

  const rebuildSummary = useCallback((nextLoaded: LoadedAccountGames, currentIdentity = getIdentity(), targetGameCount = gameCount) => buildAccountAnalysis({
    chesscomGames: nextLoaded.chesscom,
    chesscomUsername: currentIdentity.chesscom,
    lichessGames: nextLoaded.lichess,
    lichessUsername: currentIdentity.lichess,
    analyzedGames: nextLoaded.analyzed,
    gameCount: targetGameCount,
    platform,
  }), [gameCount, platform])

  const mergeCompletedAnalysis = useCallback((record: AnalyzedGameRecord) => {
    setLoaded(prev => {
      const nextLoaded = {
        ...prev,
        analyzed: upsertAnalyzedGame(prev.analyzed, record),
      }
      setSummary(rebuildSummary(nextLoaded))
      return nextLoaded
    })
  }, [rebuildSummary])

  const missingGames = useMemo(
    () => summary ? getMissingAnalysisGames(summary.scannedGames, loaded.analyzed) : [],
    [loaded.analyzed, summary],
  )

  const ensureQueueEngine = useCallback(async (): Promise<StockfishEngine> => {
    if (queueEngineRef.current) return queueEngineRef.current
    if (queueEngineReadyRef.current) return queueEngineReadyRef.current

    const engine = new StockfishEngine()
    const ready = engine.initialize({ hashMB: 16 }).then(() => {
      queueEngineRef.current = engine
      return engine
    })
    queueEngineReadyRef.current = ready
    return ready
  }, [])

  const analyzeQueuedGame = useCallback(async (
    game: ScannedAccountGame,
    engine: StockfishEngine,
  ): Promise<AnalyzedGameRecord | null> => {
    const existing = await getAnalyzedGame(game.gameId)
    if (existing && !existing.partial) return existing

    const username = game.platform === 'lichess'
      ? getIdentity().lichess ?? ''
      : getIdentity().chesscom ?? ''
    const color = game.isWhite ? 'white' : 'black'
    const totalMoves = getTotalMoves(game.pgn)
    const initialEvals = existing?.partial ? existing.moveEvals : []
    const startFromIndex = initialEvals.length
    const accumulated: MoveEval[] = [...initialEvals]
    const controller = new AbortController()
    queueAbortRef.current = controller

    setQueueState(prev => ({
      ...prev,
      currentGame: `${game.opening} vs ${game.opponent}`,
      currentMove: startFromIndex,
      totalMoves,
      error: null,
    }))

    const savePartial = (moments: CriticalMoment[] = []) => {
      const record = buildAnalyzedRecord(game, username, [...accumulated], moments, true, existing)
      void saveAnalyzedGame(record)
    }

    const results = await analyzeGame(
      game.pgn,
      engine,
      getAnalysisDepth(game.userRating),
      completed => {
        setQueueState(prev => ({ ...prev, currentMove: completed, totalMoves }))
      },
      controller.signal,
      undefined,
      moveEval => {
        accumulated.push(moveEval)
        if (accumulated.length >= 10) {
          savePartial(detectCriticalMoments([...accumulated], color, game.userRating))
        } else {
          savePartial()
        }
      },
      startFromIndex,
      initialEvals,
    )

    if (controller.signal.aborted || queueControlRef.current.paused || queueControlRef.current.cancelled) {
      savePartial(accumulated.length >= 10 ? detectCriticalMoments([...accumulated], color, game.userRating) : [])
      return null
    }

    const moments = detectCriticalMoments(results, color, game.userRating)
    const record = buildAnalyzedRecord(game, username, results, moments, false, existing)
    await saveAnalyzedGame(record)

    if (useAuthStore.getState().accessToken) {
      void pushGame(record).catch(() => {
        // Local IndexedDB is still the source of truth for this report if cloud sync fails.
      })
    }

    return record
  }, [])

  const runPendingQueue = useCallback(async (initialTotal?: number, initialCompleted?: number) => {
    if (queuePendingRef.current.length === 0) return
    queueControlRef.current.paused = false
    queueControlRef.current.cancelled = false

    setQueueState(prev => ({
      status: 'initializing',
      total: initialTotal ?? prev.total,
      completed: initialCompleted ?? prev.completed,
      currentGame: null,
      currentMove: 0,
      totalMoves: 0,
      error: null,
    }))

    let engine: StockfishEngine
    try {
      engine = await ensureQueueEngine()
    } catch (err) {
      setQueueState(prev => ({
        ...prev,
        status: 'error',
        error: err instanceof Error ? err.message : 'Could not start Stockfish for account analysis.',
      }))
      return
    }

    setQueueState(prev => ({ ...prev, status: 'running' }))

    while (queuePendingRef.current.length > 0) {
      if (queueControlRef.current.paused || queueControlRef.current.cancelled) break
      const game = queuePendingRef.current[0]

      try {
        const record = await analyzeQueuedGame(game, engine)
        if (record) {
          queuePendingRef.current = queuePendingRef.current.slice(1)
          mergeCompletedAnalysis(record)
          setQueueState(prev => ({
            ...prev,
            completed: prev.completed + 1,
            currentMove: 0,
            totalMoves: 0,
          }))
        } else if (queueControlRef.current.paused || queueControlRef.current.cancelled) {
          break
        } else {
          queuePendingRef.current = queuePendingRef.current.slice(1)
        }
      } catch (err) {
        if (queueControlRef.current.paused || queueControlRef.current.cancelled) break
        setQueueState(prev => ({
          ...prev,
          status: 'error',
          error: err instanceof Error ? err.message : 'Account analysis stopped on this game.',
        }))
        return
      }
    }

    if (queueControlRef.current.cancelled) {
      queuePendingRef.current = []
      setQueueState(prev => ({ ...prev, status: 'idle', currentGame: null, currentMove: 0, totalMoves: 0 }))
      return
    }
    if (queueControlRef.current.paused) {
      setQueueState(prev => ({ ...prev, status: 'paused' }))
      return
    }

    setQueueState(prev => ({
      ...prev,
      status: 'idle',
      currentGame: null,
      currentMove: 0,
      totalMoves: 0,
    }))
  }, [analyzeQueuedGame, ensureQueueEngine, mergeCompletedAnalysis])

  const queueSelectedGames = useCallback((nextSummary: AccountAnalysisSummary, nextLoaded: LoadedAccountGames, targetGameCount = gameCount) => {
    const targetComplete = Math.min(targetGameCount, nextSummary.scannedGames.length)
    const needed = Math.max(0, targetComplete - nextSummary.analyzedGameCount)
    if (needed === 0) return

    const batch = selectAnalysisBatch(nextSummary.scannedGames, nextLoaded.analyzed, needed)
    if (batch.length === 0) return
    queuePendingRef.current = batch
    void runPendingQueue(targetComplete, nextSummary.analyzedGameCount)
  }, [gameCount, runPendingQueue])

  const pauseAnalysisQueue = useCallback(() => {
    if (queueState.status !== 'running' && queueState.status !== 'initializing') return
    queueControlRef.current.paused = true
    queueAbortRef.current?.abort()
    queueEngineRef.current?.stop()
    setQueueState(prev => ({ ...prev, status: 'paused' }))
  }, [queueState.status])

  const resumeAnalysisQueue = useCallback(() => {
    if (queueState.status !== 'paused') return
    void runPendingQueue(queueState.total, queueState.completed)
  }, [queueState.completed, queueState.status, queueState.total, runPendingQueue])

  const cancelAnalysisQueue = useCallback(() => {
    queueControlRef.current.cancelled = true
    queueAbortRef.current?.abort()
    queueEngineRef.current?.stop()
    queuePendingRef.current = []
    setQueueState(prev => ({ ...prev, status: 'idle', currentGame: null, currentMove: 0, totalMoves: 0 }))
  }, [])

  const openEvidenceMoment = useCallback(async (moment: AccountAnalysisEvidenceMoment) => {
    const record = await getAnalyzedGame(moment.gameId)
    if (!record) {
      setError('Could not find that analyzed game in this browser. Re-run Insights to refresh the local cache.')
      return
    }

    const store = useGameStore.getState()
    store.reset()
    store.setCurrentGameId(record.id)
    store.setCurrentGameMeta({
      opponent: record.opponent,
      opponentRating: record.opponentRating,
      result: record.result,
      timeControl: record.timeControl,
      endTime: record.endTime,
    })
    store.setUserColor(record.userColor)
    if (record.userElo && record.userElo > 0) store.setUserElo(record.userElo)
    store.setPlatform(record.platform === 'chesscom' || record.platform === 'lichess' ? record.platform : null)
    store.setBackendGameId(record.backendGameId ?? null)
    store.setRawPgn(record.rawPgn)
    store.setLoadedPgn(record.rawPgn)
    store.setPgn(record.cleanedPgn || cleanPgn(record.rawPgn))
    store.setMoveEvals(record.moveEvals)
    if (record.partial) {
      store.setResumeFromIndex(record.moveEvals.length)
      store.setSkipNextAnalysis(false)
    } else {
      store.setCriticalMoments(record.criticalMoments)
      store.setResumeFromIndex(0)
      store.setSkipNextAnalysis(true)
    }
    store.bumpLoadRequestId()
    onOpenReview?.()
  }, [onOpenReview])

  const analyzeRecentGames = useCallback(async (targetGameCount = gameCount) => {
    const currentIdentity = getIdentity()
    setIdentityVersion(v => v + 1)
    if (!currentIdentity.chesscom && !currentIdentity.lichess) {
      setSummary(null)
      setLoaded({ chesscom: [], lichess: [], analyzed: [] })
      return
    }

    setLoading(true)
    setError(null)
    try {
      const [chesscom, lichess, analyzed] = await Promise.all([
        platform !== 'lichess' && currentIdentity.chesscom
          ? fetchChessComGames(currentIdentity.chesscom, targetGameCount)
          : Promise.resolve([]),
        platform !== 'chesscom' && currentIdentity.lichess
          ? getUserGames(currentIdentity.lichess, targetGameCount).then(result => result.games)
          : Promise.resolve([]),
        loadAnalyzedGames(currentIdentity, platform),
      ])

      const nextLoaded = { chesscom, lichess, analyzed }
      const nextSummary = rebuildSummary(nextLoaded, currentIdentity, targetGameCount)
      setLoaded(nextLoaded)
      setSummary(nextSummary)
      queueSelectedGames(nextSummary, nextLoaded, targetGameCount)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start Insights analysis right now.')
    } finally {
      setLoading(false)
    }
  }, [gameCount, platform, queueSelectedGames, rebuildSummary])

  useEffect(() => {
    setIdentityVersion(v => v + 1)
  }, [])

  useEffect(() => () => {
    queueControlRef.current.cancelled = true
    queueAbortRef.current?.abort()
    queueEngineRef.current?.terminate()
  }, [])

  void identityVersion
  const queueBusy = queueState.status === 'running' || queueState.status === 'initializing'
  const queueActive = queueBusy || queueState.status === 'paused'
  const selectedAnalysisTarget = summary ? Math.min(gameCount, summary.scannedGames.length) : gameCount
  const hasReliableSignal = !!summary && summary.analyzedGameCount >= Math.min(10, selectedAnalysisTarget)
  const canAnalyzeRemainingSelected = !!summary && missingGames.length > 0 && summary.analyzedGameCount < selectedAnalysisTarget && !queueActive
  const selectedAnalysisComplete = !!summary && selectedAnalysisTarget > 0 && summary.analyzedGameCount >= selectedAnalysisTarget
  const canOfferNextBatch = !!summary && selectedAnalysisComplete && gameCount === 25 && !queueActive
  const showQueue = queueState.status === 'running' ||
    queueState.status === 'initializing' ||
    queueState.status === 'paused' ||
    queueState.status === 'error'

  return (
    <div className="account-analysis-page">
      <section className="account-analysis-hero">
        <div>
          <p className="account-analysis-kicker">Insights</p>
          <h1>Analyze your recent games.</h1>
          <p>
            Choose how many recent games DeepMove should review. Analysis runs privately in this
            browser tab; larger batches take longer, and you can pause anytime.
          </p>
        </div>
        <div className="account-analysis-controls" aria-label="Account analysis controls">
          <label>
            Platform
            <select value={platform} onChange={event => setPlatform(event.target.value as AccountAnalysisPlatform)}>
              <option value="all">All linked</option>
              <option value="chesscom">Chess.com</option>
              <option value="lichess">Lichess</option>
            </select>
          </label>
          <label>
            Games to analyze
            <select value={gameCount} onChange={event => setGameCount(Number(event.target.value))}>
              {GAME_COUNT_OPTIONS.map(option => (
                <option value={option} key={option}>{option}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void analyzeRecentGames()}
            disabled={loading || !canFetchPlatform || queueActive}
          >
            {loading ? 'Loading games...' : queueState.status === 'paused' ? 'Paused' : queueBusy ? 'Analyzing...' : `Analyze ${gameCount} games`}
          </button>
          <p className="account-analysis-controls__note">
            {gameCount} games can take several minutes. Cached games are reused automatically.
          </p>
        </div>
      </section>

      {!hasLinkedAccount && (
        <section className="account-analysis-empty">
          <h2>Link a chess account to start.</h2>
          <p>Add your Chess.com or Lichess username, then DeepMove can scan recent games for openings and recurring review patterns.</p>
          <div className="account-analysis-empty__actions">
            {onOpenReview && <button type="button" className="btn btn-primary" onClick={onOpenReview}>Load games</button>}
            {onOpenProfile && <button type="button" className="btn btn-secondary" onClick={onOpenProfile}>Open profile</button>}
          </div>
        </section>
      )}

      {hasLinkedAccount && !canFetchPlatform && (
        <section className="account-analysis-empty">
          <h2>No linked account for this platform.</h2>
          <p>Choose another platform or link this account type from Profile.</p>
          {onOpenProfile && <button type="button" className="btn btn-primary" onClick={onOpenProfile}>Open profile</button>}
        </section>
      )}

      {error && (
        <div className="account-analysis-error" role="alert">
          {error}
        </div>
      )}

      {summary && (
        <>
          <section className={`account-analysis-coverage account-analysis-coverage--${summary.weaknessConfidence}`}>
            <div>
              <span>{hasReliableSignal ? formatCoverage(summary.weaknessConfidence) : 'Building signal'}</span>
              <strong>{summary.analyzedGameCount} / {selectedAnalysisTarget} selected games analyzed</strong>
              <p>
                Using the latest {summary.scannedGames.length} games from {formatDateRange(summary)}.
                {' '}This is a recent sample, not your all-time account total.
              </p>
              <div className="account-analysis-meter" aria-hidden="true">
                <div style={{ width: `${selectedAnalysisTarget > 0 ? Math.min(100, (summary.analyzedGameCount / selectedAnalysisTarget) * 100) : 0}%` }} />
              </div>
            </div>
            {canAnalyzeRemainingSelected && (
              <div className="account-analysis-queue-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => queueSelectedGames(summary, loaded)}
                >
                  Analyze remaining selected games
                </button>
              </div>
            )}
          </section>

          {showQueue && (
            <section className="account-analysis-queue">
              <div>
                <span>Analysis progress</span>
                <strong>
                  {queueState.status === 'initializing'
                    ? 'Starting Stockfish...'
                    : queueState.status === 'paused'
                      ? `Paused at ${queueState.completed} of ${queueState.total}`
                      : queueState.status === 'error'
                        ? 'Needs attention'
                        : queueState.status === 'running'
                          ? `Analyzing ${queueState.completed + 1} of ${queueState.total}`
                          : `Analyzed ${queueState.completed} game${queueState.completed === 1 ? '' : 's'}`}
                </strong>
                {queueState.currentGame && <p>{queueState.currentGame}</p>}
                {queueState.status === 'running' && queueState.totalMoves > 0 && (
                  <small>Move {queueState.currentMove} / {queueState.totalMoves}</small>
                )}
                <p>Analysis runs privately in this browser tab. Larger batches take longer, and you can pause anytime.</p>
                {queueState.status === 'running' && (
                  <small>Stockfish may use noticeable CPU while analysis is active.</small>
                )}
                {queueState.error && <p className="account-analysis-queue__error">{queueState.error}</p>}
              </div>
              <div className="account-analysis-queue-actions">
                {queueState.status === 'running' || queueState.status === 'initializing' ? (
                  <button type="button" className="btn btn-secondary" onClick={pauseAnalysisQueue}>Pause</button>
                ) : null}
                {queueState.status === 'paused' ? (
                  <button type="button" className="btn btn-primary" onClick={resumeAnalysisQueue}>Resume</button>
                ) : null}
                {queueState.status === 'running' || queueState.status === 'initializing' || queueState.status === 'paused' ? (
                  <button type="button" className="btn btn-secondary" onClick={cancelAnalysisQueue}>Cancel</button>
                ) : null}
              </div>
            </section>
          )}

          <section className="account-analysis-section-heading">
            <span>Coach Brief</span>
            <h2>{hasReliableSignal ? 'The one pattern to review first' : 'DeepMove is still building enough signal'}</h2>
          </section>

          <section className={`account-coach-brief account-coach-brief--${summary.coachBrief.kind}`}>
            <div className="account-coach-brief__header">
              <div>
                <span>{summary.coachBrief.confidenceLabel}</span>
                <h3>{summary.coachBrief.title}</h3>
              </div>
              {summary.coachBrief.primaryCategory && (
                <em>{summary.coachBrief.primaryCategory === 'unknown' ? 'Uncategorized' : 'Engine-reviewed theme'}</em>
              )}
            </div>
            <div className="account-coach-brief__grid">
              <div>
                <span>Finding</span>
                <p>{summary.coachBrief.finding}</p>
              </div>
              <div>
                <span>Evidence</span>
                <p>{summary.coachBrief.evidence}</p>
              </div>
              <div>
                <span>Why this matters</span>
                <p>{summary.coachBrief.whyItMatters}</p>
              </div>
              <div>
                <span>Next review action</span>
                <p>{summary.coachBrief.nextAction}</p>
              </div>
            </div>

            {summary.coachBrief.exampleMoments.length > 0 && (
              <div className="account-evidence-moments">
                <div className="account-evidence-moments__title">
                  <strong>Review these moments</strong>
                  <span>Open the game, then jump to the move number shown in the move list.</span>
                </div>
                {summary.coachBrief.exampleMoments.map(moment => (
                  <div className="account-evidence-row" key={`${moment.gameId}:${moment.moveNumber}:${moment.movePlayed}`}>
                    <div>
                      <strong>Move {moment.moveNumber}: {moment.movePlayed}</strong>
                      <span>
                        {formatResult(moment.result)} vs {moment.opponent} - {moment.opening} - {formatEvalSwing(moment.evalSwing)}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => void openEvidenceMoment(moment)}
                    >
                      Open in Review
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="account-coach-brief__actions">
              {summary.coachBrief.exampleMoments[0] && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void openEvidenceMoment(summary.coachBrief.exampleMoments[0])}
                >
                  Review first evidence game
                </button>
              )}
              {canAnalyzeRemainingSelected && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => queueSelectedGames(summary, loaded)}
                >
                  Analyze remaining selected games
                </button>
              )}
              {canOfferNextBatch && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setGameCount(50)
                    void analyzeRecentGames(50)
                  }}
                >
                  Analyze 50 games next
                </button>
              )}
            </div>
          </section>

          <section className="account-analysis-section-heading">
            <span>Opening Results</span>
            <h2>Game results by opening, separate from engine-reviewed mistake themes</h2>
          </section>

          <div className="account-analysis-grid">
            <OpeningTable title="Your games as White" openings={summary.openingsByColor.white} expanded={showAllOpenings} />
            <OpeningTable title="Your games as Black" openings={summary.openingsByColor.black} expanded={showAllOpenings} />
          </div>

          {(summary.openingsByColor.white.length > 3 || summary.openingsByColor.black.length > 3) && (
            <button
              type="button"
              className="btn btn-secondary account-analysis-show-more"
              onClick={() => setShowAllOpenings(v => !v)}
            >
              {showAllOpenings ? 'Show fewer openings' : 'Show all openings'}
            </button>
          )}

          <details className="account-analysis-card account-pattern-evidence">
            <summary>
              <span>Pattern Evidence</span>
              <em>{summary.weaknesses.reduce((sum, weakness) => sum + weakness.count, 0)} critical moments across {summary.analyzedGameCount} analyzed game{summary.analyzedGameCount === 1 ? '' : 's'}</em>
            </summary>
            {summary.weaknesses.length > 0 ? (
              <div className="account-weakness-list">
                {summary.weaknesses.slice(0, 5).map(weakness => (
                  <div className="account-weakness-row" key={weakness.category}>
                    <span className="account-weakness-dot" style={{ background: weakness.color }} />
                    <div>
                      <strong>{weakness.category === 'unknown' ? 'General / uncategorized' : weakness.name}</strong>
                      <span>{weakness.category === 'unknown' ? 'Classifier uncertainty, not a coach theme' : weakness.shortLabel}</span>
                    </div>
                    <em>{weakness.count}</em>
                  </div>
                ))}
              </div>
            ) : (
              <p className="account-analysis-empty-copy">
                No recurring weakness categories yet. Review a few games in DeepMove and this section will become more specific.
              </p>
            )}
          </details>

        </>
      )}
    </div>
  )
}
