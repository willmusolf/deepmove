import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import ChessBoard from './components/Board/ChessBoard'
import type { DrawShape } from './components/Board/ChessBoard'
import EvalBar from './components/Board/EvalBar'
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
import NavSidebar from './components/Layout/NavSidebar'
import type { Page } from './components/Layout/NavSidebar'
import ProfilePage from './components/Profile/ProfilePage'
import CoachPanel from './components/Coach/CoachPanel'
import { useGameReview } from './hooks/useGameReview'
import { useCoaching } from './hooks/useCoaching'
import { useStockfish } from './hooks/useStockfish'
import { useSound } from './hooks/useSound'
import { useAuthStore } from './stores/authStore'
import { useGameStore } from './stores/gameStore'
import type { TopLine } from './engine/stockfish'
import type { Key } from 'chessground/types'
import { STARTING_FEN } from './chess/constants'
import './styles/board.css'

// Lichess-style thickness brushes — all green, varying weight
const LINE_BRUSHES = ['bestMove', 'goodMove', 'okMove'] as const

type PanelTab = "analysis" | "load"
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
    navigateTo,
    addVariationMove,
    nextMainLineNode,
    rootBranchIds,
    isLoaded,
    whitePlayer,
    blackPlayer,
    whiteElo,
    blackElo,
    totalMoves,
    parseError,
  } = useGameReview()

  const reset = useGameStore(s => s.reset)
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
  const currentGameMeta = useGameStore(s => s.currentGameMeta)

  const { isReady, engineStatus, runAnalysis, analyzePositionLines, stopPositionAnalysis } = useStockfish()
  const { enabled: soundEnabled, toggle: toggleSound, playMoveSound } = useSound()

  const {
    lessons: coachLessons,
    currentIndex: coachIndex,
    setCurrentIndex: setCoachIndex,
    revealLesson: revealCoachLesson,
  } = useCoaching({
    criticalMoments,
    moveEvals,
    pgn: pgn ?? '',
    userElo,
    timeControl: currentGameMeta?.timeControl ?? '600',
  })

  // Silent auth refresh on app load — non-blocking, app works without it
  const authRefresh = useAuthStore(s => s.refresh)
  useEffect(() => { void authRefresh() }, [authRefresh])

  const [currentAnalysisDepth, setCurrentAnalysisDepth] = useState(0)
  // FEN → TopLine[] cache so revisiting a position never re-analyzes
  const positionCache = useRef<Map<string, TopLine[]>>(new Map())
  const pathKeyRef = useRef(0)
  // Hold last valid eval so the bar never receives undefined (prevents 50/50 flash)
  const lastEvalRef = useRef({ cp: 0, isMate: false, mateIn: null as number | null })

  // Trigger full-game analysis whenever a new game loads and the engine is ready
  const setSkipNextAnalysis = useGameStore(s => s.setSkipNextAnalysis)
  useEffect(() => {
    if (pgn && isReady) {
      if (useGameStore.getState().skipNextAnalysis) {
        setSkipNextAnalysis(false)
        return
      }
      positionCache.current.clear()
      lastEvalRef.current = { cp: 0, isMate: false, mateIn: null }
      void runAnalysis(pgn)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pgn, isReady])

  const [boardFen, setBoardFen] = useState(STARTING_FEN)
  const displayFen = isLoaded ? currentFen : boardFen

  // Per-position multi-PV analysis — runs whenever current position changes.
  // Also runs in free-play mode when pieces are pushed on the board.
  // Results cached by FEN so revisiting a position is instant.
  const positionTokenRef = useRef(0)

  useEffect(() => {
    // Always abort any in-flight position analysis immediately on position change.
    setCurrentPositionLines([])
    stopPositionAnalysis()

    const cached = positionCache.current.get(displayFen)
    if (cached) {
      setCurrentPositionLines(cached)
      setCurrentAnalysisDepth(cached[0]?.depth ?? 0)
      setAnalyzingPosition(false)
      return
    }

    // 400ms debounce — prevents queue flooding during rapid arrow-key navigation
    const token = ++positionTokenRef.current
    const timer = setTimeout(() => {
      setAnalyzingPosition(true)
      setCurrentAnalysisDepth(0)

      analyzePositionLines(displayFen, 22, 3, (lines, depth) => {
        if (positionTokenRef.current !== token) return
        setCurrentPositionLines(lines)
        setCurrentAnalysisDepth(depth)
      })
        .then(lines => {
          if (positionTokenRef.current !== token) return
          positionCache.current.set(displayFen, lines)
          setCurrentPositionLines(lines)
          setCurrentAnalysisDepth(lines[0]?.depth ?? 0)
          setAnalyzingPosition(false)
        })
        .catch(() => {
          if (positionTokenRef.current !== token) return
          setAnalyzingPosition(false)
        })
    }, 150)

    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayFen])

  const [orientation, setOrientation] = useState<'white' | 'black'>('white')

  // Auto-orient board when a new game loads
  useEffect(() => {
    if (pgn) setOrientation(userColor ?? 'white')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pgn])

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
  const [viewMode, setViewMode] = useState<'classic' | 'coach'>('classic')
  const [showArrows, setShowArrows] = useState(true)


  // Last-move highlight: always reflects the actual last move in currentPath
  // so chessground never shows a stale highlight after navigating back.
  const lastMoveNode = currentPath.length > 0 ? moveTree[currentPath[currentPath.length - 1]] : undefined
  const boardLastMove = lastMoveNode
    ? [lastMoveNode.from, lastMoveNode.to] as [Key, Key]
    : undefined

  useEffect(() => {
    if (isLoaded) setPanelTab('analysis')
  }, [isLoaded])

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
      if (!isLoaded) return
      const active = document.activeElement
      if (active?.tagName === 'TEXTAREA' || active?.tagName === 'INPUT') return
      if (e.key === 'ArrowLeft') { e.preventDefault(); goBackFn() }
      if (e.key === 'ArrowRight') { e.preventDefault(); goForwardFn() }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isLoaded, goBackFn, goForwardFn])

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

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleNewGame() {
    reset()
    lastEvalRef.current = { cp: 0, isMate: false, mateIn: null }
    positionCache.current.clear()
    setBoardFen(STARTING_FEN)
    setPanelTab('load')
  }

  // Board move during game review: advance main line or create branch.
  function handleBoardMove(from: string, to: string, san: string, newFen: string) {
    pathKeyRef.current++
    playMoveSound(san)
    const next = nextMainLineNode
    if (next && next.from === from && next.to === to && next.san === san) {
      goForward()
    } else {
      addVariationMove(from, to, san, newFen)
    }
  }

  // Best Lines click: enter first move of that PV as a branch
  function handleNavigateTo(path: string[]) {
    pathKeyRef.current++
    const nodeId = path[path.length - 1]
    if (nodeId && moveTree[nodeId]) playMoveSound(moveTree[nodeId].san)
    navigateTo(path)
  }

  function handleGoToMove(index: number) {
    pathKeyRef.current++
    if (index > 0 && index <= moves.length) playMoveSound(moves[index - 1])
    goToMove(index)
  }

  // Are we currently in a branch (off the main line)?
  const inBranch = currentPath.length > 0 && !moveTree[currentPath[currentPath.length - 1]]?.isMainLine

  // ── Eval ───────────────────────────────────────────────────────────────────

  // For the eval bar: prefer the stable full-game eval on the main line.
  // Only fall back to multi-PV posLine in branches (no mainEval) or before full-game analysis.
  const posLine = currentPositionLines[0]
  const mainEval = currentMoveIndex > 0 ? moveEvals[currentMoveIndex - 1] : undefined
  const useMainEval = mainEval && !inBranch
  const evalCp = useMainEval ? mainEval.eval.score : (posLine?.score ?? mainEval?.eval.score)
  const evalIsMate = useMainEval ? (mainEval.eval.isMate ?? false) : (posLine?.isMate ?? mainEval?.eval.isMate ?? false)
  const evalMateIn = useMainEval ? (mainEval.eval.mateIn ?? null) : (posLine?.mateIn ?? mainEval?.eval.mateIn ?? null)

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

  // Show 1-3 lines based on how close alternatives are to the best move.
  // If the 2nd line is within 200cp it's genuinely playable — show it.
  // If the 3rd line is within 100cp of the best it's worth showing too.
  const visibleLines = useMemo(() => {
    const lines = currentPositionLines
    if (lines.length === 0) return []
    const best = lines[0].score
    return lines.filter((line, i) => {
      if (i === 0) return true
      const gap = Math.abs(line.score - best)
      if (i === 1) return gap <= 200
      if (i === 2) return gap <= 100
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

  const moveGrades = useMemo(() => moveEvals.map(me => me.grade), [moveEvals])
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
                  {showEvalBar && (
                    <EvalBar
                      evalCentipawns={stableEvalCp}
                      isMate={stableIsMate}
                      mateIn={stableMateIn}
                      orientation={orientation}
                    />
                  )}
                  <div className="board-and-players">
                    {isLoaded && (
                      <PlayerInfoBox
                        username={topPlayer.name}
                        elo={topPlayer.elo}
                        isWhite={orientation !== 'white'}
                        isToMove={topIsToMove}
                        currentFen={displayFen}
                        platform={platform}
                        clockTime={topClock}
                      />
                    )}
                    <ChessBoard
                      key={isLoaded ? 'review' : 'freeplay'}
                      fen={displayFen}
                      orientation={orientation}
                      interactive={true}
                      onMove={isLoaded
                        ? handleBoardMove
                        : (_f, _t, san, newFen) => { playMoveSound(san); setBoardFen(newFen) }
                      }
                      shapes={showArrows ? boardShapes : []}
                      lastMove={isLoaded ? boardLastMove : undefined}
                      pathKey={pathKeyRef.current}
                    />
                    {isLoaded && (
                      <PlayerInfoBox
                        username={bottomPlayer.name}
                        elo={bottomPlayer.elo}
                        isWhite={orientation === 'white'}
                        isToMove={!topIsToMove}
                        currentFen={displayFen}
                        platform={platform}
                        clockTime={bottomClock}
                      />
                    )}
                  </div>
                </div>

                <div className="board-controls">
                  {isLoaded && (
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
                    <button className="btn btn-secondary" onClick={() => setBoardFen(STARTING_FEN)}>Reset</button>
                  )}
                  <button
                    className="btn btn-secondary"
                    onClick={() => setShowEvalBar(v => !v)}
                    title={showEvalBar ? 'Hide eval bar' : 'Show eval bar'}
                  >
                    Eval
                  </button>
                  <button
                    className={`btn btn-secondary${soundEnabled ? '' : ' muted'}`}
                    onClick={toggleSound}
                    title={soundEnabled ? 'Mute sounds' : 'Unmute sounds'}
                  >
                    {soundEnabled ? 'SFX' : 'Mute'}
                  </button>
                  <button
                    className={`btn btn-secondary btn-view-mode ${viewMode}`}
                    onClick={() => setViewMode(v => v === 'classic' ? 'coach' : 'classic')}
                    title={viewMode === 'classic' ? 'Switch to Coach mode' : 'Switch to Classic mode'}
                  >
                    {viewMode === 'classic' ? 'Classic' : 'Coach'}
                  </button>
                  <button
                    className={`btn btn-secondary${showArrows ? '' : ' muted'}`}
                    onClick={() => setShowArrows(v => !v)}
                    title={showArrows ? 'Hide suggestion arrows' : 'Show suggestion arrows'}
                  >
                    {showArrows ? 'Arrows' : 'Arrows'}
                  </button>
                </div>
              </div>

              {/* ── Right panel ─────────────────────────────────────── */}
              <div className="side-col">
                {/* In coach mode, show coaching panel above the tabs */}
                {viewMode === 'coach' && isLoaded && !isAnalyzing && (
                  <CoachPanel
                    lessons={coachLessons}
                    currentIndex={coachIndex}
                    onNavigate={setCoachIndex}
                    onReveal={revealCoachLesson}
                  />
                )}

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
                          {mainEval && !inBranch && (
                            <span className="eval-display-depth">depth {mainEval.eval.depth}</span>
                          )}
                          {isAnalyzingPosition && (
                            <span className="eval-display-depth">analyzing…</span>
                          )}
                        </div>
                      )}

                      {/* Eval graph — hidden during analysis, shown after completion */}
                      {!isAnalyzing && moveEvals.length > 0 && (
                        <EvalGraph
                          moveEvals={moveEvals}
                          totalMoves={totalMoves}
                          currentMoveIndex={currentMoveIndex}
                          onNavigate={handleGoToMove}
                          criticalMoments={criticalMoments}
                          viewMode={viewMode}
                        />
                      )}

                      {/* Game report — only after analysis completes */}
                      {!isAnalyzing && moveEvals.length > 0 && (
                        <GameReport moveEvals={moveEvals} userColor={userColor} />
                      )}

                      {/* Move list — tree renderer */}
                      <MoveList
                        tree={moveTree}
                        rootId={rootId}
                        currentPath={currentPath}
                        moveGrades={moveGrades}
                        onNodeClick={handleNavigateTo}
                        isAnalyzing={isAnalyzing}
                        rootBranchIds={rootBranchIds}
                      />
                    </>
                  )}

                  {panelTab === 'load' && (
                    <div className="load-panel">
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
                            }}
                          />
                          {chesscomGames.length > 0 && (
                            <GameSelector
                              games={chesscomGames}
                              username={chesscomUsername}
                              platform="chesscom"
                              onGameLoaded={() => setPanelTab('analysis')}
                              pagination={chesscomPagination}
                              onGamesAppended={(newGames, newPagination) => {
                                setChesscomGames(prev => [...prev, ...(newGames as ChessComGame[])])
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
                            }}
                          />
                          {lichessGames.length > 0 && (
                            <GameSelector
                              games={lichessGames}
                              username={lichessUsername}
                              platform="lichess"
                              onGameLoaded={() => setPanelTab('analysis')}
                              pagination={lichessPagination}
                              onGamesAppended={(newGames, newPagination) => {
                                setLichessGames(prev => [...prev, ...(newGames as LichessGame[])])
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
                            setBoardFen(fen)
                          }}
                        />
                      )}
                    </div>
                  )}

                  {panelTab === 'analysis' && !isLoaded && (
                    <>
                      {parseError && (
                        <div className="panel-empty">
                          <span className="parse-error">Couldn't read this PGN format. Try copying directly from Chess.com or Lichess.</span>
                        </div>
                      )}

                      {/* Eval display — works in free-play mode */}
                      {posLine && (
                        <div className="eval-display">
                          <span className="eval-display-value">
                            {formatEval(stableEvalCp, stableIsMate, stableMateIn)}
                          </span>
                          {isAnalyzingPosition && (
                            <span className="eval-display-depth">analyzing…</span>
                          )}
                          {!isAnalyzingPosition && currentAnalysisDepth > 0 && (
                            <span className="eval-display-depth">depth {currentAnalysisDepth}</span>
                          )}
                        </div>
                      )}

                      {/* Best lines in free-play */}

                      {!posLine && !isAnalyzingPosition && (
                        <div className="panel-empty">Push pieces on the board to see evaluation.</div>
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
        </div>
      </div>
    </div>
  )
}
