import { useState, useEffect, useRef, useCallback } from 'react'
import { Chess } from 'chess.js'
import ChessBoard from './components/Board/ChessBoard'
import type { DrawShape } from './components/Board/ChessBoard'
import EvalBar from './components/Board/EvalBar'
import EvalGraph from './components/Board/EvalGraph'
import MoveList from './components/Board/MoveList'
import BestLines from './components/Board/BestLines'
import ImportPanel from './components/Import/ImportPanel'
import NavSidebar from './components/Layout/NavSidebar'
import type { Page } from './components/Layout/NavSidebar'
import { useGameReview } from './hooks/useGameReview'
import { useStockfish } from './hooks/useStockfish'
import { useGameStore } from './stores/gameStore'
import type { TopLine } from './engine/stockfish'
import type { Key } from 'chessground/types'
import './styles/board.css'

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const LINE_BRUSHES = ['green', 'paleBlue', 'yellow'] as const

type PanelTab = 'analysis' | 'load'

/** Play a sequence of UCI moves from a FEN; returns the FEN after each step */
function replayUciMoves(startFen: string, uciMoves: string[]): string[] {
  const fens: string[] = [startFen]
  const chess = new Chess(startFen)
  for (const uci of uciMoves) {
    try {
      chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? 'q' })
      fens.push(chess.fen())
    } catch {
      break
    }
  }
  return fens
}

interface Variation {
  fens: string[]    // [baseFen, after move 1, ...]
  pvMoves: string[] // UCI moves
  index: number     // current step (0 = base position)
}

