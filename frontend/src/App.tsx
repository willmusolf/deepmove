import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import ChessBoard from './components/Board/ChessBoard'
import type { DrawShape } from './components/Board/ChessBoard'
import EvalBar from './components/Board/EvalBar'
import EvalGraph from './components/Board/EvalGraph'
import MoveList from './components/Board/MoveList'
import PlayerInfoBox from './components/Board/PlayerInfoBox'
import ImportPanel from './components/Import/ImportPanel'
import AccountLink from './components/Import/AccountLink'
import type { PaginationState } from './components/Import/AccountLink'
import GameSelector from './components/Import/GameSelector'
import type { ChessComGame } from './api/chesscom'
import type { LichessGame } from './api/lichess'
import NavSidebar from './components/Layout/NavSidebar'
import type { Page } from './components/Layout/NavSidebar'
import ProfilePage from './components/Profile/ProfilePage'
import MoveCoachComment from './components/Coach/MoveCoachComment'
import BotPlayPage from './components/Play/BotPlayPage'
import { useGameReview } from './hooks/useGameReview'
import { useAnalysisBoard } from './hooks/useAnalysisBoard'
import BestLines from './components/Board/BestLines'
import { useCoaching } from './hooks/useCoaching'
import { useStockfish } from './hooks/useStockfish'
import { useSound } from './hooks/useSound'
import { useAuthStore } from './stores/authStore'
import { useGameStore } from './stores/gameStore'
import type { TopLine } from './engine/stockfish'
import { classifyMove } from './engine/analysis'
import type { MoveGrade } from './engine/analysis'
import type { Key } from 'chessground/types'
import { cacheRatingsFromGameList, readCachedRatings } from './components/Import/normalizeGame'
import { Chess } from 'chess.js'
import './styles/board.css'
import { detectOpening } from './chess/openings'

// Lichess-style thickness brushes — all green, varying weight
const LINE_BRUSHES = ['bestMove', 'goodMove', 'okMove'] as const

type PanelTab = "analysis" | "load" | "coach"
type ImportTab = "chesscom" | "lichess" | "pgn"

