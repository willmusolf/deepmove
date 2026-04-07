// BotPlayPage.tsx — Full-page Play vs Bot mode.
// Reuses ChessBoard, PlayerInfoBox, EvalBar, MoveList from the review flow.
// All game state comes from playStore; game loop is in useBotPlay.

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { Key } from 'chessground/types'
import { usePlayStore, STARTING_FEN } from '../../stores/playStore'
import { msToHHMMSS } from '../../utils/format'
import { useBotPlay } from '../../hooks/useBotPlay'
import { useSound } from '../../hooks/useSound'
import ChessBoard from '../Board/ChessBoard'
import EvalBar from '../Board/EvalBar'
import PlayerInfoBox from '../Board/PlayerInfoBox'
import MoveList from '../Board/MoveList'
import PlaySetupPanel from './PlaySetupPanel'
import GameResultBanner from './GameResultBanner'
import { useAuthStore } from '../../stores/authStore'
import type { TopLine } from '../../engine/stockfish'
import type { DrawShape } from '../Board/ChessBoard'
import { Chess } from 'chess.js'

interface Props {
  analyzePositionLines: (
    fen: string,
    depth?: number,
    numLines?: number,
    onUpdate?: (lines: TopLine[], depth: number) => void,
  ) => Promise<TopLine[]>
  stopPositionAnalysis: () => void
  onNavigateToReview: () => void
}

