// BotPlayPage.tsx — Full-page Play vs Bot mode.
// Reuses ChessBoard, PlayerInfoBox, and MoveList from the review flow.
// All game state comes from playStore; game loop is in useBotPlay.

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { Key } from 'chessground/types'
import { usePlayStore, STARTING_FEN } from '../../stores/playStore'
import { useBotPlay } from '../../hooks/useBotPlay'
import { useSound } from '../../hooks/useSound'
import ChessBoard from '../Board/ChessBoard'
import PlayerInfoBox from '../Board/PlayerInfoBox'
import MoveList from '../Board/MoveList'
import MoveRail, { useIsPhone } from '../Board/MoveRail'
import PlaySetupPanel from './PlaySetupPanel'
import GameResultBanner from './GameResultBanner'
import { useAuthStore } from '../../stores/authStore'
import { Chess } from 'chess.js'
import { getSquareOverlayPosition } from '../../chess/boardGeometry'
import { readSessionJson, writeSessionJson } from '../../utils/sessionStorage'

const PLAY_UI_SESSION_KEY = 'deepmove_playUi'

interface PlayUiState {
  orientation: 'white' | 'black'
  browsePosition: string | null
  browsePath: string[]
  atBrowseStart: boolean
  browseStep: number
}

function loadPlayUiState(): PlayUiState | null {
  const parsed = readSessionJson<Partial<PlayUiState>>(PLAY_UI_SESSION_KEY)
  if (!parsed || typeof parsed !== 'object') return null

  return {
    orientation: parsed.orientation === 'black' ? 'black' : 'white',
    browsePosition: typeof parsed.browsePosition === 'string' ? parsed.browsePosition : null,
    browsePath: Array.isArray(parsed.browsePath)
      ? parsed.browsePath.filter(nodeId => typeof nodeId === 'string')
      : [],
    atBrowseStart: parsed.atBrowseStart === true,
    browseStep: typeof parsed.browseStep === 'number' ? parsed.browseStep : 0,
  }
}

interface Props {
  onNavigateToReview: () => void
}

