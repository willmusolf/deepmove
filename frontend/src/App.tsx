import { useState, useEffect } from 'react'
import ChessBoard from './components/Board/ChessBoard'
import EvalBar from './components/Board/EvalBar'
import EvalGraph from './components/Board/EvalGraph'
import MoveList from './components/Board/MoveList'
import ImportPanel from './components/Import/ImportPanel'
import NavSidebar from './components/Layout/NavSidebar'
import type { Page } from './components/Layout/NavSidebar'
import { useGameReview } from './hooks/useGameReview'
import { useStockfish } from './hooks/useStockfish'
import { useGameStore } from './stores/gameStore'
import './styles/board.css'

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

type PanelTab = 'analysis' | 'load'

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

  const { isReady, engineStatus, runAnalysis } = useStockfish()

  // Trigger analysis whenever a new game loads and the engine is ready
  useEffect(() => {
    if (pgn && isReady) {
      void runAnalysis(pgn)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pgn, isReady])

  const [orientation, setOrientation] = useState<'white' | 'black'>('white')
  const [boardFen, setBoardFen] = useState(STARTING_FEN)
  const [panelTab, setPanelTab] = useState<PanelTab>('load')
  const [currentPage, setCurrentPage] = useState<Page>('review')
  const [showEvalBar, setShowEvalBar] = useState(true)

  const displayFen = isLoaded ? currentFen : boardFen

  useEffect(() => {
    if (isLoaded) setPanelTab('analysis')
  }, [isLoaded])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!isLoaded) return
      const active = document.activeElement
      if (active?.tagName === 'TEXTAREA' || active?.tagName === 'INPUT') return
      if (e.key === 'ArrowLeft') { e.preventDefault(); goBack() }
      if (e.key === 'ArrowRight') { e.preventDefault(); goForward() }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isLoaded, goBack, goForward])

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
  }

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

  return (
    <div className="app">
      <NavSidebar currentPage={currentPage} onNavigate={setCurrentPage} />

      <div className="app-content">
        <header className="app-header">
          <h1>DeepMove</h1>
          <p className="app-subtitle">Chess coaching that teaches principles, not moves.</p>
        </header>

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

                <div className="board-with-eval">
                  {showEvalBar && (
                    <EvalBar
                      evalCentipawns={currentEval?.eval.score}
                      isMate={currentEval?.eval.isMate}
                      mateIn={currentEval?.eval.mateIn}
                      isAnalyzing={isAnalyzing}
                    />
                  )}
                  <ChessBoard
                    key={isLoaded ? 'review' : 'freeplay'}
                    fen={displayFen}
                    orientation={orientation}
                    interactive={!isLoaded}
                    onMove={isLoaded ? undefined : (_f, _t, newFen) => setBoardFen(newFen)}
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
                      <button className="nav-btn" onClick={goBack} disabled={currentMoveIndex === 0}>←</button>
                      <span className="move-counter">{currentMoveIndex} / {totalMoves}</span>
                      <button className="nav-btn" onClick={goForward} disabled={currentMoveIndex === totalMoves}>→</button>
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