export default function BotPlayPage({ analyzePositionLines, stopPositionAnalysis, onNavigateToReview }: Props) {
  const { handleUserMove, handlePremoveSet, cancelPremoveQueue, premoveQueue, startGame, resignGame, reviewGame, botEngineReady } = useBotPlay(onNavigateToReview)
  const { enabled: soundEnabled, toggle: toggleSound, playIllegalSound } = useSound()

  // Play store state
  const status      = usePlayStore(s => s.status)
  const result      = usePlayStore(s => s.result)
  const endReason   = usePlayStore(s => s.endReason)
  const config      = usePlayStore(s => s.config)
  const currentFen  = usePlayStore(s => s.currentFen)
  const tree        = usePlayStore(s => s.tree)
  const rootId      = usePlayStore(s => s.rootId)
  const currentPath = usePlayStore(s => s.currentPath)
  const isBotThinking = usePlayStore(s => s.isBotThinking)
  const whiteTimeMs = usePlayStore(s => s.whiteTimeMs)
  const blackTimeMs = usePlayStore(s => s.blackTimeMs)
  const resetPlay   = usePlayStore(s => s.resetPlay)

  // Auth (for display name)
  const authUser = useAuthStore(s => s.user)
  const displayName = authUser?.chesscom_username ?? authUser?.lichess_username ?? 'You'

  // Board orientation (local state — user can flip any time)
  const [orientation, setOrientation] = useState<'white' | 'black'>('white')

  // Browse mode: browsePosition is the FEN shown on board; browsePathRef tracks the node-ID path
  const [browsePosition, setBrowsePositionRaw] = useState<string | null>(null)
  // Wrap setBrowsePosition: cancel premove queue whenever entering browse mode
  const setBrowsePosition = useCallback((fen: string | null) => {
    if (fen !== null) cancelPremoveQueue()
    setBrowsePositionRaw(fen)
  }, [cancelPremoveQueue])
  const browsePathRef = useRef<string[]>([])
  // true when user has browsed all the way back to move 0 (prevents loop back to live tip)
  const atBrowseStartRef = useRef(false)
  // Increments on every navigation step so ChessBoard's pathKey changes and cancelMove() fires
  const [browseStep, setBrowseStep] = useState(0)

  // Refs for use inside keydown handler (avoid stale closure)
  const treeRef = useRef(tree)
  const rootIdRef = useRef(rootId)
  const currentPathRef = useRef(currentPath)
  treeRef.current = tree
  rootIdRef.current = rootId
  currentPathRef.current = currentPath

  // Analysis overlay (hidden by default — seeing eval is "cheating")
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [showArrows, setShowArrows] = useState(false)
  const [positionLines, setPositionLines] = useState<TopLine[]>([])
  const analysisAbortRef = useRef<boolean>(false)

  // Auto-snap back to live position when bot finishes thinking (only if browsing)
  useEffect(() => {
    if (!isBotThinking && browsePosition !== null) {
      setBrowsePosition(null)
      browsePathRef.current = []
      // NOTE: do NOT reset atBrowseStartRef here — the user may have browsed to
      // move 0 before the bot finished; resetting here would re-enable the loop bug.
    }
  }, [isBotThinking])

  // Clear browse position when game resets
  useEffect(() => {
    if (status === 'idle') {
      setBrowsePosition(null)
      browsePathRef.current = []
      atBrowseStartRef.current = false
    }
  }, [status])

  // ── Arrow key navigation ─────────────────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const active = document.activeElement
      if (active?.tagName === 'TEXTAREA' || active?.tagName === 'INPUT') return
      if (status === 'idle') return
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      e.preventDefault()

      const t = treeRef.current
      const livePath = currentPathRef.current
      const browsePath = browsePathRef.current

      if (e.key === 'ArrowLeft') {
        // Already at the start of game history — don't loop back to live tip
        if (atBrowseStartRef.current) return

        if (browsePath.length === 0) {
          // Not browsing yet — step into the last live node's parent
          if (livePath.length === 0) return
          const newPath = livePath.slice(0, -1)
          browsePathRef.current = newPath
          if (newPath.length === 0) {
            atBrowseStartRef.current = true
            setBrowsePosition(STARTING_FEN)
            setBrowseStep(s => s + 1)
          } else {
            const nodeId = newPath[newPath.length - 1]
            setBrowsePosition(t[nodeId]?.fen ?? null)
            setBrowseStep(s => s + 1)
          }
        } else {
          // Already browsing — step back one more
          const newPath = browsePath.slice(0, -1)
          browsePathRef.current = newPath
          if (newPath.length === 0) {
            atBrowseStartRef.current = true
            setBrowsePosition(STARTING_FEN)
            setBrowseStep(s => s + 1)
          } else {
            const nodeId = newPath[newPath.length - 1]
            setBrowsePosition(t[nodeId]?.fen ?? null)
            setBrowseStep(s => s + 1)
          }
        }
      } else {
        // ArrowRight
        if (browsePath.length === 0 && !atBrowseStartRef.current) {
          // Not browsing — we're already at the live tip, nothing to go forward to
          return
        }
        // If at start, step forward from beginning of live path
        const pathToStep = atBrowseStartRef.current ? [] : browsePath
        const nextId = atBrowseStartRef.current
          ? livePath[0]
          : t[pathToStep[pathToStep.length - 1]]?.childIds[0]
        if (!nextId) return
        // Don't go past the live position
        const livePathSet = new Set(livePath)
        if (!livePathSet.has(nextId) && pathToStep.length >= livePath.length) return
        atBrowseStartRef.current = false
        browsePathRef.current = [...pathToStep, nextId]
        const node = t[nextId]
        if (!node) return
        // If we've reached the live tip, exit browse mode
        if (nextId === livePath[livePath.length - 1]) {
          setBrowsePosition(null)
          browsePathRef.current = []
          setBrowseStep(s => s + 1)
        } else {
          setBrowsePosition(node.fen)
          setBrowseStep(s => s + 1)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [status])  // eslint-disable-line react-hooks/exhaustive-deps

  // Derived: is it the user's turn?
  const turnColor = currentFen.split(' ')[1] === 'w' ? 'white' : 'black'
  const isUserTurn = config ? turnColor === config.userColor : false

  // Last move squares for board highlight
  const activePath = browsePosition !== null ? browsePathRef.current : currentPath
  const lastNode = activePath.length > 0 ? tree[activePath[activePath.length - 1]] : null
  const lastMove: [Key, Key] | undefined = lastNode ? [lastNode.from as Key, lastNode.to as Key] : undefined

  // ── Position analysis (when showAnalysis is on) ──────────────────────────
  const analysisFen = browsePosition ?? currentFen
  useEffect(() => {
    const needsAnalysis = showAnalysis || showArrows
    if (!needsAnalysis || status === 'idle') {
      setPositionLines([])
      return
    }
    analysisAbortRef.current = true
    stopPositionAnalysis()

    const fen = analysisFen
    analysisAbortRef.current = false

    // Cap multi-PV to legal move count
    let numLines = 3
    try {
      const chess = new Chess(fen)
      const legalMoveCount = chess.moves().length
      if (legalMoveCount === 0) { setPositionLines([]); return }
      numLines = Math.min(3, legalMoveCount)
    } catch { /* invalid FEN */ }

    analyzePositionLines(fen, 16, numLines, (lines) => {
      if (!analysisAbortRef.current) setPositionLines(lines)
    }).then(lines => {
      if (!analysisAbortRef.current) setPositionLines(lines)
    }).catch(() => {})

    return () => {
      analysisAbortRef.current = true
    }
  }, [analysisFen, showAnalysis, showArrows, status])  // eslint-disable-line react-hooks/exhaustive-deps

  // Stop analysis when hiding
  useEffect(() => {
    if (!showAnalysis && !showArrows) {
      stopPositionAnalysis()
      setPositionLines([])
    }
  }, [showAnalysis, showArrows])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Eval bar data ────────────────────────────────────────────────────────
  const topLine = positionLines[0]
  const evalCp  = topLine?.isMate ? (topLine.mateIn !== null && topLine.mateIn > 0 ? 30000 : -30000) : topLine?.score
  const isMate  = topLine?.isMate ?? false
  const mateIn  = topLine?.mateIn ?? null

  // Filter lines by quality — only show alternatives close to the best move
  const visibleLines = useMemo(() => {
    const lines = positionLines
    if (lines.length === 0) return []
    const best = lines[0]
    return lines.filter((line, i) => {
      if (i === 0) return true
      if (best.isMate !== line.isMate) return false
      if (best.isMate && line.isMate) {
        if (best.mateIn !== null && line.mateIn !== null) {
          if ((best.mateIn > 0) !== (line.mateIn > 0)) return false
        }
        return true
      }
      const gap = Math.abs(line.score - best.score)
      if (i === 1) return gap <= 150
      if (i === 2) return gap <= 50
      return false
    })
  }, [positionLines])

  // Arrow shapes for best-move suggestions (only shown on user's turn)
  const LINE_BRUSHES = ['bestMove', 'goodMove', 'okMove'] as const
  const analysisBoardShapes: DrawShape[] = (showArrows && visibleLines.length > 0 && isUserTurn && !browsePosition)
    ? visibleLines
        .filter(l => l.pv.length >= 1)
        .map((line, i) => ({
          orig: line.pv[0].slice(0, 2) as Key,
          dest: line.pv[0].slice(2, 4) as Key,
          brush: LINE_BRUSHES[i] ?? 'okMove',
        }))
    : []

  // Red arrows for queued premoves — shown only during active play (not browse/review)
  const premoveShapes: DrawShape[] = (!browsePosition && status === 'playing')
    ? premoveQueue.map(pm => ({
        orig: pm.orig as Key,
        dest: pm.dest as Key,
        brush: 'red',
      }))
    : []

  const boardShapes = [...analysisBoardShapes, ...premoveShapes]

  const handleFlip = useCallback(() => {
    setOrientation(o => o === 'white' ? 'black' : 'white')
  }, [])

  const handleNewGame = useCallback(() => {
    stopPositionAnalysis()
    setPositionLines([])
    setShowAnalysis(false)
    setBrowsePosition(null)
    browsePathRef.current = []
    resetPlay()
  }, [resetPlay, stopPositionAnalysis])

  // ── User color display info ──────────────────────────────────────────────
  const userIsWhite = config ? config.userColor === 'white' : orientation === 'white'
  const botEloStr   = config ? String(config.botElo) : ''
  const userEloStr  = null  // not tracked for bot games

  // Clock display
  const whiteClockStr = msToHHMMSS(whiteTimeMs)
  const blackClockStr = msToHHMMSS(blackTimeMs)
  const userClockStr  = userIsWhite ? whiteClockStr : blackClockStr
  const botClockStr   = userIsWhite ? blackClockStr : whiteClockStr

  // Board FEN: use browse position if set, otherwise live position
  const displayFen = browsePosition ?? currentFen

  // Interactive: only when it's the user's turn, bot isn't thinking, and not browsing history
  const boardInteractive = status === 'playing' && isUserTurn && !isBotThinking && !browsePosition

  // ── Render ───────────────────────────────────────────────────────────────
  if (status === 'idle') {
    return (
      <div className="play-page">
        {/* ── Board column — same structure as playing screen for stable layout ── */}
        <div className="board-col">
          <div className="board-with-eval">
            <EvalBar hidden={true} orientation={orientation} />
            <div className="board-and-players">
              {/* Placeholder player boxes — same height as playing screen so board doesn't shift on game start */}
              <PlayerInfoBox
                username="Stockfish"
                elo="—"
                isWhite={orientation !== 'white'}
                isToMove={false}
                currentFen={STARTING_FEN}
                platform={null}
                clockTime={undefined}
              />
              <ChessBoard
                fen={STARTING_FEN}
                orientation={orientation}
                interactive={false}
              />
              <PlayerInfoBox
                username={displayName}
                elo={null}
                isWhite={orientation === 'white'}
                isToMove={false}
                currentFen={STARTING_FEN}
                platform={authUser?.chesscom_username ? 'chesscom' : authUser?.lichess_username ? 'lichess' : null}
                clockTime={undefined}
              />
            </div>
          </div>
          <div className="board-controls">
            <button className="btn btn-secondary" onClick={handleFlip}>Flip</button>
            <span className="play-setup-orientation-hint">
              You play as {orientation === 'white' ? '♙ White' : '♟ Black'}
            </span>
          </div>
        </div>
        {/* ── Setup panel in side-col position ── */}
        <div className="side-col">
          <PlaySetupPanel
            initialOrientation={orientation}
            onStart={startGame}
            engineReady={botEngineReady}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="play-page">
      {/* ── Board column ── */}
      <div className="board-col">
        <div className="board-with-eval">
          <EvalBar
            evalCentipawns={evalCp}
            isMate={isMate}
            mateIn={mateIn}
            orientation={orientation}
            hidden={!showAnalysis}
          />

          <div className="board-and-players">
            {/* Top player box */}
            {orientation === 'white' ? (
              <PlayerInfoBox
                username="Stockfish"
                elo={botEloStr}
                isWhite={false}
                isToMove={!isUserTurn}
                currentFen={currentFen}
                platform={null}
                clockTime={botClockStr}
              />
            ) : (
              <PlayerInfoBox
                username={displayName}
                elo={userEloStr}
                isWhite={false}
                isToMove={isUserTurn}
                currentFen={currentFen}
                platform={authUser?.chesscom_username ? 'chesscom' : authUser?.lichess_username ? 'lichess' : null}
                clockTime={userClockStr}
              />
            )}

            <div onContextMenu={cancelPremoveQueue}>
            <ChessBoard
              fen={displayFen}
              orientation={orientation}
              interactive={boardInteractive}
              onMove={handleUserMove}
              onIllegalMove={playIllegalSound}
              lastMove={lastMove}
              pathKey={browseStep}
              premoveColor={status === 'playing' && config && !browsePosition ? config.userColor : undefined}
              externalPremoveHandling={true}
              onPremoveSet={handlePremoveSet}
              shapes={boardShapes}
              forceCheck={endReason === 'resigned' && config && browsePosition === null ? config.userColor : undefined}
            />
            </div>

            {/* Bottom player box */}
            {orientation === 'white' ? (
              <PlayerInfoBox
                username={displayName}
                elo={userEloStr}
                isWhite={true}
                isToMove={isUserTurn}
                currentFen={currentFen}
                platform={authUser?.chesscom_username ? 'chesscom' : authUser?.lichess_username ? 'lichess' : null}
                clockTime={userClockStr}
              />
            ) : (
              <PlayerInfoBox
                username="Stockfish"
                elo={botEloStr}
                isWhite={true}
                isToMove={!isUserTurn}
                currentFen={currentFen}
                platform={null}
                clockTime={botClockStr}
              />
            )}
          </div>
        </div>

        {/* Board controls — matches Review tab style */}
        <div className="board-controls">
          <button className="btn btn-secondary" onClick={handleFlip} title="Flip board">
            Flip
          </button>

          <button
            className="btn btn-secondary"
            onClick={() => setShowAnalysis(v => !v)}
            title={showAnalysis ? 'Hide eval bar' : 'Show eval bar'}
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
            title={showArrows ? 'Hide best move arrows' : 'Show best move arrows'}
          >
            Arrows
          </button>

          {status === 'playing' && (
            <button className="btn btn-secondary btn-danger" onClick={resignGame}>
              Resign
            </button>
          )}
          {status === 'finished' && (
            <button className="btn btn-secondary" onClick={handleNewGame}>
              New Game
            </button>
          )}
        </div>
      </div>

      {/* ── Side panel ── */}
      <div className="side-col">
        <MoveList
          tree={tree}
          rootId={rootId}
          currentPath={browsePosition ? browsePathRef.current : currentPath}
          moveGrades={[]}
          onNodeClick={(path) => {
            const nodeId = path[path.length - 1]
            const node = tree[nodeId]
            if (!node) return
            atBrowseStartRef.current = false
            browsePathRef.current = path
            // If clicking the live tip, exit browse mode
            if (nodeId === currentPath[currentPath.length - 1]) {
              setBrowsePosition(null)
              browsePathRef.current = []
            } else {
              setBrowsePosition(node.fen)
            }
          }}
          isAnalyzing={false}
        />

        {status === 'finished' && (
          <GameResultBanner
            result={result}
            reason={endReason}
            onReview={reviewGame}
            onNewGame={handleNewGame}
          />
        )}
      </div>
    </div>
  )
}