export default function BotPlayPage({ onNavigateToReview }: Props) {
  const savedUiState = useMemo(() => loadPlayUiState(), [])
  const {
    handleBoardMove,
    cancelPremoveQueue,
    premoveQueue,
    premoveSnapToken,
    virtualBoardFen,
    startGame,
    resignGame,
    reviewGame,
    getWhiteClockDisplay,
    getBlackClockDisplay,
    botEngineReady,
  } = useBotPlay(onNavigateToReview)
  const { enabled: soundEnabled, toggle: toggleSound, playIllegalSound, playMoveSound } = useSound()
  const isPhone = useIsPhone()

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
  const resetPlay   = usePlayStore(s => s.resetPlay)

  // Auth (for display name)
  const authUser = useAuthStore(s => s.user)
  const displayName = authUser?.chesscom_username ?? authUser?.lichess_username ?? 'You'

  // Board orientation (local state — user can flip any time)
  const [orientation, setOrientation] = useState<'white' | 'black'>(savedUiState?.orientation ?? 'white')

  // Browse mode: browsePosition is the FEN shown on board; browsePathRef tracks the node-ID path
  const [browsePosition, setBrowsePositionRaw] = useState<string | null>(savedUiState?.browsePosition ?? null)
  const [browsePath, setBrowsePath] = useState<string[]>(savedUiState?.browsePath ?? [])
  const [atBrowseStart, setAtBrowseStart] = useState(savedUiState?.atBrowseStart ?? false)
  const [whiteClockStr, setWhiteClockStr] = useState<string | undefined>(() => getWhiteClockDisplay())
  const [blackClockStr, setBlackClockStr] = useState<string | undefined>(() => getBlackClockDisplay())
  // Wrap setBrowsePosition: cancel premove queue whenever entering browse mode
  const setBrowsePosition = useCallback((fen: string | null) => {
    if (fen !== null) cancelPremoveQueue()
    setBrowsePositionRaw(fen)
  }, [cancelPremoveQueue])
  const browsePathRef = useRef<string[]>(browsePath)
  // true when user has browsed all the way back to move 0 (prevents loop back to live tip)
  const atBrowseStartRef = useRef(atBrowseStart)
  // Increments on every navigation step so ChessBoard's pathKey changes and cancelMove() fires
  const [browseStep, setBrowseStep] = useState(savedUiState?.browseStep ?? 0)

  // Mobile detection — used to cancel premoves on any board tap (desktop unchanged)
  const [isCoarsePointer, setIsCoarsePointer] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  )
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)')
    const handler = (e: MediaQueryListEvent) => setIsCoarsePointer(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Refs for use inside keydown handler (avoid stale closure)
  const treeRef = useRef(tree)
  const currentPathRef = useRef(currentPath)
  treeRef.current = tree
  currentPathRef.current = currentPath

  useEffect(() => {
    browsePathRef.current = browsePath
  }, [browsePath])

  useEffect(() => {
    atBrowseStartRef.current = atBrowseStart
  }, [atBrowseStart])

  useEffect(() => {
    const syncClocks = () => {
      setWhiteClockStr(getWhiteClockDisplay())
      setBlackClockStr(getBlackClockDisplay())
    }

    syncClocks()

    if (status !== 'playing' || config?.timeControl === 'none') return

    const intervalId = window.setInterval(syncClocks, 250)
    return () => window.clearInterval(intervalId)
  }, [config?.timeControl, getBlackClockDisplay, getWhiteClockDisplay, status])

  useEffect(() => {
    writeSessionJson(PLAY_UI_SESSION_KEY, {
      orientation,
      browsePosition,
      browsePath,
      atBrowseStart,
      browseStep,
    } satisfies PlayUiState)
  }, [orientation, browsePosition, browsePath, atBrowseStart, browseStep])

  useEffect(() => {
    if (status === 'idle') {
      if (browsePosition !== null) setBrowsePositionRaw(null)
      if (browsePath.length > 0) setBrowsePath([])
      if (atBrowseStart) setAtBrowseStart(false)
      return
    }

    const safePath: string[] = []
    for (const nodeId of browsePath) {
      const node = tree[nodeId]
      if (!node) break
      const expectedParent = safePath[safePath.length - 1] ?? null
      if (node.parentId !== expectedParent) break
      safePath.push(nodeId)
    }

    const expectedBrowsePosition = safePath.length === 0
      ? (atBrowseStart ? STARTING_FEN : null)
      : (tree[safePath[safePath.length - 1]]?.fen ?? null)

    if (safePath.length !== browsePath.length) {
      setBrowsePath(safePath)
      return
    }

    if (browsePosition !== expectedBrowsePosition) {
      setBrowsePositionRaw(expectedBrowsePosition)
    }
  }, [status, tree, browsePath, browsePosition, atBrowseStart])

  // Auto-snap back to live position when bot finishes thinking (only if browsing)
  useEffect(() => {
    if (!isBotThinking && browsePosition !== null) {
      setBrowsePosition(null)
      setBrowsePath([])
      // NOTE: do NOT reset atBrowseStartRef here — the user may have browsed to
      // move 0 before the bot finished; resetting here would re-enable the loop bug.
    }
  }, [browsePosition, isBotThinking, setBrowsePosition])

  // Clear browse position when game resets
  useEffect(() => {
    if (status === 'idle') {
      setBrowsePosition(null)
      setBrowsePath([])
      setAtBrowseStart(false)
    }
  }, [setBrowsePosition, status])

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
          setBrowsePath(newPath)
          if (newPath.length === 0) {
            setAtBrowseStart(true)
            setBrowsePosition(STARTING_FEN)
            setBrowseStep(s => s + 1)
          } else {
            const nodeId = newPath[newPath.length - 1]
            setAtBrowseStart(false)
            setBrowsePosition(t[nodeId]?.fen ?? null)
            setBrowseStep(s => s + 1)
            playMoveSound(t[nodeId]?.san ?? '')
          }
        } else {
          // Already browsing — step back one more
          const newPath = browsePath.slice(0, -1)
          setBrowsePath(newPath)
          if (newPath.length === 0) {
            setAtBrowseStart(true)
            setBrowsePosition(STARTING_FEN)
            setBrowseStep(s => s + 1)
          } else {
            const nodeId = newPath[newPath.length - 1]
            setAtBrowseStart(false)
            setBrowsePosition(t[nodeId]?.fen ?? null)
            setBrowseStep(s => s + 1)
            playMoveSound(t[nodeId]?.san ?? '')
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
        setAtBrowseStart(false)
        setBrowsePath([...pathToStep, nextId])
        const node = t[nextId]
        if (!node) return
        playMoveSound(node.san)
        // If we've reached the live tip, exit browse mode
        if (nextId === livePath[livePath.length - 1]) {
          setBrowsePosition(null)
          setBrowsePath([])
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
  const activePath = browsePosition !== null ? browsePath : currentPath
  const lastNode = activePath.length > 0 ? tree[activePath[activePath.length - 1]] : null
  const lastMove = useMemo<[Key, Key] | undefined>(() => (
    lastNode ? [lastNode.from as Key, lastNode.to as Key] : undefined
  ), [lastNode])

  const handleFlip = useCallback(() => {
    setOrientation(o => o === 'white' ? 'black' : 'white')
  }, [])

  const handleNewGame = useCallback(() => {
    cancelPremoveQueue()
    setBrowsePosition(null)
    setBrowsePath([])
    setAtBrowseStart(false)
    resetPlay()
  }, [cancelPremoveQueue, resetPlay, setBrowsePosition])

  // ── User color display info ──────────────────────────────────────────────
  const userIsWhite = config ? config.userColor === 'white' : orientation === 'white'
  const botEloStr   = config ? String(config.botElo) : ''
  const userEloStr  = null  // not tracked for bot games

  const userClockStr  = userIsWhite ? whiteClockStr : blackClockStr
  const botClockStr   = userIsWhite ? blackClockStr : whiteClockStr

  // Board FEN: use browse position if set, otherwise virtual FEN (real + queued premoves applied)
  const displayFen = browsePosition ?? virtualBoardFen

  // Interactive: only when it's the user's turn, bot isn't thinking, and not browsing history
  const boardInteractive = status === 'playing' && isUserTurn && !isBotThinking && !browsePosition

  const boardResultOverlay = useMemo(() => {
    try {
      const chess = new Chess(displayFen)
      const findKing = (color: 'w' | 'b'): string | null => {
        for (const file of 'abcdefgh') {
          for (const rank of '12345678') {
            const piece = chess.get(`${file}${rank}` as any)
            if (piece?.type === 'k' && piece.color === color) return file + rank
          }
        }
        return null
      }

      if (chess.isCheckmate()) {
        const square = findKing(chess.turn())
        if (!square) return null
        return (
          <div
            className="board-result-badge board-result-badge--checkmate"
            style={getSquareOverlayPosition(square, orientation)}
          >
            #
          </div>
        )
      }

      if (chess.isDraw() || (endReason === 'threefold' && browsePosition === null)) {
        const whiteKing = findKing('w')
        const blackKing = findKing('b')
        return (
          <>
            {whiteKing && (
              <div
                className="board-result-badge board-result-badge--draw"
                style={getSquareOverlayPosition(whiteKing, orientation)}
              >
                ½
              </div>
            )}
            {blackKing && (
              <div
                className="board-result-badge board-result-badge--draw"
                style={getSquareOverlayPosition(blackKing, orientation)}
              >
                ½
              </div>
            )}
          </>
        )
      }

      return null
    } catch {
      return null
    }
  }, [displayFen, orientation, endReason, browsePosition])

  const boardSurface = useMemo(() => (
    <div
      className="board-overlay-host"
      onContextMenu={(event) => {
        event.preventDefault()
        cancelPremoveQueue()
      }}
      onPointerDown={isCoarsePointer && premoveQueue.length > 0 ? cancelPremoveQueue : undefined}
    >
      <ChessBoard
        fen={displayFen}
        orientation={orientation}
        interactive={boardInteractive}
        onMove={handleBoardMove}
        onIllegalMove={playIllegalSound}
        lastMove={lastMove}
        pathKey={browseStep}
        snapFenSyncToken={premoveSnapToken}
        userPerspective={status === 'playing' && config && !browsePosition ? config.userColor : undefined}
        premoveQueue={!browsePosition && status === 'playing' ? premoveQueue : undefined}
        forceCheck={endReason === 'resigned' && config && browsePosition === null ? config.userColor : undefined}
      />
      {boardResultOverlay}
    </div>
  ), [
    boardInteractive,
    boardResultOverlay,
    browsePosition,
    browseStep,
    cancelPremoveQueue,
    config,
    displayFen,
    endReason,
    handleBoardMove,
    isCoarsePointer,
    lastMove,
    orientation,
    playIllegalSound,
    premoveQueue,
    premoveSnapToken,
    status,
  ])

  // ── Render ───────────────────────────────────────────────────────────────
  if (status === 'idle') {
    return (
      <div className="play-page play-page--setup">
        <div className="play-setup-wrapper">
          <div className="side-col play-setup-side-col">
            <PlaySetupPanel
              orientation={orientation}
              onOrientationChange={setOrientation}
              onStart={startGame}
              engineReady={botEngineReady}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* ── Board column ── */}
      <div className="board-col play-board-col play-board-col--no-eval">
        <div className="board-with-eval play-board-with-eval--no-eval">
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

            {boardSurface}

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
        <div className="board-controls play-board-controls">
          <div className="board-controls__actions">
            <button className="btn btn-secondary board-control-btn" onClick={handleFlip} title="Flip board">
              Flip
            </button>

            <button
              className={`btn btn-secondary board-control-btn${soundEnabled ? ' board-control-btn--active' : ''}`}
              onClick={toggleSound}
              title={soundEnabled ? 'Mute sounds' : 'Unmute sounds'}
              aria-pressed={soundEnabled}
            >
              Sound
            </button>

            {status === 'playing' && (
              <button className="btn btn-secondary board-control-btn board-control-btn--danger" onClick={resignGame}>
                Resign
              </button>
            )}
            {status === 'finished' && (
              <button className="btn btn-secondary board-control-btn" onClick={handleNewGame}>
                New Game
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Side panel ── */}
      <div className="side-col play-side-col">
        <div className="play-side-panel">
          <div className="play-side-panel__header">
            <h3 className="play-side-panel__title">Transcript</h3>
            {isBotThinking && status === 'playing' && (
              <span className="play-side-panel__status">Bot thinking…</span>
            )}
          </div>

          {isPhone ? (
            <MoveRail
              tree={tree}
              rootId={rootId}
              currentPath={browsePosition ? browsePath : currentPath}
              moveGrades={[]}
              onNodeClick={(path) => {
                const nodeId = path[path.length - 1]
                const node = tree[nodeId]
                if (!node) return
                setAtBrowseStart(false)
                setBrowsePath(path)
                if (nodeId === currentPath[currentPath.length - 1]) {
                  setBrowsePosition(null)
                  setBrowsePath([])
                } else {
                  setBrowsePosition(node.fen)
                }
              }}
              isAnalyzing={false}
            />
          ) : (
            <MoveList
              tree={tree}
              rootId={rootId}
              currentPath={browsePosition ? browsePath : currentPath}
              moveGrades={[]}
              onNodeClick={(path) => {
                const nodeId = path[path.length - 1]
                const node = tree[nodeId]
                if (!node) return
                setAtBrowseStart(false)
                setBrowsePath(path)
                if (nodeId === currentPath[currentPath.length - 1]) {
                  setBrowsePosition(null)
                  setBrowsePath([])
                } else {
                  setBrowsePosition(node.fen)
                }
              }}
              isAnalyzing={false}
            />
          )}

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
    </>
  )
}
