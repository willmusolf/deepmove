import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
} from 'react'
import ChessBoard from './components/Board/ChessBoard'
import type { DrawShape } from './components/Board/ChessBoard'
import EvalBar from './components/Board/EvalBar'
import { useIsPhone } from './components/Board/MoveRail'
import EvalGraph from './components/Board/EvalGraph'
import GameReport from './components/Board/GameReport'
import MoveList from './components/Board/MoveList'
import PlayerInfoBox from './components/Board/PlayerInfoBox'
import ImportPanel from './components/Import/ImportPanel'
import AccountLink from './components/Import/AccountLink'
import type { PaginationState } from './components/Import/AccountLink'
import GameSelector from './components/Import/GameSelector'
import type { ChessComGame } from './api/chesscom'
import type { LichessGame } from './api/lichess'
import type { Page } from './components/Layout/NavSidebar'
import ResponsiveLayout from './components/Layout/ResponsiveLayout'
import ProfilePage from './components/Profile/ProfilePage'
import MoveCoachComment from './components/Coach/MoveCoachComment'
import { getGradeBadgeMeta, renderGradeBadgeGlyph } from './components/Board/gradeBadges'
import BotPlayPage from './components/Play/BotPlayPage'
import ErrorBoundary from './components/ErrorBoundary'
import AboutPage from './components/AboutPage'
import PrivacyPage from './components/PrivacyPage'
import ResetPasswordPage from './components/Auth/ResetPasswordPage'
import AdBanner from './components/AdBanner'
import MobileAdBanner from './components/MobileAdBanner'
import { useGameReview } from './hooks/useGameReview'
import { useAnalysisBoard } from './hooks/useAnalysisBoard'
import BestLines from './components/Board/BestLines'
import { useCoaching } from './hooks/useCoaching'
import { useStockfish } from './hooks/useStockfish'
import { useSound } from './hooks/useSound'
import { useAuthStore } from './stores/authStore'
import { useGameStore } from './stores/gameStore'
import { clearPlaySession } from './stores/playStore'
import type { TopLine } from './engine/stockfish'
import { classifyMove, isSacrificeFn } from './engine/analysis'
import type { MoveGrade } from './engine/analysis'
import type { Key } from 'chessground/types'
import { cacheRatingsFromGameList, readCachedRatings } from './components/Import/normalizeGame'
import { formatEval } from './utils/format'
import { pruneReviewPendingNodes, shouldTrackReviewPendingNode } from './utils/reviewPending'
import { readSessionJson, writeSessionJson } from './utils/sessionStorage'
import { Chess } from 'chess.js'
import { getSquareOverlayPosition } from './chess/boardGeometry'
import './styles/board.css'
import './styles/badge-overrides.css'
import { detectOpening } from './chess/openings'
import {
  AD_CONFIG,
  ACTIVE_SPONSOR,
  desktopRailAdEnabled,
  mobileBannerAdEnabled,
  MOBILE_BANNER_PAGE_SET,
  RAIL_AD_PAGE_SET,
} from './config/sponsor'
import { SUPPORT_GITHUB_ISSUES_URL } from './config/contact'
import { getPageFromPathname, getPageMeta, getPathForPage, isIndexablePage } from './utils/pageMeta'

// Lichess-style thickness brushes — all green, varying weight
const LINE_BRUSHES = ['bestMove', 'goodMove', 'okMove'] as const
// Max depth for per-position multi-PV analysis. Analysis runs continuously to this
// depth and caches partial results at each depth — so interrupting and returning
// resumes visually from the last reached depth.
const POSITION_MAX_DEPTH = 27
const UTILITY_RAIL_MEDIA_QUERY = '(min-width: 1330px)'

type PanelTab = "analysis" | "load" | "coach"

// Set VITE_COACHING_ENABLED=true in Vercel env vars to enable coaching in production
const COACHING_ENABLED = import.meta.env.VITE_COACHING_ENABLED === 'true'
type ImportTab = "chesscom" | "lichess" | "pgn"

const APP_UI_SESSION_KEY = 'deepmove_appUi'

interface AppUiState {
  currentPage: Page
  panelTab: PanelTab
  importTab: ImportTab
  orientation: 'white' | 'black'
  showEvalBar: boolean
  showArrows: boolean
  showGrades: boolean
}

const TOUCH_NAV_REPEAT_DELAY_MS = 220
const TOUCH_NAV_REPEAT_INTERVAL_MS = 110

function renderBoundaryFallback(title: string, message: string) {
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '14rem',
        gap: '0.75rem',
        padding: '1.5rem',
        textAlign: 'center',
        color: '#d9dde8',
      }}
    >
      <strong>{title}</strong>
      <span>{message}</span>
      <button className="btn btn-secondary" onClick={() => window.location.reload()}>
        Reload
      </button>
    </div>
  )
}

function useTouchHoldNavigate(
  onStep: () => void,
  disabled: boolean,
) {
  const onStepRef = useRef(onStep)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const suppressClickRef = useRef(false)

  onStepRef.current = onStep

  const clearRepeat = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    window.removeEventListener('touchend', clearRepeat)
    window.removeEventListener('touchcancel', clearRepeat)
  }, [])

  useEffect(() => clearRepeat, [clearRepeat])

  const handleTouchStart = useCallback((e: ReactTouchEvent<HTMLButtonElement>) => {
    if (disabled) return
    e.preventDefault()
    suppressClickRef.current = true
    clearRepeat()
    onStepRef.current()
    window.addEventListener('touchend', clearRepeat)
    window.addEventListener('touchcancel', clearRepeat)
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        onStepRef.current()
      }, TOUCH_NAV_REPEAT_INTERVAL_MS)
    }, TOUCH_NAV_REPEAT_DELAY_MS)
  }, [clearRepeat, disabled])

  const handleTouchEnd = useCallback(() => {
    clearRepeat()
  }, [clearRepeat])

  const handleTouchMove = useCallback((e: ReactTouchEvent<HTMLButtonElement>) => {
    if (disabled) return
    e.preventDefault()
  }, [disabled])

  const handleClick = useCallback((e: ReactMouseEvent<HTMLButtonElement>) => {
    if (disabled) {
      e.preventDefault()
      return
    }
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      e.preventDefault()
      return
    }
    onStep()
  }, [disabled, onStep])

  return {
    onClick: handleClick,
    onTouchStart: handleTouchStart,
    onTouchEnd: handleTouchEnd,
    onTouchCancel: handleTouchEnd,
    onTouchMove: handleTouchMove,
  }
}

function isPanelTab(value: unknown): value is PanelTab {
  return value === 'analysis' || value === 'load' || value === 'coach'
}

function isImportTab(value: unknown): value is ImportTab {
  return value === 'chesscom' || value === 'lichess' || value === 'pgn'
}

function isPage(value: unknown): value is Page {
  return value === 'review'
    || value === 'practice'
    || value === 'play'
    || value === 'dashboard'
    || value === 'settings'
    || value === 'about'
    || value === 'privacy'
    || value === 'reset-password'
}

function loadAppUiState(): AppUiState | null {
  const parsed = readSessionJson<Partial<AppUiState>>(APP_UI_SESSION_KEY)
  if (parsed && typeof parsed === 'object') {
    return {
      currentPage: isPage(parsed.currentPage) ? parsed.currentPage : 'review',
      panelTab: isPanelTab(parsed.panelTab) ? parsed.panelTab : 'load',
      importTab: isImportTab(parsed.importTab) ? parsed.importTab : 'chesscom',
      orientation: parsed.orientation === 'black' ? 'black' : 'white',
      showEvalBar: parsed.showEvalBar !== false,
      showArrows: parsed.showArrows !== false,
      showGrades: parsed.showGrades !== false,
    }
  }

  const legacyPage = typeof window !== 'undefined'
    ? window.sessionStorage.getItem('deepmove_currentPage')
    : null
  return legacyPage && isPage(legacyPage)
    ? {
        currentPage: legacyPage,
        panelTab: 'load',
        importTab: 'chesscom',
        orientation: 'white',
        showEvalBar: true,
        showArrows: true,
        showGrades: true,
      }
    : null
}