export default function App() {
  const {
    currentFen,
    moves,
    currentMoveIndex,
    goToMove,
    goForward,
    goBack,
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
  const isAnalyzing = useGameStore(s => s.isAnalyzing)
  const totalMovesCount = useGameStore(s => s.totalMovesCount)
  const pgn = useGameStore(s => s.pgn)
  const gameKey = useGameStore(s => s.gameKey)
  const currentPositionLines = useGameStore(s => s.currentPositionLines)
  const isAnalyzingPosition = useGameStore(s => s.isAnalyzingPosition)
  const setCurrentPositionLines = useGameStore(s => s.setCurrentPositionLines)
  const setAnalyzingPosition = useGameStore(s => s.setAnalyzingPosition)

  const { isReady, engineStatus, runAnalysis, analyzePositionLines } = useStockfish()

  // Trigger full-game analysis whenever a new game loads and the engine is ready
  useEffect(() => {
    if (pgn && isReady) {
      void runAnalysis(pgn)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameKey, isReady])

  // Per-position multi-PV analysis — runs after full-game analysis completes
  // Uses a token to discard stale results from quick navigation
  const positionTokenRef = useRef(0)

  useEffect(() => {
    if (!isLoaded || isAnalyzing) {
      setCurrentPositionLines([])
      return
    }
    const token = ++positionTokenRef.current
    setAnalyzingPosition(true)
    setCurrentPositionLines([])

    analyzePositionLines(currentFen, 18, 3)
      .then(lines => {
        if (positionTokenRef.current !== token) return  // navigated away, discard
        setCurrentPositionLines(lines)
        setAnalyzingPosition(false)
      })
      .catch(() => {
        if (positionTokenRef.current !== token) return
        setAnalyzingPosition(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFen, isAnalyzing, isLoaded])

  const [orientation, setOrientation] = useState<'white' | 'black'>('white')
  const [boardFen, setBoardFen] = useState(STARTING_FEN)
  const [panelTab, setPanelTab] = useState<PanelTab>('load')
  const [currentPage, setCurrentPage] = useState<Page>('review')
  const [showEvalBar, setShowEvalBar] = useState(true)
  const [variation, setVariation] = useState<Variation | null>(null)

  const displayFen = variation
    ? variation.fens[variation.index]
    : isLoaded ? currentFen : boardFen

  useEffect(() => {
    if (isLoaded) setPanelTab('analysis')
  }, [isLoaded])

  // Exit variation on game navigation
  useEffect(() => {
    setVariation(null)
  }, [currentMoveIndex])

  // Keyboard navigation
  const goBackFn = useCallback(() => {
    if (variation) {
      if (variation.index === 0) {
        setVariation(null)
      } else {
        setVariation(v => v ? { ...v, index: v.index - 1 } : null)
      }
    } else {
      goBack()
    }
  }, [variation, goBack])

  const goForwardFn = useCallback(() => {
    if (variation) {
      if (variation.index < variation.fens.length - 1) {
        setVariation(v => v ? { ...v, index: v.index + 1 } : null)
      }
    } else {
      goForward()
    }
  }, [variation, goForward])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!isLoaded) return
      const active = document.activeElement
      if (active?.tagName === 'TEXTAREA' || active?.tagName === 'INPUT') return
      if (e.key === 'ArrowLeft') { e.preventDefault(); goBackFn() }
      if (e.key === 'ArrowRight') { e.preventDefault(); goForwardFn() }
      if (e.key === 'Escape' && variation) { e.preventDefault(); setVariation(null) }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isLoaded, goBackFn, goForwardFn, variation])

  const topPlayer = orientation === 'white'
    ? { name: blackPlayer, elo: blackElo }
    : { name: whitePlayer, elo: whiteElo }
  const bottomPlayer = orientation === 'white'
    ? { name: whitePlayer, elo: whiteElo }
    : { name: blackPlayer, elo: blackElo }

  const toMoveSide = displayFen.split(' ')[1]
  const topIsToMove = orientation === 'white' ? toMoveSide === 'b' : toMoveSide === 'w'

  function handleNewGame() {
    reset()
    setBoardFen(STARTING_FEN)
    setPanelTab('load')
    setVariation(null)
  }

  function handleLineClick(line: TopLine) {
    const base = variation ? variation.fens[variation.index] : currentFen
    const fens = replayUciMoves(base, line.pv)
    setVariation({ fens, pvMoves: line.pv, index: 0 })
  }

  // Arrow shapes: show best lines as colored arrows on the board
  // In variation mode, show the next move in the PV as a green arrow
  const boardShapes: DrawShape[] = (() => {
    if (variation) {
      const nextUci = variation.pvMoves[variation.index]
      if (!nextUci || variation.index >= variation.fens.length - 1) return []
      return [{
        orig: nextUci.slice(0, 2) as Key,
        dest: nextUci.slice(2, 4) as Key,
        brush: 'green',
      }]
    }
    return currentPositionLines
      .filter(l => l.pv.length >= 1)
      .map((line, i) => ({
        orig: line.pv[0].slice(0, 2) as Key,
        dest: line.pv[0].slice(2, 4) as Key,
        brush: LINE_BRUSHES[i] ?? 'green',
      }))
  })()

  // Current position eval for the inline display
  const currentEval = currentMoveIndex > 0 ? moveEvals[currentMoveIndex - 1] : undefined

  // Move grades array: index i = grade for move i+1 (1-based → 0-based)
  const moveGrades = moveEvals.map(me => me.grade)

  // Eval display string
  function formatEval(me: typeof currentEval): string {
    if (!me) return '—'
    if (me.eval.isMate) return me.eval.mateIn !== null ? `M${Math.abs(me.eval.mateIn)}` : 'M'
    const cp = me.eval.score
    const pawns = (cp / 100).toFixed(2)
    return cp >= 0 ? `+${pawns}` : pawns
  }

  const analyzedCount = moveEvals.length
  const showAnalyzingBar = isAnalyzing || (analyzedCount < totalMovesCount && totalMovesCount > 0)

  // In variation, show eval of first line (the one we entered) if available
  const variationEval = variation && currentPositionLines[0]
    ? currentPositionLines[0]
    : null

  const evalCp = variation
    ? (variationEval?.score)
    : currentEval?.eval.score
  const evalIsMate = variation
    ? (variationEval?.isMate ?? false)
    : (currentEval?.eval.isMate ?? false)
  const evalMateIn = variation
    ? (variationEval?.mateIn ?? null)
    : (currentEval?.eval.mateIn ?? null)

  return (
    <div className="app">
      <NavSidebar currentPage={currentPage} onNavigate={setCurrentPage} />

      <div className="app-content">
        <div className="app-main">
          {currentPage === 'review' && (
            <>
              <div className="board-col">
                <div className="player-bar">
                  {isLoaded && (
                    <>
                      <span className={`to-move-dot${topIsToMove ? ' active' : ''}`} />
                      <span className="player-name">{topPlayer.name ?? '—'}</span>
                      {topPlayer.elo && <span className="player-elo">{topPlayer.elo}</span>}
                    </>
                  )}
                </div>

                {variation && (
                  <div className="variation-banner">
                    Variation &nbsp;·&nbsp; {variation.index} / {variation.fens.length - 1}
                    &nbsp;
                    <button className="variation-exit-btn" onClick={() => setVariation(null)}>
                      ✕ Exit
                    </button>
                  </div>
                )}

                <div className="board-with-eval">
                  {showEvalBar && (
                    <EvalBar
                      evalCentipawns={evalCp}
                      isMate={evalIsMate}
                      mateIn={evalMateIn}
                      isAnalyzing={isAnalyzing}
                    />
                  )}
                  <ChessBoard
                    key={isLoaded ? 'review' : 'freeplay'}
                    fen={displayFen}
                    orientation={orientation}
                    interactive={!isLoaded}
                    onMove={isLoaded ? undefined : (_f, _t, newFen) => setBoardFen(newFen)}
                    shapes={boardShapes}
                  />
                </div>

                <div className="player-bar">
                  {isLoaded && (
                    <>
                      <span className={`to-move-dot${!topIsToMove ? ' active' : ''}`} />
                      <span className="player-name">{bottomPlayer.name ?? '—'}</span>
                      {bottomPlayer.elo && <span className="player-elo">{bottomPlayer.elo}</span>}
                    </>
                  )}
                </div>

                <div className="board-controls">
                  {isLoaded && (
                    <>
                      <button className="nav-btn" onClick={goBackFn}
                        disabled={!variation && currentMoveIndex === 0}>←</button>
                      <span className="move-counter">
                        {variation
                          ? `var ${variation.index}/${variation.fens.length - 1}`
                          : `${currentMoveIndex} / ${totalMoves}`}
                      </span>
                      <button className="nav-btn" onClick={goForwardFn}
                        disabled={!variation && currentMoveIndex === totalMoves}>→</button>
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

                      {/* Eval display — only when we have data */}
                      {currentEval && (
                        <div className="eval-display">
                          <span className="eval-display-value">{formatEval(currentEval)}</span>
                          <span className="eval-display-depth">depth {currentEval.eval.depth}</span>
                        </div>
                      )}

                      {/* Best lines panel */}
                      {!isAnalyzing && (
                        <BestLines
                          lines={currentPositionLines}
                          isAnalyzingPosition={isAnalyzingPosition}
                          onLineClick={handleLineClick}
                        />
                      )}

                      {/* Eval graph — appears after first eval arrives */}
                      {analyzedCount > 0 && (
                        <EvalGraph
                          moveEvals={moveEvals}
                          totalMoves={totalMovesCount || totalMoves}
                          currentMoveIndex={currentMoveIndex}
                          onNavigate={goToMove}
                        />
                      )}

                      {/* Move list — always interactive */}
                      <MoveList
                        moves={moves}
                        moveGrades={moveGrades}
                        currentMoveIndex={currentMoveIndex}
                        onMoveClick={goToMove}
                      />
                    </>
                  )}

                  {panelTab === 'load' && (
                    <ImportPanel
                      onFenLoad={(fen) => {
                        reset()
                        setBoardFen(fen)
                      }}
                    />
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
