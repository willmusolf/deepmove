import { useState, useEffect, useRef, useCallback } from 'react'
import { Chess } from 'chess.js'
import ChessBoard from './components/Board/ChessBoard'
import type { DrawShape } from './components/Board/ChessBoard'
import EvalBar from './components/Board/EvalBar'
import EvalGraph from './components/Board/EvalGraph'
import GameReport from './components/Board/GameReport'
import MoveList from './components/Board/MoveList'
import BestLines from './components/Board/BestLines'
import PlayerInfoBox from './components/Board/PlayerInfoBox'
import ImportPanel from './components/Import/ImportPanel'
import AccountLink from './components/Import/AccountLink'
import GameSelector from './components/Import/GameSelector'
import type { ChessComGame } from './api/chesscom'
import type { LichessGame } from './api/lichess'
import NavSidebar from './components/Layout/NavSidebar'
import type { Page } from './components/Layout/NavSidebar'
import { useGameReview } from './hooks/useGameReview'
import { useStockfish } from './hooks/useStockfish'
import { useSound } from './hooks/useSound'
import { useGameStore } from './stores/gameStore'
import type { TopLine } from './engine/stockfish'
import type { Key } from 'chessground/types'
import './styles/board.css'

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
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
  const setAnalyzing = useGameStore(s => s.setAnalyzing)
  const userColor = useGameStore(s => s.userColor)
  const criticalMoments = useGameStore(s => s.criticalMoments)
  const platform = useGameStore(s => s.platform)

  const { isReady, engineStatus, runAnalysis, analyzePositionLines, stopPositionAnalysis } = useStockfish()
  const { enabled: soundEnabled, toggle: toggleSound, playMoveSound } = useSound()

  const [showBestLines, setShowBestLines] = useState(false)
  const [currentAnalysisDepth, setCurrentAnalysisDepth] = useState(0)
  // FEN → TopLine[] cache so revisiting a position never re-analyzes
  const positionCache = useRef<Map<string, TopLine[]>>(new Map())
  const pathKeyRef = useRef(0)

  // Trigger full-game analysis whenever a new game loads and the engine is ready
  useEffect(() => {
    if (pgn && isReady) {
      positionCache.current.clear()
      setAnalyzing(true)  // close race window: position analysis checks this before isAnalyzing propagates
      void runAnalysis(pgn)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pgn, isReady])

  // Per-position multi-PV analysis — runs whenever current position changes.
  // Results cached by FEN so revisiting a position is instant.
  const positionTokenRef = useRef(0)

  useEffect(() => {
    // Always abort any in-flight position analysis before doing anything else.
    // This prevents queue clogging on rapid navigation — the engine stops immediately
    // and starts fresh for the new position.
    stopPositionAnalysis()

    if (!isLoaded || isAnalyzing) {
      setCurrentPositionLines([])
      setCurrentAnalysisDepth(0)
      return
    }
    const cached = positionCache.current.get(currentFen)
    if (cached) {
      setCurrentPositionLines(cached)
      setCurrentAnalysisDepth(cached[0]?.depth ?? 0)
      setAnalyzingPosition(false)
      return
    }
    const token = ++positionTokenRef.current
    setAnalyzingPosition(true)
    setCurrentPositionLines([])
    setCurrentAnalysisDepth(0)

    analyzePositionLines(currentFen, 22, 3, (lines, depth) => {
      if (positionTokenRef.current !== token) return
      setCurrentPositionLines(lines)
      setCurrentAnalysisDepth(depth)
    })
      .then(lines => {
        if (positionTokenRef.current !== token) return
        positionCache.current.set(currentFen, lines)
        setCurrentPositionLines(lines)
        setCurrentAnalysisDepth(lines[0]?.depth ?? 0)
        setAnalyzingPosition(false)
      })
      .catch(() => {
        if (positionTokenRef.current !== token) return
        setAnalyzingPosition(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFen, isAnalyzing, isLoaded])

  const [orientation, setOrientation] = useState<'white' | 'black'>('white')

  // Auto-orient board when a new game loads
  useEffect(() => {
    if (pgn) setOrientation(userColor ?? 'white')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pgn])

  const [boardFen, setBoardFen] = useState(STARTING_FEN)
  const [panelTab, setPanelTab] = useState<PanelTab>('load')
  const [importTab, setImportTab] = useState<ImportTab>('chesscom')
  const [chesscomGames, setChesscomGames] = useState<ChessComGame[]>([])
  const [lichessGames, setLichessGames] = useState<LichessGame[]>([])
  const [chesscomUsername, setChesscomUsername] = useState('')
  const [lichessUsername, setLichessUsername] = useState('')
  const [currentPage, setCurrentPage] = useState<Page>('review')
  const [showEvalBar, setShowEvalBar] = useState(true)

  const displayFen = isLoaded ? currentFen : boardFen

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

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleNewGame() {
    reset()
    setBoardFen(STARTING_FEN)
    setPanelTab('load')
  }

  // Board move during game review: advance main line or create branch.
  // Guard: don't create root-level variations (currentPath empty = start position).
  function handleBoardMove(from: string, to: string, san: string, newFen: string) {
    pathKeyRef.current++
    playMoveSound(san)
    const next = nextMainLineNode
    if (next && next.from === from && next.to === to && next.san === san) {
      goForward()
    } else {
      if (currentPath.length === 0) return
      addVariationMove(from, to, san, newFen)
    }
  }

  // Best Lines click: enter first move of that PV as a branch
  function handleLineClick(line: TopLine) {
    if (line.pv.length === 0) return
    const uci = line.pv[0]
    const chess = new Chess(currentFen)
    const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? 'q' })
    if (move) {
      playMoveSound(move.san)
      addVariationMove(move.from, move.to, move.san, chess.fen())
    }
  }

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

  // ── Eval ───────────────────────────────────────────────────────────────────

  // Use per-position lines when available — works for both main line and branches
  const posLine = currentPositionLines[0]
  const mainEval = currentMoveIndex > 0 ? moveEvals[currentMoveIndex - 1] : undefined
  const evalCp = posLine?.score ?? mainEval?.eval.score
  const evalIsMate = posLine?.isMate ?? mainEval?.eval.isMate ?? false
  const evalMateIn = posLine?.mateIn ?? mainEval?.eval.mateIn ?? null

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
  function getVisibleLines(lines: TopLine[]): TopLine[] {
    if (lines.length === 0) return []
    const best = lines[0].score
    return lines.filter((line, i) => {
      if (i === 0) return true
      const gap = Math.abs(line.score - best)
      if (i === 1) return gap <= 200
      if (i === 2) return gap <= 100
      return false
    })
  }

  const visibleLines = getVisibleLines(currentPositionLines)

  const boardShapes: DrawShape[] = visibleLines
    .filter(l => l.pv.length >= 1)
    .map((line, i) => ({
      orig: line.pv[0].slice(0, 2) as Key,
      dest: line.pv[0].slice(2, 4) as Key,
      brush: LINE_BRUSHES[i] ?? 'okMove',
    }))

  // ── Misc ───────────────────────────────────────────────────────────────────

  const moveGrades = moveEvals.map(me => me.grade)
  const showAnalyzingBar = isAnalyzing || (analyzedCount < totalMovesCount && totalMovesCount > 0)

  // Are we currently in a branch (off the main line)?
  const inBranch = currentPath.length > 0 && !moveTree[currentPath[currentPath.length - 1]]?.isMainLine

  return (
    <div className="app">
      <NavSidebar currentPage={currentPage} onNavigate={setCurrentPage} />

      <div className="app-content">
        <div className="app-main">
          {currentPage === 'review' && (
            <>
              <div className="board-col">
                {isLoaded && (
                  <PlayerInfoBox
                    username={topPlayer.name}
                    elo={topPlayer.elo}
                    isWhite={orientation === 'white' ? false : true}
                    isToMove={topIsToMove}
                    currentFen={displayFen}
                    platform={platform}
                  />
                )}


                <div className="board-with-eval">
                  {showEvalBar && (
                    <EvalBar
                      evalCentipawns={evalCp}
                      isMate={evalIsMate}
                      mateIn={evalMateIn}
                      isAnalyzing={isAnalyzing}
                      orientation={orientation}
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
                    shapes={boardShapes}
                    lastMove={isLoaded ? boardLastMove : undefined}
                    pathKey={pathKeyRef.current}
                  />
                </div>

                {isLoaded && (
                  <PlayerInfoBox
                    username={bottomPlayer.name}
                    elo={bottomPlayer.elo}
                    isWhite={orientation === 'white' ? true : false}
                    isToMove={!topIsToMove}
                    currentFen={displayFen}
                    platform={platform}
                  />
                )}

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
                </div>
              </div>

              {/* ── Right panel ─────────────────────────────────────── */}
              <div className="side-col">
                <div className="panel-tabs">
                  <button
                    className={`panel-tab${panelTab === 'analysis' ? ' active' : ''}`}
                    onClick={() => setPanelTab('analysis')}
                    disabled={!isLoaded}
                  >
                    Analysis
                  </button>
                  <button
                    className={`panel-tab${panelTab === 'load' ? ' active' : ''}`}
                    onClick={() => setPanelTab('load')}
                  >
                    Load
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
                            {formatEval(evalCp, evalIsMate, evalMateIn)}
                          </span>
                          {mainEval && !inBranch && (
                            <span className="eval-display-depth">depth {mainEval.eval.depth}</span>
                          )}
                          {isAnalyzingPosition && (
                            <span className="eval-display-depth">analyzing…</span>
                          )}
                        </div>
                      )}

                      {/* Best lines toggle + panel */}
                      {!isAnalyzing && (
                        <div className="best-lines-section">
                          <button
                            className={`lines-toggle-btn${showBestLines ? ' active' : ''}`}
                            onClick={() => setShowBestLines(v => !v)}
                          >
                            {showBestLines ? 'Hide Lines' : 'Show Lines'}
                          </button>
                          {showBestLines && (
                            <BestLines
                              lines={visibleLines}
                              isAnalyzingPosition={isAnalyzingPosition}
                              onLineClick={handleLineClick}
                              depth={currentAnalysisDepth}
                            />
                          )}
                        </div>
                      )}

                      {/* Eval graph + report — only after analysis completes */}
                      {!isAnalyzing && moveEvals.length > 0 && (
                        <>
                          <EvalGraph
                            moveEvals={moveEvals}
                            totalMoves={totalMoves}
                            currentMoveIndex={currentMoveIndex}
                            onNavigate={handleGoToMove}
                            criticalMoments={criticalMoments}
                          />
                          <GameReport moveEvals={moveEvals} userColor={userColor} />
                        </>
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
                            onGamesLoaded={(games, uname) => {
                              setChesscomGames(games as ChessComGame[])
                              setChesscomUsername(uname)
                            }}
                          />
                          {chesscomGames.length > 0 && (
                            <GameSelector
                              games={chesscomGames}
                              username={chesscomUsername}
                              platform="chesscom"
                              onGameLoaded={() => setPanelTab('analysis')}
                            />
                          )}
                        </>
                      )}

                      {importTab === 'lichess' && (
                        <>
                          <AccountLink
                            platform="lichess"
                            onGamesLoaded={(games, uname) => {
                              setLichessGames(games as LichessGame[])
                              setLichessUsername(uname)
                            }}
                          />
                          {lichessGames.length > 0 && (
                            <GameSelector
                              games={lichessGames}
                              username={lichessUsername}
                              platform="lichess"
                              onGameLoaded={() => setPanelTab('analysis')}
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
                    <div className="panel-empty">
                      {parseError
                        ? <span className="parse-error">Couldn't read this PGN format. Try copying directly from Chess.com or Lichess.</span>
                        : 'Load a game to start analysis.'}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {currentPage === 'dashboard' && <div className="stub-page">Dashboard coming soon.</div>}
          {currentPage === 'settings' && <div className="stub-page">Settings coming soon.</div>}
          {currentPage === 'about' && <div className="stub-page">About coming soon.</div>}
        </div>
      </div>
    </div>
  )
}