export default function App() {
  const savedUiState = useMemo(() => loadAppUiState(), [])
  const routePage = useMemo(() => (
    typeof window !== 'undefined' ? getPageFromPathname(window.location.pathname) : null
  ), [])
  const savedReviewColor = useMemo(() => useGameStore.getState().userColor, [])
  const {
    currentFen,
    moves,
    moveTree,
    rootId,
    currentPath,
    currentMoveIndex,
    pathDepth,
    displayTotalDepth,
    goToMove,
    goForward,
    goBack,
    addVariationMove,
    lastAddedNodeIdRef,
    nextMainLineNode,
    navigateTo,
    rootBranchIds,
    isLoaded,
    whitePlayer,
    blackPlayer,
    whiteElo,
    blackElo,
    totalMoves,
    parseError,
    result: gameResult,
  } = useGameReview()

  const {
    tree: analysisTree,
    rootId: analysisRootId,
    currentPath: analysisPath,
    rootBranchIds: analysisRootBranchIds,
    currentFen: analysisFen,
    mainLineSans: analysisMainLineSans,
    addMove: analysisBoardAddMove,
    goBack: analysisBoardGoBack,
    goForward: analysisBoardGoForward,
    navigateTo: analysisBoardNavigateTo,
    resetBoard: analysisBoardReset,
    lastAddedNodeIdRef: analysisLastAddedNodeIdRef,
    startFen: analysisBoardStartFen,
  } = useAnalysisBoard()

  const reset = useGameStore(s => s.reset)
  const setPgn = useGameStore(s => s.setPgn)
  const setStoredUserColor = useGameStore(s => s.setUserColor)
  const moveEvals = useGameStore(s => s.moveEvals)
  const analyzedCount = useGameStore(s => s.analyzedCount)
  const isAnalyzing = useGameStore(s => s.isAnalyzing)
  const totalMovesCount = useGameStore(s => s.totalMovesCount)
  const pgn = useGameStore(s => s.pgn)
  const currentPositionLines = useGameStore(s => s.currentPositionLines)
  const isAnalyzingPosition = useGameStore(s => s.isAnalyzingPosition)
  const setCurrentPositionLines = useGameStore(s => s.setCurrentPositionLines)
  const setAnalyzingPosition = useGameStore(s => s.setAnalyzingPosition)
  const userColor = useGameStore(s => s.userColor)
  const criticalMoments = useGameStore(s => s.criticalMoments)
  const platform = useGameStore(s => s.platform)
  const userElo = useGameStore(s => s.userElo)
  const setUserElo = useGameStore(s => s.setUserElo)
  const currentGameMeta = useGameStore(s => s.currentGameMeta)
  const currentGameId = useGameStore(s => s.currentGameId)
  const backendGameId = useGameStore(s => s.backendGameId)
  const [panelTab, setPanelTab] = useState<PanelTab>(savedUiState?.panelTab ?? 'load')
  const [importTab, setImportTab] = useState<ImportTab>(savedUiState?.importTab ?? 'chesscom')

  const {
    isReady,
    engineStatus,
    runAnalysis,
    cancelGameAnalysis,
    analyzePositionLines,
    analyzePositionSingleBranch,
    stopPositionAnalysis,
    stopBranchAnalysis,
  } = useStockfish()
  const { enabled: soundEnabled, toggle: toggleSound, playMoveSound } = useSound()

  const {
    lessons: coachLessons,
    moveComments: coachMoveComments,
  } = useCoaching({
    enabled: COACHING_ENABLED && panelTab === 'coach' && isLoaded,
    criticalMoments,
    moveEvals,
    pgn: pgn ?? '',
    userElo,
    timeControl: currentGameMeta?.timeControl ?? '600',
    backendGameId: backendGameId ?? undefined,
    platformGameId: currentGameId ?? undefined,
    platform: platform ?? undefined,
  })

  // Silent auth refresh on app load — non-blocking, app works without it
  const authRefresh = useAuthStore(s => s.refresh)
  const reloadUser = useAuthStore(s => s.reloadUser)
  const authUser = useAuthStore(s => s.user)
  const isPremium = useAuthStore(s => s.isPremium)
  useEffect(() => {
    void authRefresh()
  }, [authRefresh])

  // After an account-link redirect, reload user to get updated oauth flags
  useEffect(() => {
    const linkSuccess = sessionStorage.getItem('dm_link_success')
    if (linkSuccess) {
      sessionStorage.removeItem('dm_link_success')
      void reloadUser()
    }
  }, [reloadUser])

  // After Stripe checkout success, reload user so is_premium reflects immediately
  const [paymentSuccessMsg, setPaymentSuccessMsg] = useState('')
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('payment') === 'success') {
      window.history.replaceState({}, '', window.location.pathname)
      void reloadUser()
      setPaymentSuccessMsg('You\'re now on Premium!')
      setTimeout(() => setPaymentSuccessMsg(''), 5000)
    }
  }, [reloadUser])

  // Sync DB usernames → localStorage so AccountLink restores games on mount
  // after login (both OAuth and silent refresh), without requiring the user
  // to visit Settings first.
  useEffect(() => {
    if (!authUser) return
    const LICHESS_KEY = 'deepmove_lichess_username'
    const CHESSCOM_KEY = 'deepmove_chesscom_username'
    if (authUser.lichess_username && !localStorage.getItem(LICHESS_KEY)) {
      localStorage.setItem(LICHESS_KEY, authUser.lichess_username)
    }
    if (authUser.chesscom_username && !localStorage.getItem(CHESSCOM_KEY)) {
      localStorage.setItem(CHESSCOM_KEY, authUser.chesscom_username)
    }
  }, [authUser?.id])  // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize userElo from cached detected ratings (instant — cached at import time, no analysis needed)
  useEffect(() => {
    const ratings = readCachedRatings()
    if (ratings) {
      const mode = ratings.primaryMode
      const elo = mode ? ratings[mode] : null
      if (elo) setUserElo(elo)
    }
  }, [setUserElo])

  const [currentAnalysisDepth, setCurrentAnalysisDepth] = useState(0)
  const [branchGrades, setBranchGrades] = useState<Map<string, MoveGrade>>(new Map())
  // Tracks which game the current branchGrades belong to — used by the write effect so it
  // always writes to the correct sessionStorage key even if currentGameId changes async.
  const branchGradesKeyRef = useRef<string | null>(useGameStore.getState().currentGameId)
  // Tracks the node ID of the most recently computed branch grade. Avoids reading a
  // stale analysisPath[last] in the board badge when the user moves faster than the eval.
  const lastGradedNodeIdRef = useRef<string | null>(null)
  const [pendingBranchNodes, setPendingBranchNodes] = useState<Set<string>>(new Set())
  // Tracks nodes with an eval already dispatched — prevents duplicate Stockfish calls
  // when nav handlers eagerly add to pendingBranchNodes before the safety-net effect fires.
  const evalInFlightRef = useRef<Set<string>>(new Set())
  // FEN → TopLine[] cache so revisiting a position never re-analyzes
  const positionCache = useRef<Map<string, TopLine[]>>(new Map())
  const pathKeyRef = useRef(0)
  // Keyed on (from+to+newFen) so the guard is immune to timing — if chessground
  // double-fires `after` for the same move (a known chessground quirk), the second
  // call carries the identical triple and gets blocked regardless of when it arrives.
  const lastSandboxMoveRef = useRef<string | null>(null)
  // Hold last valid eval so the bar never receives undefined (prevents 50/50 flash)
  const lastEvalRef = useRef({ cp: 0, isMate: false, mateIn: null as number | null })

  // Trigger full-game analysis whenever a new game loads and the engine is ready
  const setSkipNextAnalysis = useGameStore(s => s.setSkipNextAnalysis)
  useEffect(() => {
    if (pgn && isReady) {
      // Always clear the position cache when a new game loads — even for cached
      // games where skipNextAnalysis is true — so stale per-position multi-PV
      // results from the previous game never bleed into the new one.
      positionCache.current.clear()
      // Restore branch grades from session if this is the same game (refresh),
      // otherwise clear for a new game load.
      const bgGameId = useGameStore.getState().currentGameId
      branchGradesKeyRef.current = bgGameId  // capture so write effect uses the right key
      const storedBg = bgGameId
        ? readSessionJson<Record<string, string>>(`deepmove_bg_${bgGameId}`)
        : null
      lastGradedNodeIdRef.current = null
      setBranchGrades(
        storedBg && Object.keys(storedBg).length > 0
          ? new Map(Object.entries(storedBg) as [string, MoveGrade][])
          : new Map()
      )
      setPendingBranchNodes(new Set())
      lastEvalRef.current = { cp: 0, isMate: false, mateIn: null }
      if (useGameStore.getState().skipNextAnalysis) {
        setSkipNextAnalysis(false)
        return
      }
      const t = setTimeout(() => { void runAnalysis(pgn) }, 0)
      return () => clearTimeout(t)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pgn, isReady])

  const displayFen = isLoaded ? currentFen : analysisFen
  const loadedGameKey = isLoaded ? (currentGameId ?? pgn ?? '__loaded-game__') : null
  const inBranch = currentPath.length > 0 && !moveTree[currentPath[currentPath.length - 1]]?.isMainLine

  // Opening name — detected from move sequence in both modes
  const [openingName, setOpeningName] = useState<string | null>(null)

  // Opening detection for free-play mode — tracks main-line moves from the hook
  useEffect(() => {
    if (!isLoaded) setOpeningName(detectOpening(analysisMainLineSans))
  }, [isLoaded, analysisMainLineSans])

  // Per-position multi-PV analysis — runs whenever current position changes.
  // Also runs in free-play mode when pieces are pushed on the board.
  // Results cached by FEN so revisiting a position is instant.
  const positionTokenRef = useRef(0)
  // Key-hold detection: track timestamp of last nav event (arrow key only — not piece moves)
  const lastNavTimeRef = useRef(0)
  const navHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // When true, the next displayFen change is from a piece move — skip the 180ms deferral
  const isPieceMoveRef = useRef(false)

  function triggerPositionAnalysis(fen: string, depth = POSITION_MAX_DEPTH) {
    // NOTE: callers are responsible for calling stopPositionAnalysis() before this.
    // Do NOT call stopPositionAnalysis() here — it would send a second 'stop' command
    // to the worker, which races with the new analysis dispatch and kills it at low depth.

    // Cap multi-PV to legal move count (avoids duplicate arrows on forced moves)
    let numLines = 2
    try {
      const chess = new Chess(fen)
      const legalMoveCount = chess.moves().length
      if (legalMoveCount === 0) {
        // Terminal position (checkmate/stalemate) — nothing to analyze
        setCurrentPositionLines([])
        setAnalyzingPosition(false)
        return
      }
      numLines = Math.min(2, legalMoveCount)
    } catch { /* invalid FEN — fall through with default 2 */ }

    const token = ++positionTokenRef.current
    setAnalyzingPosition(true)
    // Snapshot cached depth at the start of this analysis run.
    // onUpdate skips any depth ≤ resumeFromDepth so the counter never goes backward:
    // if we left at depth 12, we show 12 from cache, then continue at 13, 14...
    const resumeFromDepth = positionCache.current.get(fen)?.[0]?.depth ?? 0
    if (resumeFromDepth === 0) setCurrentAnalysisDepth(0)

    analyzePositionLines(fen, depth, numLines, (lines, d) => {
      if (positionTokenRef.current !== token) return
      if (d <= resumeFromDepth) return  // skip already-seen depths
      setCurrentPositionLines(lines)
      setCurrentAnalysisDepth(d)
      if (lines.length > 0) positionCache.current.set(fen, lines)
    })
      .then(lines => {
        if (positionTokenRef.current !== token) return
        if (lines.length > 0) positionCache.current.set(fen, lines)
        setCurrentPositionLines(lines)
        setCurrentAnalysisDepth(lines[0]?.depth ?? 0)
        setAnalyzingPosition(false)
      })
      .catch(() => {
        if (positionTokenRef.current !== token) return
        setAnalyzingPosition(false)
      })
  }

  const showAnalyzingBar = isAnalyzing || (analyzedCount < totalMovesCount && totalMovesCount > 0)
  const analysisComplete = !showAnalyzingBar
  const hideLoadedReviewArtifacts = isLoaded && showAnalyzingBar
  const pauseLivePositionAnalysis = hideLoadedReviewArtifacts
  const analysisProgressPercent = totalMovesCount > 0
    ? Math.max(0, Math.min(100, Math.round((analyzedCount / totalMovesCount) * 100)))
    : null
  const analysisProgressPhase = analysisProgressPercent === null
    ? 'Starting analysis'
    : analysisProgressPercent >= 90
      ? 'Finishing up'
      : analysisProgressPercent >= 15
        ? 'Scanning moves'
        : 'Starting analysis'
  const analysisStatusBar = showAnalyzingBar ? (
    <div className="analyzing-bar">
      {analysisProgressPercent !== null && (
        <div
          className="analyzing-bar__fill"
          style={{ width: `${analysisProgressPercent}%` }}
        />
      )}
      <span className="analyzing-dot" />
      <div className="analyzing-bar__content">
        <span className="analyzing-text">Analyzing game</span>
        <span className="analyzing-subtext">
          {analysisProgressPhase}
          {totalMovesCount > 0 && ` · ${analyzedCount} / ${totalMovesCount} moves`}
        </span>
      </div>
    </div>
  ) : null

  useEffect(() => {
    // Always cancel in-flight analysis and pending timers first — even if the new
    // position is cached.  Without this, a deferred 180ms timer for position A can
    // fire after the user has navigated to a cached position B, calling
    // triggerPositionAnalysis(fenA) which then hits the cache and sets stale arrows
    // without any token check.
    positionTokenRef.current++  // Invalidate any in-flight onUpdate callbacks immediately
    stopPositionAnalysis()
    if (navHoldTimerRef.current) clearTimeout(navHoldTimerRef.current)

    if (pauseLivePositionAnalysis) {
      setAnalyzingPosition(false)
      return
    }

    const cached = positionCache.current.get(displayFen)

    // Always show any cached result immediately (partial or full depth)
    if (cached && cached.length > 0) {
      setCurrentPositionLines(cached)
      setCurrentAnalysisDepth(cached[0]?.depth ?? 0)
      if ((cached[0]?.depth ?? 0) >= POSITION_MAX_DEPTH) {
        // Full depth — no further analysis needed
        setAnalyzingPosition(false)
        return
      }
      // Partial depth — show cached arrows but fall through to continue analyzing
      setAnalyzingPosition(true)
    }

    if (!isReady) return  // engine not ready yet — isReady effect will seed analysis

    const hasPartialCache = (cached?.length ?? 0) > 0

    if (isPieceMoveRef.current) {
      // Piece move (drag or best-line click) — clear stale lines immediately so
      // skeleton loaders appear at once (unless we have partial cache for this position),
      // then fire analysis with no deferral.
      isPieceMoveRef.current = false
      if (!hasPartialCache) {
        setCurrentPositionLines([])
        setCurrentAnalysisDepth(0)
      }
      triggerPositionAnalysis(displayFen)
    } else {
      // Key-hold detection: if arrow-key nav events arrive faster than 100ms apart,
      // defer analysis until the user pauses.
      const now = Date.now()
      const gap = now - lastNavTimeRef.current
      lastNavTimeRef.current = now

      if (gap < 100) {
        // Flying through moves — partial/full cached lines already shown above.
        // If no cache, clear stale arrows and defer analysis until user pauses.
        if (!hasPartialCache) {
          setCurrentPositionLines([])
          setCurrentAnalysisDepth(0)
        }
        navHoldTimerRef.current = setTimeout(() => {
          triggerPositionAnalysis(displayFen)
        }, 250)
      } else {
        // Single arrow key press — if no cache, clear stale arrows from previous position.
        // Partial cache already displayed above so we keep them.
        if (!hasPartialCache) {
          setCurrentPositionLines([])
          setCurrentAnalysisDepth(0)
        }
        triggerPositionAnalysis(displayFen)
      }
    }

    return () => {
      if (navHoldTimerRef.current) clearTimeout(navHoldTimerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayFen, isReady, pauseLivePositionAnalysis])

  // When engine becomes ready, retroactively grade any sandbox nodes that were
  // played before Stockfish finished loading (common for eager users).
  useEffect(() => {
    if (!isReady || isLoaded) return
    const unevaluated = Object.values(analysisTree).filter(
      node => !branchGrades.has(node.id) && !pendingBranchNodes.has(node.id)
    )
    for (const node of unevaluated) {
      const parentFen = node.parentId
        ? (analysisTree[node.parentId]?.fen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
        : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
      setPendingBranchNodes(prev => { const s = new Set(prev); s.add(node.id); return s })
      void evaluateBranchMove(node.id, parentFen, node.fen)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady])

  // Safety net: whenever analysisPath changes in sandbox mode, ensure the current
  // node has an eval in flight. Catches any cases where the event-handler eval
  // trigger (which reads lastAddedNodeIdRef) was missed due to timing.
  useEffect(() => {
    if (!isReady || isLoaded || analysisPath.length === 0) return
    const nodeId = analysisPath[analysisPath.length - 1]
    if (!nodeId || branchGrades.has(nodeId)) return
    const node = analysisTree[nodeId]
    if (!node) return
    const STARTING = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    const parentFen = node.parentId
      ? (analysisTree[node.parentId]?.fen ?? STARTING)
      : STARTING
    // Add to pending if not already (handles eagerly-pending nodes from nav handlers)
    if (!pendingBranchNodes.has(nodeId)) {
      setPendingBranchNodes(prev => { const s = new Set(prev); s.add(nodeId); return s })
    }
    // evaluateBranchMove is idempotent via evalInFlightRef — safe to call even if pending
    void evaluateBranchMove(nodeId, parentFen, node.fen)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisPath, isReady])

  // Safety net (game review): when navigating to an ungraded branch node, ensure
  // evaluateBranchMove is dispatched. Covers goBack, goForward, and MoveList click
  // (handleNavigateTo) — all of which may leave a branch node in pendingBranchNodes
  // without ever calling evaluateBranchMove for it. Also fires on page refresh where
  // branchGrades is cleared but the variation tree is restored from session storage.
  useEffect(() => {
    if (!isReady || !isLoaded || currentPath.length === 0) return
    const nodeId = currentPath[currentPath.length - 1]
    if (!nodeId) return
    const node = moveTree[nodeId]
    if (!node || node.isMainLine) return  // main-line grades come from moveEvals
    if (branchGrades.has(nodeId)) return  // already graded
    const STARTING = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    const parentFen = node.parentId ? (moveTree[node.parentId]?.fen ?? STARTING) : STARTING
    if (!pendingBranchNodes.has(nodeId)) {
      setPendingBranchNodes(prev => { const s = new Set(prev); s.add(nodeId); return s })
    }
    // evaluateBranchMove is idempotent via evalInFlightRef — safe to call even if already pending
    void evaluateBranchMove(nodeId, parentFen, node.fen)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath, isReady])

  // Persist branch grades to sessionStorage whenever they change (keyed by game ID).
  // On refresh, pgn+isReady effect reads them back to avoid re-evaluating via Stockfish.
  // We use branchGradesKeyRef (set when grades are initialized) rather than reading
  // currentGameId from the store, to avoid writing old grades to a newly-loaded game's key
  // in the event that currentGameId updates before branchGrades is cleared.
  useEffect(() => {
    if (branchGrades.size === 0) return
    const gameId = branchGradesKeyRef.current
    if (!gameId) return
    writeSessionJson(`deepmove_bg_${gameId}`, Object.fromEntries(branchGrades))
  }, [branchGrades])

  // Recovery effect: on refresh, currentGameId may be restored by Zustand after pgn+isReady
  // fires. If branchGradesKeyRef was null at that point, the restore was skipped. Retry here.
  useEffect(() => {
    if (!currentGameId || !pgn || !isReady) return
    if (branchGradesKeyRef.current === currentGameId) return  // already set correctly
    branchGradesKeyRef.current = currentGameId
    if (branchGrades.size > 0) return  // grades already present, don't overwrite
    const storedBg = readSessionJson<Record<string, string>>(`deepmove_bg_${currentGameId}`)
    if (storedBg && Object.keys(storedBg).length > 0) {
      setBranchGrades(new Map(Object.entries(storedBg) as [string, MoveGrade][]))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentGameId])

  const [orientation, setOrientation] = useState<'white' | 'black'>(
    savedUiState?.orientation ?? savedReviewColor ?? 'white'
  )
  const previousPgnRef = useRef(pgn)

  // Auto-orient board when a new game loads
  useEffect(() => {
    if (pgn && previousPgnRef.current !== pgn) {
      setOrientation(userColor ?? 'white')
    }
    previousPgnRef.current = pgn
  }, [pgn, userColor])

  // Opening detection for loaded games — update as user navigates
  useEffect(() => {
    if (isLoaded) {
      const movesUpToNow = moves.slice(0, currentMoveIndex)
      setOpeningName(detectOpening(movesUpToNow))
    }
  }, [isLoaded, moves, currentMoveIndex])

  const [chesscomGames, setChesscomGames] = useState<ChessComGame[]>([])
  const [lichessGames, setLichessGames] = useState<LichessGame[]>([])
  const [chesscomUsername, setChesscomUsername] = useState('')
  const [lichessUsername, setLichessUsername] = useState('')
  const [chesscomPagination, setChesscomPagination] = useState<PaginationState | null>(null)
  const [lichessPagination, setLichessPagination] = useState<PaginationState | null>(null)
  const [currentPage, setCurrentPage] = useState<Page>(() => routePage ?? savedUiState?.currentPage ?? 'review')
  const goToPage = (page: Page) => {
    if (page !== 'play') clearPlaySession()
    if (typeof window !== 'undefined') {
      const nextPath = getPathForPage(page)
      if (window.location.pathname !== nextPath) {
        window.history.pushState({ page }, '', nextPath)
      }
    }
    setCurrentPage(page)
  }
  const [showEvalBar, setShowEvalBar] = useState(savedUiState?.showEvalBar ?? true)
  const isPhone = useIsPhone()
  const viewMode = panelTab === 'coach' ? 'coach' : 'classic'
  const [showArrows, setShowArrows] = useState(savedUiState?.showArrows ?? true)
  const [showGrades, setShowGrades] = useState(savedUiState?.showGrades ?? true)
  const [resetConfirmArmed, setResetConfirmArmed] = useState(false)

  useEffect(() => {
    if (!resetConfirmArmed) return
    const timeout = window.setTimeout(() => setResetConfirmArmed(false), 2200)
    return () => window.clearTimeout(timeout)
  }, [resetConfirmArmed])

  useEffect(() => {
    writeSessionJson(APP_UI_SESSION_KEY, {
      currentPage,
      panelTab,
      importTab,
      orientation,
      showEvalBar,
      showArrows,
      showGrades,
    } satisfies AppUiState)
  }, [currentPage, panelTab, importTab, orientation, showEvalBar, showArrows, showGrades])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handlePopState = () => {
      const nextPage = getPageFromPathname(window.location.pathname) ?? 'review'
      if (nextPage !== 'play') clearPlaySession()
      setCurrentPage(nextPage)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return

    const meta = getPageMeta(currentPage)
    document.title = 'DeepMove'

    const upsertMeta = (selector: string, attributes: Record<string, string>) => {
      let element = document.head.querySelector<HTMLMetaElement>(selector)
      if (!element) {
        element = document.createElement('meta')
        document.head.appendChild(element)
      }
      Object.entries(attributes).forEach(([key, value]) => element?.setAttribute(key, value))
    }

    const upsertLink = (selector: string, attributes: Record<string, string>) => {
      let element = document.head.querySelector<HTMLLinkElement>(selector)
      if (!element) {
        element = document.createElement('link')
        document.head.appendChild(element)
      }
      Object.entries(attributes).forEach(([key, value]) => element?.setAttribute(key, value))
    }

    upsertMeta('meta[name="description"]', { name: 'description', content: meta.description })
    upsertMeta('meta[property="og:title"]', { property: 'og:title', content: meta.title })
    upsertMeta('meta[property="og:description"]', { property: 'og:description', content: meta.description })
    upsertMeta('meta[property="og:url"]', { property: 'og:url', content: meta.canonicalUrl })
    upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: meta.title })
    upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: meta.description })
    upsertMeta('meta[name="robots"]', {
      name: 'robots',
      content: isIndexablePage(currentPage) ? 'index,follow' : 'noindex,nofollow',
    })
    upsertLink('link[rel="canonical"]', { rel: 'canonical', href: meta.canonicalUrl })
  }, [currentPage])


  // Desktop: suppress hover appearance immediately after click (until mouse moves).
  // Prevents buttons from looking "selected" after being clicked with a mouse.
  // Uses a 5px movement threshold so click-jitter doesn't prematurely remove the class.
  useEffect(() => {
    let clickX = 0, clickY = 0
    const THRESHOLD = 5
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      clickX = e.clientX; clickY = e.clientY
      document.body.classList.add('just-clicked')
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      if (Math.hypot(e.clientX - clickX, e.clientY - clickY) > THRESHOLD)
        document.body.classList.remove('just-clicked')
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
    }
  }, [])

  // Last-move highlight: always reflects the actual last move in currentPath
  // so chessground never shows a stale highlight after navigating back.
  const lastMoveNode = currentPath.length > 0 ? moveTree[currentPath[currentPath.length - 1]] : undefined
  const boardLastMove = lastMoveNode
    ? [lastMoveNode.from, lastMoveNode.to] as [Key, Key]
    : undefined

  useEffect(() => {
    if (!loadedGameKey) {
      if (panelTab === 'coach') setPanelTab('analysis')
      return
    }

    // Clear any arrows that were showing in free-play mode so they don't flash
    // on the first position of the newly loaded game.
    setCurrentPositionLines([])
    setAnalyzingPosition(false)
    setPanelTab('analysis')
    analysisBoardReset()
    lastGradedNodeIdRef.current = null
    setBranchGrades(new Map())
    setPendingBranchNodes(new Set())

    // Re-seed best-lines when the loaded game changes, even if the displayed FEN
    // stays identical (for example move 0 in consecutive standard games).
    handleBeforeGameLoad()
    if (isReady) triggerPositionAnalysis(displayFen)
  }, [loadedGameKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isLoaded) return

    setPendingBranchNodes(prev => pruneReviewPendingNodes(prev, moveTree, branchGrades))
  }, [isLoaded, moveTree, branchGrades])

  // ── Keyboard navigation ────────────────────────────────────────────────────

  const goBackFn = useCallback(() => {
    pathKeyRef.current++
    // Eagerly mark destination pending so badge shows spinner on first render after nav
    const curInBranch = currentPath.length > 0 && !moveTree[currentPath[currentPath.length - 1]]?.isMainLine
    if (curInBranch && currentPath.length > 1) {
      const destId = currentPath[currentPath.length - 2]
      if (shouldTrackReviewPendingNode(destId, moveTree, branchGrades)) {
        setPendingBranchNodes(prev => { const s = new Set(prev); s.add(destId); return s })
      }
    }
    if (currentPath.length > 1) {
      playMoveSound(moveTree[currentPath[currentPath.length - 2]]?.san ?? '')
    }
    goBack()
  }, [goBack, currentPath, moveTree, branchGrades, playMoveSound])

  const goForwardFn = useCallback(() => {
    pathKeyRef.current++
    const nextId = currentPath.length === 0
      ? rootId
      : moveTree[currentPath[currentPath.length - 1]]?.childIds[0]
    if (nextId) playMoveSound(moveTree[nextId]?.san ?? '')
    // Eagerly mark destination pending so badge shows spinner on first render after nav
    const curInBranch = currentPath.length > 0 && !moveTree[currentPath[currentPath.length - 1]]?.isMainLine
    if (curInBranch && shouldTrackReviewPendingNode(nextId, moveTree, branchGrades)) {
      setPendingBranchNodes(prev => { const s = new Set(prev); s.add(nextId); return s })
    }
    goForward()
  }, [currentPath, rootId, moveTree, goForward, playMoveSound, branchGrades])

  // Sandbox nav wrappers: eagerly mark destination as pending so the board badge
  // shows a spinner immediately (before the safety-net effect fires on next render).
  const handleAnalysisGoBack = useCallback(() => {
    if (analysisPath.length > 1) {
      const destId = analysisPath[analysisPath.length - 2]
      if (destId && !branchGrades.has(destId)) {
        setPendingBranchNodes(prev => { const s = new Set(prev); s.add(destId); return s })
      }
    }
    if (analysisPath.length > 1) {
      playMoveSound(analysisTree[analysisPath[analysisPath.length - 2]]?.san ?? '')
    }
    analysisBoardGoBack()
  }, [analysisPath, analysisTree, branchGrades, analysisBoardGoBack, playMoveSound])

  const handleAnalysisGoForward = useCallback(() => {
    const lastId = analysisPath.length > 0 ? analysisPath[analysisPath.length - 1] : null
    const destId = lastId ? analysisTree[lastId]?.childIds?.[0] : analysisRootId
    if (destId && !branchGrades.has(destId)) {
      setPendingBranchNodes(prev => { const s = new Set(prev); s.add(destId); return s })
    }
    if (destId) playMoveSound(analysisTree[destId]?.san ?? '')
    analysisBoardGoForward()
  }, [analysisPath, analysisTree, analysisRootId, branchGrades, analysisBoardGoForward, playMoveSound])

  const reviewBackDisabled = currentPath.length === 0
  const reviewForwardDisabled = currentPath.length === 0
    ? !rootId
    : !moveTree[currentPath[currentPath.length - 1]]?.childIds[0]
  const analysisBackDisabled = analysisPath.length === 0
  const analysisForwardDisabled = analysisRootId === null
    ? true
    : analysisPath.length !== 0 && !analysisTree[analysisPath[analysisPath.length - 1]]?.childIds[0]

  const reviewBackTouchHandlers = useTouchHoldNavigate(goBackFn, reviewBackDisabled)
  const reviewForwardTouchHandlers = useTouchHoldNavigate(goForwardFn, reviewForwardDisabled)
  const analysisBackTouchHandlers = useTouchHoldNavigate(handleAnalysisGoBack, analysisBackDisabled)
  const analysisForwardTouchHandlers = useTouchHoldNavigate(handleAnalysisGoForward, analysisForwardDisabled)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const active = document.activeElement
      if (active?.tagName === 'TEXTAREA' || active?.tagName === 'INPUT') return
      if (isLoaded) {
        if (e.key === 'ArrowLeft') { e.preventDefault(); goBackFn() }
        if (e.key === 'ArrowRight') { e.preventDefault(); goForwardFn() }
      } else if (analysisRootId !== null) {
        if (e.key === 'ArrowLeft') { e.preventDefault(); handleAnalysisGoBack() }
        if (e.key === 'ArrowRight') { e.preventDefault(); handleAnalysisGoForward() }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isLoaded, goBackFn, goForwardFn, analysisRootId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Player display ─────────────────────────────────────────────────────────

  const topPlayer = orientation === 'white'
    ? { name: blackPlayer, elo: blackElo }
    : { name: whitePlayer, elo: whiteElo }
  const bottomPlayer = orientation === 'white'
    ? { name: whitePlayer, elo: whiteElo }
    : { name: blackPlayer, elo: blackElo }

  const toMoveSide = displayFen.split(' ')[1]
  const topIsToMove = orientation === 'white' ? toMoveSide === 'b' : toMoveSide === 'w'

  // Find the most recent clock time for each player from the current path
  const topColor: 'white' | 'black' = orientation === 'white' ? 'black' : 'white'
  const bottomColor: 'white' | 'black' = orientation === 'white' ? 'white' : 'black'
  let topClock: string | undefined
  let bottomClock: string | undefined
  for (let i = currentPath.length - 1; i >= 0; i--) {
    const node = moveTree[currentPath[i]]
    if (!node) continue
    if (topClock === undefined && node.color === topColor) topClock = node.clockTime
    if (bottomClock === undefined && node.color === bottomColor) bottomClock = node.clockTime
    if (topClock !== undefined && bottomClock !== undefined) break
  }
  // At move 0, fall back to the game start time derived from time control
  if (topClock === undefined && bottomClock === undefined && currentGameMeta?.timeControl) {
    const tc = currentGameMeta.timeControl
    let tcSecs: number
    if (tc.includes('+')) {
      const base = parseInt(tc, 10)
      tcSecs = isNaN(base) ? 0 : (base >= 60 ? base : base * 60)
    } else if (tc.includes('min')) {
      tcSecs = parseInt(tc, 10) * 60
    } else {
      const base = parseInt(tc, 10)
      tcSecs = isNaN(base) ? 0 : (base >= 60 ? base : base * 60)
    }
    if (tcSecs > 0) {
      const h = Math.floor(tcSecs / 3600)
      const m = Math.floor((tcSecs % 3600) / 60)
      const s = tcSecs % 60
      const initial = `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      topClock = initial
      bottomClock = initial
    }
  }


  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleNewGame() {
    cancelGameAnalysis()
    positionTokenRef.current++  // Invalidate any in-flight onUpdate callbacks immediately
    stopPositionAnalysis()
    positionTokenRef.current++
    if (navHoldTimerRef.current) clearTimeout(navHoldTimerRef.current)
    reset()
    lastEvalRef.current = { cp: 0, isMate: false, mateIn: null }
    positionCache.current.clear()
    lastGradedNodeIdRef.current = null
    setBranchGrades(new Map())
    setPendingBranchNodes(new Set())
    analysisBoardReset()
    setOpeningName(null)
    setPanelTab('load')
  }

  function handleLoadSandboxAsGame() {
    if (analysisMainLineSans.length === 0) return
    const chess = new Chess()
    for (const san of analysisMainLineSans) chess.move(san)
    cancelGameAnalysis()
    reset()
    setStoredUserColor(null)
    setPgn(chess.pgn())
    setPanelTab('analysis')
  }

  function handleSandboxReset() {
    if (!resetConfirmArmed) {
      setResetConfirmArmed(true)
      return
    }

    analysisBoardReset()
    lastGradedNodeIdRef.current = null
    setBranchGrades(new Map())
    setPendingBranchNodes(new Set())
    setOpeningName(null)
    setResetConfirmArmed(false)
  }

  // Called by GameSelector before loading a new game — stops any in-flight
  // position analysis so stale arrows can't flash on the new game's position.
  function handleBeforeGameLoad() {
    cancelGameAnalysis()
    stopBranchAnalysis()
    positionTokenRef.current++  // Invalidate any in-flight onUpdate callbacks immediately
    stopPositionAnalysis()
    positionTokenRef.current++
    if (navHoldTimerRef.current) clearTimeout(navHoldTimerRef.current)
  }

  // Board move during game review: advance main line or create branch.
  function handleBoardMove(from: string, to: string, san: string, newFen: string) {
    pathKeyRef.current++
    playMoveSound(san)
    isPieceMoveRef.current = true
    const next = nextMainLineNode
    if (next && next.from === from && next.to === to && next.san === san) {
      goForward()
    } else {
      const parentFen = currentFen
      addVariationMove(from, to, san, newFen)
      // lastAddedNodeIdRef is set synchronously inside addVariationMove (new or re-used node)
      const nodeId = lastAddedNodeIdRef.current
      // Only evaluate if not already graded (avoids re-eval when navigating to existing branch node)
      if (nodeId && isReady && !branchGrades.has(nodeId)) {
        setPendingBranchNodes(prev => { const s = new Set(prev); s.add(nodeId); return s })
        void evaluateBranchMove(nodeId, parentFen, newFen)
      }
    }
  }

  function isStockfishCancelledError(err: unknown): boolean {
    return err instanceof Error && err.message === 'Stockfish analysis cancelled'
  }

  async function evaluateBranchMove(nodeId: string, parentFen: string, newFen: string) {
    if (!isReady || evalInFlightRef.current.has(nodeId) || branchGrades.has(nodeId)) return
    evalInFlightRef.current.add(nodeId)
    // Capture gameId at start — discard result if user switches games mid-eval
    const gameIdAtStart = branchGradesKeyRef.current
    try {
      const chess = new Chess(parentFen)
      const legalCount = chess.moves().length
      const inCheck = chess.isCheck()
      const color: 'white' | 'black' = parentFen.split(' ')[1] === 'w' ? 'white' : 'black'

      const cachedParentTopLine = positionCache.current.get(parentFen)?.[0] ?? null
      const parentResult = cachedParentTopLine
        ? { score: cachedParentTopLine.score, pv: cachedParentTopLine.pv }
        : await analyzePositionSingleBranch(parentFen, 14)
      // Single-PV on position after the branch move
      const afterResult = await analyzePositionSingleBranch(newFen, 14)

      if (!parentResult || !afterResult) {
        lastGradedNodeIdRef.current = nodeId
        setBranchGrades(prev => new Map(prev).set(nodeId, 'unknown' as MoveGrade))
        return  // finally still clears pendingBranchNodes
      }

      // Discard result if the user already switched to a different game
      if (branchGradesKeyRef.current !== gameIdAtStart) return

      const evalBefore = parentResult.score
      const evalAfter = afterResult.score

      // Derive the played move (needed for sacrifice detection + top-suggestion check)
      const legalMoves = chess.moves({ verbose: true })
      const playedMove = legalMoves.find(m => m.after === newFen)

      // Branch grades should only treat the engine's #1 move as "top suggested".
      // Otherwise a second-best sacrifice can get mislabeled as brilliant.
      const topUciMove = parentResult.pv?.[0] ?? null
      const playedUci = playedMove ? playedMove.from + playedMove.to + (playedMove.promotion ?? '') : null
      const isTopSuggested = playedUci !== null && topUciMove === playedUci

      // Sacrifice detection (requires the move + position after)
      const sacrifice = playedMove ? isSacrificeFn(playedMove, newFen) : false

      const grade = classifyMove(evalBefore, evalAfter, color, legalCount, sacrifice, null, isTopSuggested, false, inCheck)
      lastGradedNodeIdRef.current = nodeId
      setBranchGrades(prev => new Map(prev).set(nodeId, grade))
    } catch (err) {
      if (isStockfishCancelledError(err)) return
    } finally {
      evalInFlightRef.current.delete(nodeId)
      setPendingBranchNodes(prev => { const s = new Set(prev); s.delete(nodeId); return s })
    }
  }

  // Best Lines click: enter first move of that PV as a branch
  function handleGoToMove(index: number) {
    pathKeyRef.current++
    if (index > 0 && index <= moves.length) playMoveSound(moves[index - 1])
    goToMove(index)
  }


  function handleShowBestMove() {
    const lesson = coachLessons.find(l =>
      (l.moment.moveNumber - 1) * 2 + (l.moment.color === 'white' ? 1 : 2) === currentMoveIndex
    )
    if (!lesson) return
    const bestMoveSan = lesson.moment.features?.engineMoveImpact?.bestMoveSan
    if (!bestMoveSan || !lesson.moment.fen) return
    // Navigate to position BEFORE the mistake
    const halfMoveIdx = (lesson.moment.moveNumber - 1) * 2 + (lesson.moment.color === 'white' ? 0 : 1)
    goToMove(halfMoveIdx)
    // Defer branch creation until after navigation state settles
    requestAnimationFrame(() => {
      try {
        const chess = new Chess(lesson.moment.fen)
        const move = chess.move(bestMoveSan)
        if (move) {
          addVariationMove(move.from, move.to, move.san, chess.fen())
        }
      } catch {
        // Invalid SAN should not break the review UI.
      }
    })
  }

  function handleNavigateTo(path: string[]) {
    pathKeyRef.current++
    const nodeId = path[path.length - 1]
    if (nodeId && moveTree[nodeId]) playMoveSound(moveTree[nodeId].san)
    navigateTo(path)
  }

  // Enter first move of a best line (clicked in BestLines panel or via arrow).
  // In game review mode: plays into the game's variation tree (same as dragging the piece).
  // In sandbox mode: plays into the free-play analysis tree.
  function handleAnalysisBestLineClick(line: TopLine) {
    const uci = line.pv[0]
    if (!uci || uci.length < 4) return
    const from = uci.slice(0, 2)
    const to = uci.slice(2, 4)
    const promotion = uci.length === 5 ? uci[4] : undefined

    if (isLoaded) {
      // Game review mode — delegate to handleBoardMove which handles main-line advance vs branch
      const chess = new Chess(currentFen)
      const result = chess.move({ from, to, promotion })
      if (!result) return
      playMoveSound(result.san)
      isPieceMoveRef.current = true
      pathKeyRef.current++
      handleBoardMove(from, to, result.san, chess.fen())
    } else {
      // Sandbox/free-play mode
      const chess = new Chess(analysisFen)
      const result = chess.move({ from, to, promotion })
      if (!result) return
      playMoveSound(result.san)
      pathKeyRef.current++
      const parentFen = analysisFen
      const newFen = chess.fen()
      analysisBoardAddMove(from, to, result.san, newFen)
      const nodeId = analysisLastAddedNodeIdRef.current
      if (nodeId && isReady && !branchGrades.has(nodeId)) {
        setPendingBranchNodes(prev => { const s = new Set(prev); s.add(nodeId); return s })
        void evaluateBranchMove(nodeId, parentFen, newFen)
      }
      if (panelTab !== 'coach') setPanelTab('analysis')
    }
  }



  const moveGrades = useMemo(() => moveEvals.map(me => me.grade), [moveEvals])

  // Eval delta per move (player's perspective, in centipawns).
  // White's delta = score[i] - score[i-1]; black's delta = -(score[i] - score[i-1]).
  // Move 0 (first move): delta from the starting position (score = 0).
  const moveDeltas = useMemo((): (number | undefined)[] =>
    moveEvals.map((me, i) => {
      const before = i === 0 ? 0 : moveEvals[i - 1].eval.score
      const after = me.eval.score
      const raw = after - before
      return me.color === 'white' ? raw : -raw
    }),
    [moveEvals]
  )

  // Lightweight coaching blurb for the current branch move (no full LLM lesson)
  const currentNodeId = currentPath.length > 0 ? currentPath[currentPath.length - 1] : null
  const currentNode = currentNodeId ? moveTree[currentNodeId] : null
  const branchComment = (inBranch && currentNode && currentNodeId && branchGrades.has(currentNodeId))
    ? { grade: branchGrades.get(currentNodeId)!, san: currentNode.san }
    : null

  // Sandbox mode: coaching blurb for the current analysis node
  const sandboxCurrentNodeId = !isLoaded && analysisPath.length > 0
    ? analysisPath[analysisPath.length - 1]
    : null
  const sandboxCurrentNode = sandboxCurrentNodeId ? analysisTree[sandboxCurrentNodeId] : null
  const sandboxBranchComment = (sandboxCurrentNodeId && sandboxCurrentNode && branchGrades.has(sandboxCurrentNodeId))
    ? { grade: branchGrades.get(sandboxCurrentNodeId)!, san: sandboxCurrentNode.san }
    : null

  // ── Eval ───────────────────────────────────────────────────────────────────

  // For the eval bar: prefer the stable full-game eval on the main line.
  // Only fall back to multi-PV posLine in branches (no mainEval) or before full-game analysis.
  const posLine = currentPositionLines[0]
  const mainEval = currentMoveIndex > 0 ? moveEvals[currentMoveIndex - 1] : undefined
  const useMainEval = mainEval && !inBranch
  // In branch mode: only use posLine (live engine result). Don't fall back to mainEval —
  // that value is for a different position and would cause a bounce as the bar flashes
  // the main-line eval then snaps to the branch eval when the engine responds.
  // EvalBar + lastEvalRef below hold the last known value when evalCp is undefined.
  // At move 0 on the main line (starting position), use 0cp so the bar doesn't stick
  // at the previous position's eval while waiting for multi-PV to respond.
  const atStartOnMainLine = isLoaded && currentMoveIndex === 0 && !inBranch
  const evalCp = atStartOnMainLine ? 0 : (useMainEval ? mainEval.eval.score : posLine?.score)
  const evalIsMate = useMainEval ? (mainEval.eval.isMate ?? false) : (posLine?.isMate ?? false)
  const evalMateIn = useMainEval ? (mainEval.eval.mateIn ?? null) : (posLine?.mateIn ?? null)

  // Stable eval: never undefined — falls back to last known value
  if (evalCp !== undefined) {
    lastEvalRef.current = { cp: evalCp, isMate: evalIsMate, mateIn: evalMateIn }
  }
  const stableEvalCp = evalCp ?? lastEvalRef.current.cp
  const stableIsMate = evalCp !== undefined ? evalIsMate : lastEvalRef.current.isMate
  const stableMateIn = evalCp !== undefined ? evalMateIn : lastEvalRef.current.mateIn
  const showLoadingEvalPlaceholder = isLoaded && showAnalyzingBar && !inBranch && !mainEval && !posLine
  const displayedEvalText = showLoadingEvalPlaceholder ? null : formatEval(stableEvalCp, stableIsMate, stableMateIn)
  const shouldRenderEvalDisplay = Boolean(
    displayedEvalText
    || currentAnalysisDepth > 0
    || isAnalyzingPosition
    || (mainEval && !inBranch)
  )

  // ── Arrow shapes ───────────────────────────────────────────────────────────

  // Show 1-3 lines based on how close alternatives are to the best move,
  // using the same centipawn-loss thresholds as move grading:
  //   line 2: gap ≤ 150cp (would still grade "good" or better)
  //   line 3: gap ≤ 50cp  (must be essentially equal — "excellent" or better)
  // This prevents inaccuracies/mistakes from appearing as "suggested" alternatives.
  const visibleLines = useMemo(() => {
    const lines = currentPositionLines
    if (lines.length === 0) return []
    const best = lines[0]
    const seenFirstMove = new Set<string>()
    return lines.filter((line, i) => {
      // Deduplicate by first move — Stockfish can return the same move in multiple PV lines
      const firstMove = line.pv[0] ?? ''
      if (seenFirstMove.has(firstMove)) return false
      seenFirstMove.add(firstMove)
      if (i === 0) return true
      // If the best move involves mate and this one doesn't (or vice versa),
      // the difference is decisive — never show as a "suggestion".
      if (best.isMate !== line.isMate) return false
      // If both are mate: only show alternatives with the same or better mate-in.
      // e.g. M3 and M5 are both fine; M3 and -M2 (opponent mates) are not.
      if (best.isMate && line.isMate) {
        // Same sign = both sides mating in same direction? Only show if equal or faster.
        if (best.mateIn !== null && line.mateIn !== null) {
          if ((best.mateIn > 0) !== (line.mateIn > 0)) return false  // opposite mate direction
          return Math.abs(line.mateIn) <= Math.abs(best.mateIn)  // only show equal or faster mate
        }
        return true
      }
      const gap = Math.abs(line.score - best.score)
      if (i === 1) return gap <= 150
      if (i === 2) return gap <= 50
      return false
    })
  }, [currentPositionLines])

  const boardShapes: DrawShape[] = useMemo(() => visibleLines
    .filter(l => l.pv.length >= 1)
    .map((line, i) => ({
      orig: line.pv[0].slice(0, 2) as Key,
      dest: line.pv[0].slice(2, 4) as Key,
      brush: LINE_BRUSHES[i] ?? 'okMove',
    })), [visibleLines])

  const [canShowUtilityRail, setCanShowUtilityRail] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia(UTILITY_RAIL_MEDIA_QUERY).matches
  ))

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia(UTILITY_RAIL_MEDIA_QUERY)
    const syncUtilityRail = () => setCanShowUtilityRail(mediaQuery.matches)

    syncUtilityRail()

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncUtilityRail)
      return () => mediaQuery.removeEventListener('change', syncUtilityRail)
    }

    mediaQuery.addListener(syncUtilityRail)
    return () => mediaQuery.removeListener(syncUtilityRail)
  }, [])

  // ── Misc ───────────────────────────────────────────────────────────────────


  const isReviewPage = currentPage === 'review'
  const isPlayPage = currentPage === 'play'
  const isDocumentPage = currentPage === 'about' || currentPage === 'privacy'
  const isFixedLayoutPage = isReviewPage || isPlayPage
  const isScrollPage = !isFixedLayoutPage
  const desktopRailPage = RAIL_AD_PAGE_SET.has(currentPage) ? currentPage : null
  const mobileSponsorPage = MOBILE_BANNER_PAGE_SET.has(currentPage) ? currentPage : null
  const shouldShowDesktopRail = !isPremium && desktopRailAdEnabled && desktopRailPage !== null
  // iPhone Safari is still unstable when a fixed bottom ad is combined with the
  // fixed-layout review/play shell and pinch zoom. Keep mobile banner ads off
  // those pages until we replace them with a zoom-safe mobile treatment.
  const shouldShowMobileSponsor = !isFixedLayoutPage && !isPremium && mobileBannerAdEnabled && mobileSponsorPage !== null
  const shouldShowUtilityRail = isFixedLayoutPage && desktopRailPage !== null && !shouldShowDesktopRail && canShowUtilityRail
  const reviewBoundaryKey = `${currentGameId ?? 'sandbox'}:${panelTab}:${importTab}:${isLoaded ? 'loaded' : 'sandbox'}`
  const boardBoundaryKey = `${reviewBoundaryKey}:${orientation}`

  return (
    <ResponsiveLayout
      currentPage={currentPage}
      onNavigate={goToPage}
      hasMobileBanner={shouldShowMobileSponsor}
    >
      {paymentSuccessMsg && (
        <div className="payment-success-banner">{paymentSuccessMsg}</div>
      )}
      <div className={[
        'app-view',
        isScrollPage ? 'app-view--page' : '',
        isDocumentPage ? 'app-view--document' : '',
      ].filter(Boolean).join(' ')}>
        <div className={[
          'app-main',
          isDocumentPage ? 'app-main--document' : '',
          !isFixedLayoutPage && !isDocumentPage ? 'app-main--page' : '',
        ].filter(Boolean).join(' ')}>
          {currentPage === 'review' && (
            <>
              <ErrorBoundary
                boundaryName="review-board"
                resetKey={boardBoundaryKey}
                fallback={renderBoundaryFallback(
                  'Board unavailable',
                  'The board view hit a problem. Reload or open another game to continue reviewing.',
                )}
              >
              <div className="board-col">
                {/* board-with-eval wraps eval bar + the full board column (player boxes + board)
                    so the eval bar spans the full height and all left/right edges align */}
                <div className="board-with-eval">
                  <EvalBar
                      evalCentipawns={stableEvalCp}
                      isMate={stableIsMate}
                      mateIn={stableMateIn}
                      orientation={orientation}
                      hidden={!showEvalBar}
                      horizontal={isPhone}
                    />
                  <div className="board-and-players">
                    {isLoaded ? (
                      <PlayerInfoBox
                        username={topPlayer.name}
                        elo={topPlayer.elo}
                        isWhite={orientation !== 'white'}
                        isToMove={topIsToMove}
                        currentFen={displayFen}
                        platform={platform}
                        clockTime={topClock}
                      />
                    ) : (
                      <PlayerInfoBox
                        username="Analysis Board"
                        elo={null}
                        isWhite={orientation !== 'white'}
                        isToMove={displayFen.split(' ')[1] === (orientation === 'white' ? 'b' : 'w')}
                        currentFen={displayFen}
                        platform={null}
                        clockTime={undefined}
                      />
                    )}
                    <div className="board-overlay-host">
                    <ChessBoard
                      key={isLoaded ? 'review' : 'freeplay'}
                      fen={displayFen}
                      orientation={orientation}
                      interactive={true}
                      onMove={isLoaded
                        ? handleBoardMove
                        : (from, to, san, newFen) => {
                // Guard against chessground double-firing the same move. Keyed on
                // (from+to+newFen) so it's immune to timing — even if the second
                // fire arrives 200ms later it carries the identical key → blocked.
                const moveKey = `${from}${to}${newFen}`
                if (lastSandboxMoveRef.current === moveKey) return
                lastSandboxMoveRef.current = moveKey
                setTimeout(() => { if (lastSandboxMoveRef.current === moveKey) lastSandboxMoveRef.current = null }, 1000)
                playMoveSound(san)
                pathKeyRef.current++
                const parentFen = analysisFen
                analysisBoardAddMove(from, to, san, newFen)
                const nodeId = analysisLastAddedNodeIdRef.current
                if (nodeId && isReady && !branchGrades.has(nodeId)) {
                  setPendingBranchNodes(prev => { const s = new Set(prev); s.add(nodeId); return s })
                  void evaluateBranchMove(nodeId, parentFen, newFen)
                }
                if (panelTab !== 'coach') setPanelTab('analysis')
              }
                      }
                      shapes={showArrows ? boardShapes : []}
                      lastMove={isLoaded ? boardLastMove : (
                        analysisPath.length > 0
                          ? [analysisTree[analysisPath[analysisPath.length - 1]]?.from, analysisTree[analysisPath[analysisPath.length - 1]]?.to] as [Key, Key] | undefined
                          : undefined
                      )}
                      pathKey={pathKeyRef.current}
                    />
                    {(() => {
                      // Determine current branch node for pending/grade lookup.
                      // In free-play (!isLoaded) use lastGradedNodeIdRef so the badge
                      // reflects the most recently computed eval even if analysisPath
                      // has already advanced to the next move before this render.
                      const boardNodeId = isLoaded
                        ? (inBranch ? currentNodeId : null)
                        : (lastGradedNodeIdRef.current ?? (analysisPath.length > 0 ? analysisPath[analysisPath.length - 1] : null))
                      const grade = isLoaded
                        ? (hideLoadedReviewArtifacts
                            ? undefined
                            : (inBranch && currentNodeId ? branchGrades.get(currentNodeId) : mainEval?.grade))
                        : (boardNodeId ? branchGrades.get(boardNodeId) : undefined)
                      const badgeMeta = showGrades ? getGradeBadgeMeta(grade) : null
                      const destSquare = isLoaded
                        ? (inBranch && currentNodeId ? moveTree[currentNodeId]?.to : boardLastMove?.[1])
                        : (boardNodeId ? analysisTree[boardNodeId]?.to : undefined)
                      // Show pending spinner while branch eval is in flight.
                      // Also show for main-line moves while full-game analysis is still running
                      // (mainEval?.grade not yet populated for this move index).
                      const isMainLinePending = isLoaded && !inBranch && !hideLoadedReviewArtifacts && isAnalyzing && !mainEval?.grade && !!boardLastMove
                      const isPendingOnBoard = showGrades && !hideLoadedReviewArtifacts && (
                        (boardNodeId !== null && pendingBranchNodes.has(boardNodeId)) ||
                        isMainLinePending
                      )
                      if (isPendingOnBoard && destSquare) {
                        return (
                          <div
                            key={`${destSquare}-pending`}
                            className="board-grade-badge-pending"
                            style={getSquareOverlayPosition(destSquare, orientation)}
                          />
                        )
                      }
                      if (!badgeMeta || !destSquare) return null
                      return (
                        <div
                          key={destSquare}
                          className="board-grade-badge"
                          data-grade={grade ?? ''}
                          style={{
                            ...getSquareOverlayPosition(destSquare, orientation),
                            background: badgeMeta.boardColor,
                          }}
                        >
                          {renderGradeBadgeGlyph(grade, 'board')}
                        </div>
                      )
                    })()}
                    {(() => {
                      const _chess = new Chess(displayFen)
                      const _findKing = (c: 'w' | 'b'): string | null => {
                        for (const f of 'abcdefgh') for (const r of '12345678') {
                          const p = _chess.get(`${f}${r}` as any)
                          if (p?.type === 'k' && p.color === c) return f + r
                        }
                        return null
                      }
                      if (_chess.isCheckmate()) {
                        const sq = _findKing(_chess.turn())
                        if (!sq) return null
                        return <div className="board-result-badge board-result-badge--checkmate" style={getSquareOverlayPosition(sq, orientation)}>#</div>
                      }
                      // FEN-based draws (stalemate, insufficient material, 50-move) — work without history
                      if (_chess.isDraw()) {
                        const wSq = _findKing('w'), bSq = _findKing('b')
                        return <>{wSq && <div className="board-result-badge board-result-badge--draw" style={getSquareOverlayPosition(wSq, orientation)}>½</div>}{bSq && <div className="board-result-badge board-result-badge--draw" style={getSquareOverlayPosition(bSq, orientation)}>½</div>}</>
                      }
                      // Game review: PGN result header fallback for history-dependent draws (threefold etc.)
                      if (isLoaded && !inBranch && gameResult === '1/2-1/2'
                          && currentNodeId !== null && (moveTree[currentNodeId]?.childIds.length ?? 0) === 0) {
                        const wSq = _findKing('w'), bSq = _findKing('b')
                        return <>{wSq && <div className="board-result-badge board-result-badge--draw" style={getSquareOverlayPosition(wSq, orientation)}>½</div>}{bSq && <div className="board-result-badge board-result-badge--draw" style={getSquareOverlayPosition(bSq, orientation)}>½</div>}</>
                      }
                      // Sandbox: count position repetitions by walking analysis move history
                      if (!isLoaded) {
                        const _posKey = displayFen.split(' ').slice(0, 4).join(' ')
                        let _repCount = analysisPath.filter(id =>
                          analysisTree[id]?.fen?.split(' ').slice(0, 4).join(' ') === _posKey
                        ).length
                        if (analysisBoardStartFen.split(' ').slice(0, 4).join(' ') === _posKey) _repCount++
                        if (_repCount >= 3) {
                          const wSq = _findKing('w'), bSq = _findKing('b')
                          return <>{wSq && <div className="board-result-badge board-result-badge--draw" style={getSquareOverlayPosition(wSq, orientation)}>½</div>}{bSq && <div className="board-result-badge board-result-badge--draw" style={getSquareOverlayPosition(bSq, orientation)}>½</div>}</>
                        }
                      }
                      return null
                    })()}
                    </div>
                    {isLoaded ? (
                      <PlayerInfoBox
                        username={bottomPlayer.name}
                        elo={bottomPlayer.elo}
                        isWhite={orientation === 'white'}
                        isToMove={!topIsToMove}
                        currentFen={displayFen}
                        platform={platform}
                        clockTime={bottomClock}
                      />
                    ) : (
                      <PlayerInfoBox
                        username={authUser?.chesscom_username ?? authUser?.lichess_username ?? 'You'}
                        elo={authUser?.elo_estimate ? String(authUser.elo_estimate) : null}
                        isWhite={orientation === 'white'}
                        isToMove={false}
                        currentFen={displayFen}
                        platform={authUser?.chesscom_username ? 'chesscom' : authUser?.lichess_username ? 'lichess' : null}
                        clockTime={undefined}
                      />
                    )}
                  </div>
                </div>

                <div className="board-controls">
                  <div className="board-controls__nav">
                    {isLoaded ? (
                      <>
                        <button
                          className="nav-btn"
                          disabled={reviewBackDisabled}
                          {...reviewBackTouchHandlers}
                        >
                          ←
                        </button>
                        <span className="move-counter">
                          {pathDepth} / {displayTotalDepth}
                        </span>
                        <button
                          className="nav-btn"
                          disabled={reviewForwardDisabled}
                          {...reviewForwardTouchHandlers}
                        >
                          →
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="nav-btn"
                          disabled={analysisBackDisabled}
                          {...analysisBackTouchHandlers}
                        >
                          ←
                        </button>
                        <span className="move-counter">
                          {analysisPath.length} / {analysisMainLineSans.length}
                        </span>
                        <button
                          className="nav-btn"
                          disabled={analysisForwardDisabled}
                          {...analysisForwardTouchHandlers}
                        >
                          →
                        </button>
                      </>
                    )}
                  </div>

                  <div className="board-controls__actions">
                    <button
                      className="btn btn-secondary board-control-btn"
                      onClick={() => setOrientation(o => o === 'white' ? 'black' : 'white')}
                    >
                      Flip
                    </button>
                    {isLoaded ? (
                      <button className="btn btn-secondary board-control-btn" onClick={handleNewGame}>New Game</button>
                    ) : (
                      <button
                        className={`btn btn-secondary board-control-btn${resetConfirmArmed ? ' board-control-btn--danger' : ''}`}
                        onClick={handleSandboxReset}
                      >
                        {resetConfirmArmed ? 'Confirm Reset' : 'Reset'}
                      </button>
                    )}
                    <button
                      className={`btn btn-secondary board-control-btn${showEvalBar ? ' board-control-btn--active' : ''}`}
                      onClick={() => setShowEvalBar(v => !v)}
                      title={showEvalBar ? 'Hide eval bar' : 'Show eval bar'}
                      aria-pressed={showEvalBar}
                    >
                      Eval
                    </button>
                    <button
                      className={`btn btn-secondary board-control-btn${soundEnabled ? ' board-control-btn--active' : ''}`}
                      onClick={toggleSound}
                      title={soundEnabled ? 'Mute sounds' : 'Unmute sounds'}
                      aria-pressed={soundEnabled}
                    >
                      Sound
                    </button>

                    <button
                      className={`btn btn-secondary board-control-btn${showArrows ? ' board-control-btn--active' : ''}`}
                      onClick={() => setShowArrows(v => !v)}
                      title={showArrows ? 'Hide suggestion arrows' : 'Show suggestion arrows'}
                      aria-pressed={showArrows}
                    >
                      Arrows
                    </button>
                    <button
                      className={`btn btn-secondary board-control-btn${showGrades ? ' board-control-btn--active' : ''}`}
                      onClick={() => setShowGrades(v => !v)}
                      title={showGrades ? 'Hide move badges' : 'Show move badges'}
                      aria-pressed={showGrades}
                    >
                      Badges
                    </button>
                  </div>
                </div>
                {openingName && (
                  <div className="opening-label">{openingName}</div>
                )}
              </div>
              </ErrorBoundary>

              {/* ── Right panel ─────────────────────────────────────── */}
              <div className="side-col">
                <div className="panel-tabs">
                  <button
                    className={`panel-tab${panelTab === 'load' ? ' active' : ''}`}
                    onClick={() => setPanelTab('load')}
                  >
                    Load
                  </button>
                  <button
                    className={`panel-tab${panelTab === 'analysis' ? ' active' : ''}`}
                    onClick={() => setPanelTab('analysis')}
                  >
                    Analysis
                  </button>
                  {COACHING_ENABLED && (
                    <button
                      className={`panel-tab${panelTab === 'coach' ? ' active' : ''}`}
                      onClick={() => setPanelTab('coach')}
                    >
                      Coach
                    </button>
                  )}
                </div>

                <div className="side-panel-content">
                  <ErrorBoundary
                    boundaryName={`review-panel-${panelTab}`}
                    resetKey={reviewBoundaryKey}
                    fallback={renderBoundaryFallback(
                      panelTab === 'load'
                        ? 'Import unavailable'
                        : panelTab === 'coach'
                          ? 'Coach unavailable'
                          : 'Analysis unavailable',
                      panelTab === 'load'
                        ? 'The import panel crashed. Switch tabs or reload to try again.'
                        : panelTab === 'coach'
                          ? 'The coaching panel crashed. Your game is still loaded and the board is safe.'
                          : 'The analysis panel crashed. Switch tabs or reload to recover it.',
                    )}
                  >
                  {panelTab === 'analysis' && isLoaded && (
                    <>
                      {/* Engine / analyzing status */}
                      {engineStatus === 'error' && (
                        <div className="analyzing-bar analyzing-bar--error">
                          <span className="analyzing-text">⚠ Engine failed to load</span>
                        </div>
                      )}
                      {engineStatus === 'loading' && !isReady && (
                        <div className="analyzing-bar">
                          <span className="analyzing-dot" />
                          <span className="analyzing-text">Engine loading…</span>
                        </div>
                      )}
                      {analysisStatusBar}

                      {!hideLoadedReviewArtifacts && shouldRenderEvalDisplay && (
                        <div className="eval-display">
                          {displayedEvalText && (
                            <span className="eval-display-value">
                              {displayedEvalText}
                            </span>
                          )}
                          {currentAnalysisDepth > 0 ? (
                            <span className="eval-display-depth">depth: {currentAnalysisDepth} / {POSITION_MAX_DEPTH}{isAnalyzingPosition ? ' …' : ''}</span>
                          ) : isAnalyzingPosition ? (
                            <span className="eval-display-depth">analyzing…</span>
                          ) : mainEval && !inBranch ? (
                            <span className="eval-display-depth">depth {mainEval.eval.depth}</span>
                          ) : null}
                        </div>
                      )}
                      
                      {!hideLoadedReviewArtifacts && (
                        <BestLines
                          lines={visibleLines}
                          isAnalyzingPosition={isAnalyzingPosition}
                          onLineClick={handleAnalysisBestLineClick}
                        />
                      )}

                      {!showAnalyzingBar && moveEvals.length > 0 && (
                        <EvalGraph
                          moveEvals={moveEvals}
                          totalMoves={totalMoves}
                          currentMoveIndex={currentMoveIndex}
                          onNavigate={handleGoToMove}
                          criticalMoments={criticalMoments}
                          viewMode={viewMode}
                        />
                      )}

                      {!showAnalyzingBar && (
                        <GameReport
                          moveEvals={moveEvals}
                          userColor={userColor}
                          analysisComplete={analysisComplete}
                        />
                      )}

                      <MoveList
                        tree={moveTree}
                        rootId={rootId}
                        currentPath={currentPath}
                        moveGrades={moveGrades}
                        moveDeltas={moveDeltas}
                        branchGrades={showGrades && !hideLoadedReviewArtifacts ? branchGrades : undefined}
                        pendingBranchNodes={showGrades && !hideLoadedReviewArtifacts ? pendingBranchNodes : undefined}
                        onNodeClick={handleNavigateTo}
                        isAnalyzing={showAnalyzingBar || !showGrades}
                        rootBranchIds={rootBranchIds}
                      />
                    </>
                  )}

                  {panelTab === 'coach' && isLoaded && !COACHING_ENABLED && (
                    <div className="coming-soon-panel">
                      <h3>AI Coaching</h3>
                      <p>Our AI coach is coming soon &mdash; it analyzes your critical moments and teaches you the chess principles behind why positions go wrong.</p>
                      <p className="coming-soon-sub">Game review, eval bar, and best lines are fully live now.</p>
                    </div>
                  )}
                  {panelTab === 'coach' && isLoaded && COACHING_ENABLED && (
                    <>
                      {/* Engine / analyzing status */}
                      {engineStatus === 'error' && (
                        <div className="analyzing-bar analyzing-bar--error">
                          <span className="analyzing-text">⚠ Engine failed to load</span>
                        </div>
                      )}
                      {engineStatus === 'loading' && !isReady && (
                        <div className="analyzing-bar">
                          <span className="analyzing-dot" />
                          <span className="analyzing-text">Engine loading…</span>
                        </div>
                      )}
                      {analysisStatusBar}

                      {/* Eval display */}
                      {!hideLoadedReviewArtifacts && shouldRenderEvalDisplay && (
                        <div className="eval-display">
                            {displayedEvalText && (
                              <span className="eval-display-value">
                                {displayedEvalText}
                              </span>
                            )}
                            {currentAnalysisDepth > 0 ? (
                              <span className="eval-display-depth">depth: {currentAnalysisDepth} / {POSITION_MAX_DEPTH}{isAnalyzingPosition ? ' …' : ''}</span>
                            ) : isAnalyzingPosition ? (
                              <span className="eval-display-depth">analyzing…</span>
                            ) : mainEval && !inBranch ? (
                              <span className="eval-display-depth">depth {mainEval.eval.depth}</span>
                            ) : null}

                          </div>
                      )}

                      {/* Coach comment box — where the graph/report was */}
                      <MoveCoachComment
                        moveComments={coachMoveComments}
                        lessons={coachLessons}
                        currentMoveIndex={currentMoveIndex}
                        branchComment={branchComment}
                        inBranch={inBranch}
                        onGoToMove={handleGoToMove}
                        isAnalyzing={isAnalyzing}
                        onShowBestMove={handleShowBestMove}
                      />

                      {/* Move list — same as Analysis tab */}
                      <MoveList
                        tree={moveTree}
                        rootId={rootId}
                        currentPath={currentPath}
                        moveGrades={moveGrades}
                        moveDeltas={moveDeltas}
                        branchGrades={showGrades && !hideLoadedReviewArtifacts ? branchGrades : undefined}
                        pendingBranchNodes={showGrades && !hideLoadedReviewArtifacts ? pendingBranchNodes : undefined}
                        onNodeClick={handleNavigateTo}
                        isAnalyzing={showAnalyzingBar || !showGrades}
                        rootBranchIds={rootBranchIds}
                      />
                    </>
                  )}

                  {panelTab === 'coach' && !isLoaded && (
                    <MoveCoachComment
                      moveComments={[]}
                      lessons={[]}
                      currentMoveIndex={0}
                      branchComment={sandboxBranchComment}
                      inBranch={sandboxCurrentNodeId !== null && (sandboxBranchComment !== null || pendingBranchNodes.has(sandboxCurrentNodeId))}
                    />
                  )}

                  <div className="load-panel" style={{ display: panelTab === 'load' ? undefined : 'none' }}>
                      <div className="import-tabs">
                        <button
                          className={`import-tab${importTab === 'chesscom' ? ' active' : ''}`}
                          onClick={() => setImportTab('chesscom')}
                        >Chess.com</button>
                        <button
                          className={`import-tab${importTab === 'lichess' ? ' active' : ''}`}
                          onClick={() => setImportTab('lichess')}
                        >Lichess</button>
                        <button
                          className={`import-tab${importTab === 'pgn' ? ' active' : ''}`}
                          onClick={() => setImportTab('pgn')}
                        >PGN</button>
                      </div>

                      {importTab === 'chesscom' && (
                        <>
                          <AccountLink
                            platform="chesscom"
                            onGamesLoaded={(games, uname, pagination) => {
                              setChesscomGames(games as ChessComGame[])
                              setChesscomUsername(uname)
                              setChesscomPagination(pagination)
                              cacheRatingsFromGameList(games as ChessComGame[], uname, 'chesscom')
                            }}
                            onGamesAppended={(newGames, newPagination) => {
                              setChesscomGames(prev => {
                                const existing = new Set(prev.map(g => (g as ChessComGame).url))
                                const fresh = (newGames as ChessComGame[]).filter(g => !existing.has(g.url))
                                const merged = [...fresh, ...prev]
                                try {
                                  localStorage.setItem(
                                    `deepmove_gamelist_chesscom_${chesscomUsername.toLowerCase()}`,
                                    JSON.stringify({ games: merged.slice(0, 2000), pagination: newPagination, fetchedAt: Date.now() })
                                  )
                                } catch {}
                                return merged
                              })
                            }}
                            newestEndTime={chesscomGames.length > 0 ? Math.max(...chesscomGames.map(g => (g as ChessComGame).end_time)) : undefined}
                          />
                          {chesscomGames.length > 0 && (
                            <GameSelector
                              games={chesscomGames}
                              username={chesscomUsername}
                              platform="chesscom"
                              onGameLoaded={() => setPanelTab('analysis')}
                              onBeforeGameLoad={handleBeforeGameLoad}
                              pagination={chesscomPagination}
                                              onGamesAppended={(newGames, newPagination) => {
                                const isPaginationComplete = 'fetchedArchives' in newPagination && 'allArchives' in newPagination
                                setChesscomGames(prev => {
                                  const existing = new Set(prev.map(g => (g as ChessComGame).url))
                                  const fresh = (newGames as ChessComGame[]).filter(g => !existing.has(g.url))
                                  const merged = [...prev, ...fresh]
                                  if (isPaginationComplete) {
                                    try {
                                      localStorage.setItem(
                                        `deepmove_gamelist_chesscom_${chesscomUsername.toLowerCase()}`,
                                        JSON.stringify({ games: merged.slice(0, 2000), pagination: newPagination, fetchedAt: Date.now() })
                                      )
                                    } catch {}
                                  }
                                  return merged
                                })
                                if (isPaginationComplete) {
                                  setChesscomPagination(newPagination)
                                }
                              }}
                            />
                          )}
                        </>
                      )}

                      {importTab === 'lichess' && (
                        <>
                          <AccountLink
                            platform="lichess"
                            onGamesLoaded={(games, uname, pagination) => {
                              setLichessGames(games as LichessGame[])
                              setLichessUsername(uname)
                              setLichessPagination(pagination)
                              cacheRatingsFromGameList(games as LichessGame[], uname, 'lichess')
                            }}
                            onGamesAppended={(newGames, _newPagination) => {
                              setLichessGames(prev => {
                                const existing = new Set(prev.map(g => (g as LichessGame).id))
                                const fresh = (newGames as LichessGame[]).filter(g => !existing.has((g as LichessGame).id))
                                const merged = [...fresh, ...prev]
                                try {
                                  localStorage.setItem(
                                    `deepmove_gamelist_lichess_${lichessUsername.toLowerCase()}`,
                                    JSON.stringify({ games: merged.slice(0, 2000), pagination: lichessPagination, fetchedAt: Date.now() })
                                  )
                                } catch {}
                                return merged
                              })
                            }}
                            newestEndTime={lichessGames.length > 0
                              ? Math.max(...lichessGames.map(g => (g as LichessGame).lastMoveAt ?? 0))
                              : undefined}
                          />
                          {lichessGames.length > 0 && (
                            <GameSelector
                              games={lichessGames}
                              username={lichessUsername}
                              platform="lichess"
                              onGameLoaded={() => setPanelTab('analysis')}
                              onBeforeGameLoad={handleBeforeGameLoad}
                              pagination={lichessPagination}
                                              onGamesAppended={(newGames, newPagination) => {
                                setLichessGames(prev => {
                                  const existing = new Set(prev.map(g => (g as LichessGame).id))
                                  const fresh = (newGames as LichessGame[]).filter(g => !existing.has(g.id))
                                  const merged = [...prev, ...fresh]
                                  try {
                                    localStorage.setItem(
                                      `deepmove_gamelist_lichess_${lichessUsername.toLowerCase()}`,
                                      JSON.stringify({ games: merged.slice(0, 2000), pagination: newPagination, fetchedAt: Date.now() })
                                    )
                                  } catch {}
                                  return merged
                                })
                                setLichessPagination(newPagination)
                              }}
                            />
                          )}
                        </>
                      )}

                      {importTab === 'pgn' && (
                        <ImportPanel
                          onFenLoad={(fen) => {
                            reset()
                            analysisBoardReset(fen)
                          }}
                        />
                      )}
                    </div>

                  {panelTab === 'analysis' && !isLoaded && (
                    <>
                      {parseError && (
                        <div className="panel-empty">
                          <span className="parse-error">Couldn't read this PGN format. Try copying directly from Chess.com or Lichess.</span>
                        </div>
                      )}

                      {/* Eval display + best lines — works in free-play/analysis mode */}
                      {(posLine || isAnalyzingPosition || isReady) && shouldRenderEvalDisplay && (
                        <div className="eval-display">
                          {displayedEvalText && (
                            <span className="eval-display-value">
                              {displayedEvalText}
                            </span>
                          )}
                          {currentAnalysisDepth > 0 ? (
                            <span className="eval-display-depth">depth: {currentAnalysisDepth} / {POSITION_MAX_DEPTH}{isAnalyzingPosition ? ' …' : ''}</span>
                          ) : isAnalyzingPosition ? (
                            <span className="eval-display-depth">analyzing…</span>
                          ) : null}

                        </div>
                      )}

                      <BestLines
                        lines={visibleLines}
                        isAnalyzingPosition={isAnalyzingPosition}
                        onLineClick={handleAnalysisBestLineClick}
                      />

                      {/* Analysis board move tree */}
                      {analysisRootId ? (
                        <>
                          <MoveList
                            tree={analysisTree}
                            rootId={analysisRootId}
                            currentPath={analysisPath}
                            moveGrades={[]}
                            branchGrades={showGrades ? branchGrades : undefined}
                            pendingBranchNodes={showGrades ? pendingBranchNodes : undefined}
                            onNodeClick={(path) => {
                              pathKeyRef.current++
                              const destId = path[path.length - 1]
                              if (destId && !branchGrades.has(destId)) {
                                setPendingBranchNodes(prev => { const s = new Set(prev); s.add(destId); return s })
                              }
                              analysisBoardNavigateTo(path)
                            }}
                            isAnalyzing={!showGrades}
                            rootBranchIds={analysisRootBranchIds}
                          />
                          {analysisMainLineSans.length > 0 && (
                            <button
                              className="btn btn-primary"
                              style={{ marginTop: '0.75rem' }}
                              onClick={handleLoadSandboxAsGame}
                            >
                              Go to Review
                            </button>
                          )}
                        </>
                      ) : (
                        <div className="panel-empty">Move pieces on the board to start an analysis.</div>
                      )}
                    </>
                  )}
                  </ErrorBoundary>
                </div>
              </div>
              {shouldShowDesktopRail && (
                <div className="ad-col">
                  <AdBanner
                    slot={AD_CONFIG.desktopRailSlot}
                    sponsor={ACTIVE_SPONSOR}
                    placement="desktop-rail"
                    page="review"
                  />
                </div>
              )}
            </>
          )}

          {currentPage === 'dashboard' && <div className="stub-page">Dashboard coming soon.</div>}
          {currentPage === 'practice' && (
            <div className="practice-coming-soon-page">
              <div className="practice-coming-soon-board">
                <ChessBoard
                  fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
                  orientation="white"
                  interactive={false}
                  pathKey={0}
                />
              </div>
              <div className="coming-soon-overlay">
                <div className="coming-soon-card">
                  <h2>Coming Soon</h2>
                  <p>Opening practice is under construction.<br />Check back soon!</p>
                </div>
              </div>
            </div>
          )}
          {currentPage === 'settings' && (
            <ProfilePage
              onUsernameLinked={(platform, username) => {
                if (platform === 'chesscom') {
                  setChesscomUsername(username)
                  setImportTab('chesscom')
                } else {
                  setLichessUsername(username)
                  setImportTab('lichess')
                }
              }}
            />
          )}
          {currentPage === 'about' && (
            <AboutPage
              onOpenApp={() => goToPage('review')}
              onOpenPrivacy={() => goToPage('privacy')}
            />
          )}
          {currentPage === 'privacy' && (
            <PrivacyPage
              onOpenApp={() => goToPage('review')}
              onOpenAbout={() => goToPage('about')}
            />
          )}
          {currentPage === 'reset-password' && (
            <ResetPasswordPage onDone={() => goToPage('review')} />
          )}
          {currentPage === 'play' && (
            <ErrorBoundary
              boundaryName="play-page"
              resetKey={currentPage}
              fallback={renderBoundaryFallback(
                'Play page unavailable',
                'The bot play board crashed. Reload to start a new game.',
              )}
            >
              <BotPlayPage
                onNavigateToReview={() => goToPage('review')}
              />
            </ErrorBoundary>
          )}
          {shouldShowUtilityRail && (
            <aside className="ad-col utility-rail" aria-label="DeepMove utility links">
              <div className="utility-rail__panel">
                <span className="utility-rail__label">Ad Space</span>
                <div className="utility-rail__links">
                  <button className="app-footer__link utility-rail__link" onClick={() => goToPage('about')}>About</button>
                  <button className="app-footer__link utility-rail__link" onClick={() => goToPage('privacy')}>Privacy</button>
                  <a className="app-footer__link utility-rail__link" href={SUPPORT_GITHUB_ISSUES_URL} target="_blank" rel="noreferrer">Report Bug</a>
                </div>
              </div>
            </aside>
          )}
        </div>
        {!shouldShowUtilityRail && (
          <footer className="app-footer app-footer--stack">
            <button className="app-footer__link" onClick={() => goToPage('about')}>About</button>
            <button className="app-footer__link" onClick={() => goToPage('privacy')}>Privacy Policy</button>
            <a className="app-footer__link" href={SUPPORT_GITHUB_ISSUES_URL} target="_blank" rel="noreferrer">GitHub / Bug Report</a>
          </footer>
        )}
        {shouldShowMobileSponsor && (
          <MobileAdBanner sponsor={ACTIVE_SPONSOR} page={mobileSponsorPage} />
        )}
      </div>
    </ResponsiveLayout>
  )
}