export default function App() {
  const {
    currentFen,
    moves,
    moveTree,
    rootId,
    currentPath,
    currentMoveIndex,
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

  const { isReady, engineStatus, runAnalysis, analyzePositionLines, analyzePositionSingleBg, stopPositionAnalysis } = useStockfish()
  const { enabled: soundEnabled, toggle: toggleSound, playMoveSound } = useSound()

  const {
    lessons: coachLessons,
    moveComments: coachMoveComments,
  } = useCoaching({
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
  const authUser = useAuthStore(s => s.user)
  useEffect(() => { void authRefresh() }, [authRefresh])

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
  const [pendingBranchNodes, setPendingBranchNodes] = useState<Set<string>>(new Set())
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
      setBranchGrades(new Map())
      setPendingBranchNodes(new Set())
      lastEvalRef.current = { cp: 0, isMate: false, mateIn: null }
      if (useGameStore.getState().skipNextAnalysis) {
        setSkipNextAnalysis(false)
        return
      }
      void runAnalysis(pgn)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pgn, isReady])

  const displayFen = isLoaded ? currentFen : analysisFen

  // Opening name — detected from move sequence in both modes
  const [openingName, setOpeningName] = useState<string | null>(null)

  // Opening detection for free-play mode — tracks main-line moves from the hook
  useEffect(() => {
    if (!isLoaded) setOpeningName(detectOpening(analysisMainLineSans))
  }, [isLoaded, analysisMainLineSans]) // eslint-disable-line react-hooks/exhaustive-deps

  // Per-position multi-PV analysis — runs whenever current position changes.
  // Also runs in free-play mode when pieces are pushed on the board.
  // Results cached by FEN so revisiting a position is instant.
  const positionTokenRef = useRef(0)
  // Key-hold detection: track timestamp of last nav event (arrow key only — not piece moves)
  const lastNavTimeRef = useRef(0)
  const navHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // When true, the next displayFen change is from a piece move — skip the 180ms deferral
  const isPieceMoveRef = useRef(false)

  function triggerPositionAnalysis(fen: string) {
    // NOTE: callers are responsible for calling stopPositionAnalysis() before this.
    // Do NOT call stopPositionAnalysis() here — it would send a second 'stop' command
    // to the worker, which races with the new analysis dispatch and kills it at low depth.

    const cached = positionCache.current.get(fen)
    if (cached) {
      setCurrentPositionLines(cached)
      setCurrentAnalysisDepth(cached[0]?.depth ?? 0)
      setAnalyzingPosition(false)
      return
    }

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
    } catch { /* invalid FEN — fall through with default 3 */ }

    const token = ++positionTokenRef.current
    setAnalyzingPosition(true)
    setCurrentAnalysisDepth(0)

    analyzePositionLines(fen, 16, numLines, (lines, depth) => {
      if (positionTokenRef.current !== token) return
      setCurrentPositionLines(lines)
      setCurrentAnalysisDepth(depth)
    })
      .then(lines => {
        if (positionTokenRef.current !== token) return
        if (lines.length > 0) positionCache.current.set(fen, lines)  // don't cache empty (engine not ready)
        setCurrentPositionLines(lines)
        setCurrentAnalysisDepth(lines[0]?.depth ?? 0)
        setAnalyzingPosition(false)
      })
      .catch(() => {
        if (positionTokenRef.current !== token) return
        setAnalyzingPosition(false)
      })
  }

  useEffect(() => {
    // Always cancel in-flight analysis and pending timers first — even if the new
    // position is cached.  Without this, a deferred 180ms timer for position A can
    // fire after the user has navigated to a cached position B, calling
    // triggerPositionAnalysis(fenA) which then hits the cache and sets stale arrows
    // without any token check.
    stopPositionAnalysis()
    if (navHoldTimerRef.current) clearTimeout(navHoldTimerRef.current)

    // Show cached result immediately — no blank flash, no delay
    const cached = positionCache.current.get(displayFen)
    if (cached) {
      setCurrentPositionLines(cached)
      setCurrentAnalysisDepth(cached[0]?.depth ?? 0)
      setAnalyzingPosition(false)
      return
    }

    if (!isReady) return  // engine not ready yet — isReady effect will seed analysis

    if (isPieceMoveRef.current) {
      // Piece move (drag or best-line click) — clear stale lines immediately so
      // skeleton loaders appear at once, then fire analysis with no deferral.
      isPieceMoveRef.current = false
      setCurrentPositionLines([])
      setCurrentAnalysisDepth(0)
      triggerPositionAnalysis(displayFen)
    } else {
      // Key-hold detection: if arrow-key nav events arrive faster than 100ms apart,
      // defer analysis until the user pauses.
      const now = Date.now()
      const gap = now - lastNavTimeRef.current
      lastNavTimeRef.current = now

      if (gap < 100) {
        // Flying through moves — check cache first for instant display
        const fastCached = positionCache.current.get(displayFen)
        if (fastCached) {
          setCurrentPositionLines(fastCached)
          setCurrentAnalysisDepth(fastCached[0]?.depth ?? 0)
          setAnalyzingPosition(false)
          return
        }
        // Not cached — clear stale arrows and defer analysis until user pauses
        setCurrentPositionLines([])
        setCurrentAnalysisDepth(0)
        navHoldTimerRef.current = setTimeout(() => {
          triggerPositionAnalysis(displayFen)
        }, 180)
      } else {
        // Single arrow key press — clear stale arrows immediately, then fire analysis.
        // Old arrows belong to a different position; showing them is misleading.
        setCurrentPositionLines([])
        setCurrentAnalysisDepth(0)
        triggerPositionAnalysis(displayFen)
      }
    }

    return () => {
      if (navHoldTimerRef.current) clearTimeout(navHoldTimerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayFen])

  // When engine becomes ready, analyze whatever position is currently displayed.
  // This is the main seed — displayFen effect skips analysis until engine is ready.
  useEffect(() => {
    if (!isReady) return
    triggerPositionAnalysis(displayFen)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady])

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

  // When game analysis finishes, auto-trigger position analysis so BestLines appear immediately.
  const wasAnalyzingRef = useRef(false)
  useEffect(() => {
    if (wasAnalyzingRef.current && !isAnalyzing && isLoaded && isReady) {
      triggerPositionAnalysis(displayFen)
    }
    wasAnalyzingRef.current = isAnalyzing
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAnalyzing])

  const [orientation, setOrientation] = useState<'white' | 'black'>('white')

  // Auto-orient board when a new game loads
  useEffect(() => {
    if (pgn) setOrientation(userColor ?? 'white')
  }, [pgn, userColor])

  // Opening detection for loaded games — update as user navigates
  useEffect(() => {
    if (isLoaded) {
      const movesUpToNow = moves.slice(0, currentMoveIndex)
      setOpeningName(detectOpening(movesUpToNow))
    }
  }, [isLoaded, moves, currentMoveIndex])

  const [panelTab, setPanelTab] = useState<PanelTab>('load')
  const [importTab, setImportTab] = useState<ImportTab>('chesscom')
  const [chesscomGames, setChesscomGames] = useState<ChessComGame[]>([])
  const [lichessGames, setLichessGames] = useState<LichessGame[]>([])
  const [chesscomUsername, setChesscomUsername] = useState('')
  const [lichessUsername, setLichessUsername] = useState('')
  const [chesscomPagination, setChesscomPagination] = useState<PaginationState | null>(null)
  const [lichessPagination, setLichessPagination] = useState<PaginationState | null>(null)
  const [currentPage, setCurrentPage] = useState<Page>('review')
  const [showEvalBar, setShowEvalBar] = useState(true)
  const viewMode = panelTab === 'coach' ? 'coach' : 'classic'
  const [showArrows, setShowArrows] = useState(true)
  const [showGrades, setShowGrades] = useState(true)


  // Last-move highlight: always reflects the actual last move in currentPath
  // so chessground never shows a stale highlight after navigating back.
  const lastMoveNode = currentPath.length > 0 ? moveTree[currentPath[currentPath.length - 1]] : undefined
  const boardLastMove = lastMoveNode
    ? [lastMoveNode.from, lastMoveNode.to] as [Key, Key]
    : undefined

  useEffect(() => {
    if (isLoaded) {
      // Clear any arrows that were showing in free-play mode so they don't flash
      // on the first position of the newly loaded game.
      setCurrentPositionLines([])
      setAnalyzingPosition(false)
      setPanelTab('analysis')
      analysisBoardReset()
      setBranchGrades(new Map())
      setPendingBranchNodes(new Set())
    } else {
      if (panelTab === 'coach') setPanelTab('analysis')
    }
  }, [isLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keyboard navigation ────────────────────────────────────────────────────

  const goBackFn = useCallback(() => {
    pathKeyRef.current++
    goBack()
  }, [goBack])

  const goForwardFn = useCallback(() => {
    pathKeyRef.current++
    const nextId = currentPath.length === 0
      ? rootId
      : moveTree[currentPath[currentPath.length - 1]]?.childIds[0]
    if (nextId) playMoveSound(moveTree[nextId]?.san ?? '')
    goForward()
  }, [currentPath, rootId, moveTree, goForward, playMoveSound])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const active = document.activeElement
      if (active?.tagName === 'TEXTAREA' || active?.tagName === 'INPUT') return
      if (isLoaded) {
        if (e.key === 'ArrowLeft') { e.preventDefault(); goBackFn() }
        if (e.key === 'ArrowRight') { e.preventDefault(); goForwardFn() }
      } else if (analysisRootId !== null) {
        if (e.key === 'ArrowLeft') { e.preventDefault(); analysisBoardGoBack() }
        if (e.key === 'ArrowRight') { e.preventDefault(); analysisBoardGoForward() }
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
    stopPositionAnalysis()
    positionTokenRef.current++
    if (navHoldTimerRef.current) clearTimeout(navHoldTimerRef.current)
    reset()
    lastEvalRef.current = { cp: 0, isMate: false, mateIn: null }
    positionCache.current.clear()
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
    reset()
    setStoredUserColor(null)
    setPgn(chess.pgn())
    setPanelTab('coach')
  }

  // Called by GameSelector before loading a new game — stops any in-flight
  // position analysis so stale arrows can't flash on the new game's position.
  function handleBeforeGameLoad() {
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

  async function evaluateBranchMove(nodeId: string, parentFen: string, newFen: string) {
    if (!isReady) return
    // Caller is responsible for adding nodeId to pendingBranchNodes BEFORE calling this.
    try {
      const chess = new Chess(parentFen)
      const legalCount = chess.moves().length
      const color: 'white' | 'black' = parentFen.split(' ')[1] === 'w' ? 'white' : 'black'

      const beforeResult = await analyzePositionSingleBg(parentFen, 4)
      const afterResult = await analyzePositionSingleBg(newFen, 4)

      if (!beforeResult || !afterResult) return

      const rawBefore = beforeResult.score
      const rawAfter = afterResult.score
      const evalBefore = color === 'white' ? rawBefore : -rawBefore
      const evalAfter  = color === 'white' ? -rawAfter : rawAfter

      const grade = classifyMove(evalBefore, evalAfter, color, legalCount)
      setBranchGrades(prev => new Map(prev).set(nodeId, grade))
    } catch (err) {
      console.warn('[branch eval] failed:', err)
    } finally {
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
      } catch (e) {
        console.warn('[handleShowBestMove] failed:', e)
      }
    })
  }

  function handleNavigateTo(path: string[]) {
    pathKeyRef.current++
    const nodeId = path[path.length - 1]
    if (nodeId && moveTree[nodeId]) playMoveSound(moveTree[nodeId].san)
    navigateTo(path)
  }

  // Free-play: enter first move of a best line (clicked in BestLines panel or via arrow)
  function handleAnalysisBestLineClick(line: TopLine) {
    const uci = line.pv[0]
    if (!uci || uci.length < 4) return
    const from = uci.slice(0, 2)
    const to = uci.slice(2, 4)
    const promotion = uci.length === 5 ? uci[4] : undefined
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



  const moveGrades = useMemo(() => moveEvals.map(me => me.grade), [moveEvals])

  // Are we currently in a branch (off the main line)?
  const inBranch = currentPath.length > 0 && !moveTree[currentPath[currentPath.length - 1]]?.isMainLine

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

  function formatEval(score: number | undefined, isMate: boolean, mateIn: number | null): string {
    if (score === undefined) return '—'
    if (isMate) return mateIn !== null ? `M${Math.abs(mateIn)}` : 'M'
    const pawns = (score / 100).toFixed(2)
    return score >= 0 ? `+${pawns}` : pawns
  }

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

  // ── Misc ───────────────────────────────────────────────────────────────────


  const showAnalyzingBar = isAnalyzing || (analyzedCount < totalMovesCount && totalMovesCount > 0)



  return (
    <div className="app">
      <NavSidebar currentPage={currentPage} onNavigate={setCurrentPage} />

      <div className="app-content">
        <div className="app-main">
          {currentPage === 'review' && (
            <>
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
                    <div style={{ position: 'relative' }}>
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
                      const BOARD_GRADE: Record<string, { symbol: string; color: string }> = {
                        brilliant:  { symbol: '!!', color: '#22d3ee' },
                        great:      { symbol: '!',  color: '#16a34a' },
                        best:       { symbol: '★',  color: '#22c55e' },
                        excellent:  { symbol: '✓',  color: '#4ade80' },
                        good:       { symbol: '·',  color: '#60a5fa' },
                        inaccuracy: { symbol: '?!', color: '#facc15' },
                        mistake:    { symbol: '?',  color: '#fb923c' },
                        blunder:    { symbol: '??', color: '#ef4444' },
                        miss:       { symbol: '✗',  color: '#a78bfa' },
                        forced:     { symbol: '→',  color: '#6b7280' },
                      }
                      // Determine current branch node for pending/grade lookup
                      const boardNodeId = isLoaded
                        ? (inBranch ? currentNodeId : null)
                        : (analysisPath.length > 0 ? analysisPath[analysisPath.length - 1] : null)
                      const grade = isLoaded
                        ? (inBranch && currentNodeId ? branchGrades.get(currentNodeId) : mainEval?.grade)
                        : (analysisPath.length > 0
                          ? branchGrades.get(analysisPath[analysisPath.length - 1])
                          : undefined)
                      const g = showGrades && grade ? BOARD_GRADE[grade] : null
                      const destSquare = isLoaded
                        ? (inBranch && currentNodeId ? moveTree[currentNodeId]?.to : boardLastMove?.[1])
                        : (analysisPath.length > 0
                          ? analysisTree[analysisPath[analysisPath.length - 1]]?.to
                          : undefined)
                      // Show pending spinner while branch eval is in flight, or while the
                      // engine is still loading (grade not yet available but will be retried).
                      const isPendingOnBoard = showGrades && boardNodeId !== null &&
                        pendingBranchNodes.has(boardNodeId)
                      if (isPendingOnBoard && destSquare) {
                        const file = destSquare.charCodeAt(0) - 97
                        const rank = parseInt(destSquare[1], 10) - 1
                        const leftCell = orientation === 'white' ? file : (7 - file)
                        const topCell  = orientation === 'white' ? (7 - rank) : rank
                        return (
                          <div
                            key={`${destSquare}-pending`}
                            className="board-grade-badge-pending"
                            style={{ left: `${(leftCell + 1) * 12.5}%`, top: `${topCell * 12.5}%` }}
                          />
                        )
                      }
                      if (!g || !destSquare) return null
                      const file = destSquare.charCodeAt(0) - 97
                      const rank = parseInt(destSquare[1], 10) - 1
                      const leftCell = orientation === 'white' ? file : (7 - file)
                      const topCell  = orientation === 'white' ? (7 - rank) : rank
                      return (
                        <div
                          key={destSquare}
                          className="board-grade-badge"
                          data-grade={grade ?? ''}
                          style={{
                            left: `${(leftCell + 1) * 12.5}%`,
                            top: `${topCell * 12.5}%`,
                            background: g.color,
                          }}
                        >
                          {g.symbol}
                        </div>
                      )
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
                  {isLoaded ? (
                    <>
                      <button className="nav-btn" onClick={goBackFn}
                        disabled={currentPath.length === 0}>←</button>
                      <span className="move-counter">
                        {currentMoveIndex} / {totalMoves}
                      </span>
                      <button className="nav-btn" onClick={goForwardFn}
                        disabled={
                          currentPath.length === 0
                            ? !rootId
                            : !moveTree[currentPath[currentPath.length - 1]]?.childIds[0]
                        }>→</button>
                    </>
                  ) : (
                    <>
                      <button className="nav-btn" onClick={analysisBoardGoBack}
                        disabled={analysisPath.length === 0}>←</button>
                      <span className="move-counter">
                        {analysisPath.length}{analysisMainLineSans.length > 0 ? ` / ${analysisMainLineSans.length}` : ""}
                      </span>
                      <button className="nav-btn" onClick={analysisBoardGoForward}
                        disabled={
                          analysisRootId === null
                            ? true
                            : analysisPath.length === 0
                              ? false
                              : !analysisTree[analysisPath[analysisPath.length - 1]]?.childIds[0]
                        }>→</button>
                    </>
                  )}
                  <button
                    className="btn btn-secondary"
                    onClick={() => setOrientation(o => o === 'white' ? 'black' : 'white')}
                  >
                    Flip
                  </button>
                  {isLoaded ? (
                    <button className="btn btn-secondary" onClick={handleNewGame}>New Game</button>
                  ) : (
                    <button className="btn btn-secondary" onClick={() => {
                      analysisBoardReset()
                      setBranchGrades(new Map())
                      setPendingBranchNodes(new Set())
                      setOpeningName(null)
                    }}>Reset</button>
                  )}
                  <button
                    className="btn btn-secondary"
                    onClick={() => setShowEvalBar(v => !v)}
                    title={showEvalBar ? 'Hide eval bar' : 'Show eval bar'}
                  >
                    Eval
                  </button>
                  <button
                    className={"btn btn-secondary"}
                    onClick={toggleSound}
                    title={soundEnabled ? 'Mute sounds' : 'Unmute sounds'}
                  >
                    {soundEnabled ? 'SFX' : 'Mute'}
                  </button>

                  <button
                    className={"btn btn-secondary"}
                    onClick={() => setShowArrows(v => !v)}
                    title={showArrows ? 'Hide suggestion arrows' : 'Show suggestion arrows'}
                  >
                    {showArrows ? 'Arrows' : 'Arrows'}
                  </button>
                  <button
                    className={`btn btn-secondary${showGrades ? ' active' : ''}`}
                    onClick={() => setShowGrades(v => !v)}
                    title={showGrades ? 'Hide move badges' : 'Show move badges'}
                  >
                    Badges
                  </button>
                </div>
                {openingName && (
                  <div className="opening-label">{openingName}</div>
                )}
              </div>

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
                  {isLoaded && <button
                    className={`panel-tab${panelTab === 'coach' ? ' active' : ''}`}
                    onClick={() => setPanelTab('coach')}
                  >
                    Coach
                  </button>}
                </div>

                <div className="side-panel-content">
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
                      {showAnalyzingBar && (
                        <div className="analyzing-bar">
                          {totalMovesCount > 0 && (
                            <div
                              className="analyzing-bar__fill"
                              style={{ width: `${Math.round((analyzedCount / totalMovesCount) * 100)}%` }}
                            />
                          )}
                          <span className="analyzing-dot" />
                          <span className="analyzing-text">
                            Analyzing…
                            {totalMovesCount > 0 && ` ${analyzedCount} / ${totalMovesCount}`}
                          </span>
                        </div>
                      )}

                      {/* Eval display — hidden during game analysis */}
                      {!showAnalyzingBar && (posLine || mainEval) && (
                        <div className="eval-display">
                          <span className="eval-display-value">
                            {formatEval(stableEvalCp, stableIsMate, stableMateIn)}
                          </span>
                          {currentAnalysisDepth > 0 ? (
                            <span className="eval-display-depth">depth: {currentAnalysisDepth} / 16{isAnalyzingPosition ? ' …' : ''}</span>
                          ) : isAnalyzingPosition ? (
                            <span className="eval-display-depth">analyzing…</span>
                          ) : mainEval && !inBranch ? (
                            <span className="eval-display-depth">depth {mainEval.eval.depth}</span>
                          ) : null}
                        </div>
                      )}


                      {/* Best lines + eval graph — hidden while game analysis is running */}
                      {!showAnalyzingBar && (
                        <BestLines
                          lines={visibleLines}
                          isAnalyzingPosition={isAnalyzingPosition}
                          onLineClick={handleAnalysisBestLineClick}
                          depth={currentAnalysisDepth}
                          targetDepth={16}
                        />
                      )}
                      {/* Eval graph — hidden during analysis, shown after completion */}
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

                      {/* Move list — tree renderer */}
                      <MoveList
                        tree={moveTree}
                        rootId={rootId}
                        currentPath={currentPath}
                        moveGrades={moveGrades}
                        branchGrades={showGrades ? branchGrades : undefined}
                        pendingBranchNodes={showGrades ? pendingBranchNodes : undefined}
                        onNodeClick={handleNavigateTo}
                        isAnalyzing={showAnalyzingBar || !showGrades}
                        rootBranchIds={rootBranchIds}
                      />
                    </>
                  )}

                  {panelTab === 'coach' && isLoaded && (
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
                      {showAnalyzingBar && (
                        <div className="analyzing-bar">
                          {totalMovesCount > 0 && (
                            <div
                              className="analyzing-bar__fill"
                              style={{ width: `${Math.round((analyzedCount / totalMovesCount) * 100)}%` }}
                            />
                          )}
                          <span className="analyzing-dot" />
                          <span className="analyzing-text">
                            Analyzing…
                            {totalMovesCount > 0 && ` ${analyzedCount} / ${totalMovesCount}`}
                          </span>
                        </div>
                      )}

                      {/* Eval display */}
                      {(posLine || mainEval) && (
                        <div className="eval-display">
                          <span className="eval-display-value">
                            {formatEval(stableEvalCp, stableIsMate, stableMateIn)}
                          </span>
                          {currentAnalysisDepth > 0 ? (
                            <span className="eval-display-depth">depth: {currentAnalysisDepth} / 16{isAnalyzingPosition ? ' …' : ''}</span>
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
                        branchGrades={showGrades ? branchGrades : undefined}
                        pendingBranchNodes={showGrades ? pendingBranchNodes : undefined}
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
                                setChesscomGames(prev => {
                                  const existing = new Set(prev.map(g => (g as ChessComGame).url))
                                  const fresh = (newGames as ChessComGame[]).filter(g => !existing.has(g.url))
                                  const merged = [...prev, ...fresh]
                                  try {
                                    localStorage.setItem(
                                      `deepmove_gamelist_chesscom_${chesscomUsername.toLowerCase()}`,
                                      JSON.stringify({ games: merged.slice(0, 2000), pagination: newPagination, fetchedAt: Date.now() })
                                    )
                                  } catch {}
                                  return merged
                                })
                                setChesscomPagination(newPagination)
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
                      {(posLine || isAnalyzingPosition) && (
                        <div className="eval-display">
                          <span className="eval-display-value">
                            {formatEval(stableEvalCp, stableIsMate, stableMateIn)}
                          </span>
                          {currentAnalysisDepth > 0 ? (
                            <span className="eval-display-depth">depth: {currentAnalysisDepth} / 16{isAnalyzingPosition ? ' …' : ''}</span>
                          ) : isAnalyzingPosition ? (
                            <span className="eval-display-depth">analyzing…</span>
                          ) : null}
                        </div>
                      )}

                      <BestLines
                        lines={visibleLines}
                        isAnalyzingPosition={isAnalyzingPosition}
                        onLineClick={handleAnalysisBestLineClick}
                        depth={currentAnalysisDepth}
                        targetDepth={16}
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
                            onNodeClick={(path) => { pathKeyRef.current++; analysisBoardNavigateTo(path) }}
                            isAnalyzing={!showGrades}
                            rootBranchIds={analysisRootBranchIds}
                          />
                          {analysisMainLineSans.length > 0 && (
                            <button
                              className="btn btn-primary"
                              style={{ marginTop: '0.75rem' }}
                              onClick={handleLoadSandboxAsGame}
                            >
                              Analyse with Coach
                            </button>
                          )}
                        </>
                      ) : (
                        <div className="panel-empty">Move pieces on the board to start an analysis.</div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          {currentPage === 'dashboard' && <div className="stub-page">Dashboard coming soon.</div>}
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
                setCurrentPage('review')
                setPanelTab('load')
              }}
            />
          )}
          {currentPage === 'about' && <div className="stub-page">About coming soon.</div>}
          {currentPage === 'play' && (
            <BotPlayPage
              analyzePositionLines={analyzePositionLines}
              stopPositionAnalysis={stopPositionAnalysis}
              onNavigateToReview={() => setCurrentPage('review')}
            />
          )}
        </div>
      </div>
    </div>
  )
}
