// ChessBoard.tsx — Interactive chess board using chessground + chess.js
// chessground handles rendering and drag/drop
// chess.js handles legal move computation

import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import { Chessground } from 'chessground'
import type { Api } from 'chessground/api'
import type { Config } from 'chessground/config'
import type { Key } from 'chessground/types'
import type { DrawShape } from 'chessground/draw'
import { Chess } from 'chess.js'
import { STARTING_FEN } from '../../chess/constants'
import { PIECE_IMAGES } from '../../chess/pieceImages'

export type { DrawShape }


export interface ChessBoardProps {
  fen?: string
  orientation?: 'white' | 'black'
  interactive?: boolean
  onMove?: (from: string, to: string, san: string, fen: string) => void
  onIllegalMove?: () => void
  shapes?: DrawShape[]
  lastMove?: [Key, Key]
  pathKey?: number  // Changes whenever position navigates; ensures FEN sync always fires
  forceCheck?: 'white' | 'black'   // Force king highlight (e.g. on resign, even without check)
  userPerspective?: 'white' | 'black'  // When set, keeps movable.color + turnColor on this color
                                        // regardless of whose turn the FEN says it is. Used for
                                        // premove queueing: the virtual FEN may have the opponent to
                                        // move, but the user must still be able to drag their pieces.
  premoveQueue?: Array<{ orig: string; dest: string }> // Highlight orig+dest squares for queued premoves
}


/** Compute legal move destinations for chessground's movable.dests */
export function getLegalDests(fen: string): Map<Key, Key[]> {
  const chess = new Chess(fen)
  const dests = new Map<Key, Key[]>()
  chess.moves({ verbose: true }).forEach(m => {
    const from = m.from as Key
    if (!dests.has(from)) dests.set(from, [])
    dests.get(from)!.push(m.to as Key)
  })
  return dests
}

/** Get which color's turn it is from a FEN */
export function getTurnColor(fen: string): 'white' | 'black' {
  return fen.split(' ')[1] === 'w' ? 'white' : 'black'
}

/** Convert a square (e.g. 'e4') to percentage offsets for CSS absolute positioning */
function squareToPercent(square: string, orientation: 'white' | 'black'): { left: number; top: number } {
  const file = square.charCodeAt(0) - 97   // 'a'=0 … 'h'=7
  const rank = parseInt(square[1]) - 1      // '1'=0 … '8'=7
  const col = orientation === 'white' ? file : 7 - file
  const row = orientation === 'white' ? 7 - rank : rank
  return { left: col * 12.5, top: row * 12.5 }
}


export default function ChessBoard({
  fen = STARTING_FEN,
  orientation = 'white',
  interactive = true,
  onMove,
  shapes = [],
  lastMove,
  pathKey = 0,
  forceCheck,
  userPerspective,
  onIllegalMove,
  premoveQueue,
}: ChessBoardProps) {
  // Compute check highlight + legal move destinations + turn color.
  // When userPerspective is set (premove queueing mode), compute legal dests
  // from a turn-flipped FEN so the user can always drag their own pieces,
  // even when the virtual FEN technically says it's the opponent's turn.
  const { checkColor, legalDests, turnColor: fenTurnColor } = useMemo(() => {
    // Only flip the turn when NOT interactive (i.e., bot is thinking and user is
    // queuing premoves). When interactive=true (user's real turn), use the FEN as-is
    // so chessground gets the correct turn color and the move validates normally.
    let fenForDests = fen
    if (userPerspective && !interactive) {
      const parts = fen.split(' ')
      const userFenColor = userPerspective === 'white' ? 'w' : 'b'
      if (parts[1] !== userFenColor) {
        parts[1] = userFenColor
        parts[3] = '-'  // clear en passant — stale under the flipped side
        fenForDests = parts.join(' ')
      }
    }
    try {
      const chess = new Chess(fenForDests)
      const inCheck = chess.inCheck()
      const dests = new Map<Key, Key[]>()
      chess.moves({ verbose: true }).forEach(m => {
        const from = m.from as Key
        if (!dests.has(from)) dests.set(from, [])
        dests.get(from)!.push(m.to as Key)
      })
      const effectiveTurn = (userPerspective && !interactive
        ? userPerspective
        : (chess.turn() === 'w' ? 'white' : 'black')) as 'white' | 'black'
      return {
        checkColor: inCheck ? effectiveTurn as 'white' | 'black' | false : false as 'white' | 'black' | false,
        legalDests: dests,
        turnColor: effectiveTurn,
      }
    } catch {
      // Fallback if turn-flipped FEN is invalid (shouldn't happen in practice)
      const chess = new Chess(fen)
      const turn = chess.turn()
      return {
        checkColor: false as 'white' | 'black' | false,
        legalDests: new Map<Key, Key[]>(),
        turnColor: (turn === 'w' ? 'white' : 'black') as 'white' | 'black',
      }
    }
  }, [fen, userPerspective, interactive])

  const [pendingPromotion, setPendingPromotion] = useState<{ from: Key; to: Key; color: 'white' | 'black'; orientation: 'white' | 'black' } | null>(null)
  const [boardReady, setBoardReady] = useState(false)

  const orientationRef = useRef(orientation)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<Api | null>(null)
  const fenRef = useRef(fen)
  const onMoveRef = useRef(onMove)
  const interactiveRef = useRef(interactive)
  const userPerspectiveRef = useRef(userPerspective)
  const prevPathKeyRef = useRef(pathKey)

  // Track when the board has a real layout size so shapes only sync after mount.
  // Avoid writing inline width/height here: that can leave the board "stuck" at a
  // stale pixel size after the window is resized down and then back up.
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      if (width > 0 && height > 0) setBoardReady(true)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Keep refs current without triggering re-init
  fenRef.current = fen
  onMoveRef.current = onMove
  interactiveRef.current = interactive
  userPerspectiveRef.current = userPerspective
  orientationRef.current = orientation

  // Initialize chessground once on mount
  useEffect(() => {
    if (!containerRef.current) return

    const config: Config = {
      fen,
      orientation,
      turnColor: getTurnColor(fen),
      movable: {
        color: interactive ? getTurnColor(fen) : undefined,
        free: false,
        dests: interactive ? getLegalDests(fen) : undefined,
        showDests: true,
        events: {
          after: (from: Key, to: Key) => {
            const currentFen = fenRef.current
            const isInteractive = interactiveRef.current
            const perspective = userPerspectiveRef.current

            // Non-interactive but userPerspective set: user is queuing a premove.
            // Pass the move directly to the parent — no chess.js validation needed here
            // (the parent's handleBoardMove appends to the queue without validating).
            // Promotion: auto-queen for premoves.
            if (!isInteractive && perspective) {
              const chess = new Chess(currentFen)
              const piece = chess.get(from as any)
              const toRank = to[1]
              const isPromotion = piece?.type === 'p' && (toRank === '8' || toRank === '1')
              const move = chess.move({ from, to, promotion: isPromotion ? 'q' : undefined })
              if (move && onMoveRef.current) {
                onMoveRef.current(from, to, move.san, chess.fen())
              } else {
                // Move doesn't validate on the current virtual FEN — still forward it
                // because it may be valid on the real FEN after bot responds.
                // Pass empty san and fen — handleBoardMove only uses from/dest for queue.
                onMoveRef.current?.(from, to, '', '')
              }
              return
            }

            // Interactive (real move): validate with chess.js
            const chess = new Chess(currentFen)
            const piece = chess.get(from as any)
            const toRank = to[1]

            // Detect promotion: show picker for real moves
            if (piece?.type === 'p' && (toRank === '8' || toRank === '1')) {
              const color = piece.color === 'w' ? 'white' : 'black'
              setPendingPromotion({ from, to, color, orientation: orientationRef.current })
              return
            }

            const move = chess.move({ from, to })
            if (move && onMoveRef.current) {
              onMoveRef.current(from, to, move.san, chess.fen())
            } else {
              // Move failed validation — snap back and re-enable the board.
              onIllegalMove?.()
              apiRef.current?.set({
                fen: currentFen,
                turnColor: getTurnColor(currentFen),
                movable: {
                  color: interactiveRef.current ? getTurnColor(currentFen) : undefined,
                  dests: interactiveRef.current ? getLegalDests(currentFen) : undefined,
                },
              })
            }
          },
        },
      },
      highlight: {
        lastMove: true,
        check: true,
      },
      animation: {
        enabled: true,
        duration: 150,
      },
      draggable: {
        enabled: interactive || !!userPerspective,
        showGhost: true,
        distance: 3,
      },
      premovable: {
        // Disabled — we handle premoves via virtual FEN in useBotPlay.
        // Chessground's built-in premove would conflict with our queue approach.
        enabled: false,
      },
      drawable: {
        enabled: true,
        visible: true,
        defaultSnapToValidMove: true,
        eraseOnClick: false,
        shapes: [],
        autoShapes: [],
        brushes: {
          green:    { key: 'green',    color: '#15781B', opacity: 0.8,  lineWidth: 10 },
          red:      { key: 'red',      color: '#882020', opacity: 0.8,  lineWidth: 10 },
          blue:     { key: 'blue',     color: '#003088', opacity: 0.8,  lineWidth: 10 },
          yellow:   { key: 'yellow',   color: '#e68f00', opacity: 0.8,  lineWidth: 10 },
          bestMove: { key: 'bestMove', color: '#15781B', opacity: 0.95, lineWidth: 12 },
          goodMove: { key: 'goodMove', color: '#15781B', opacity: 0.70, lineWidth: 7 },
          okMove:   { key: 'okMove',   color: '#15781B', opacity: 0.50, lineWidth: 4 },
        },
      },
    }

    apiRef.current = Chessground(containerRef.current, config)

    return () => {
      apiRef.current?.destroy()
      apiRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync FEN, orientation, and last-move highlight after init.
  // Explicitly passing lastMove on every navigation ensures the highlight
  // always matches the current position (prevents stale highlight after goBack).
  // When userPerspective is set, keep movable.color on the user's color so they
  // can always drag their own pieces (even when virtual FEN says opponent's turn).
  useEffect(() => {
    fenRef.current = fen
    if (!apiRef.current) return

    const pathKeyChanged = prevPathKeyRef.current !== pathKey
    prevPathKeyRef.current = pathKey

    if (pathKeyChanged) {
      apiRef.current.cancelMove() // Cancel any ongoing move interaction when navigation changes
    }

    const canInteract = interactive || !!userPerspective
    apiRef.current.set({
      fen,
      lastMove: lastMove ?? [],
      orientation,
      check: forceCheck ?? checkColor,
      turnColor: fenTurnColor,
      movable: {
        color: canInteract ? fenTurnColor : undefined,
        dests: canInteract ? legalDests : undefined,
      },
      draggable: { enabled: canInteract },
    })
  }, [fen, lastMove, orientation, interactive, pathKey, checkColor, fenTurnColor, legalDests, forceCheck, userPerspective])

  // Sync engine arrow shapes — always re-pass movable so chessground's partial
  // set() can never accidentally clear movable.dests during an arrows update.
  // boardReady is included so that if shapes arrive before the board has laid out
  // (width === 0), this effect re-runs once the ResizeObserver reports a real size.
  useEffect(() => {
    if (!apiRef.current) return
    if (!containerRef.current || containerRef.current.getBoundingClientRect().width === 0) return
    apiRef.current.set({
      drawable: { autoShapes: shapes },
    })
  }, [shapes, boardReady])

  const handlePromotion = useCallback((piece: string) => {
    if (!pendingPromotion) return
    const { from, to } = pendingPromotion
    const currentFen = fenRef.current
    const chess = new Chess(currentFen)
    const move = chess.move({ from, to, promotion: piece })
    setPendingPromotion(null)
    if (move && onMoveRef.current) {
      onMoveRef.current(from, to, move.san, chess.fen())
    } else {
      // Snap back on failure
      apiRef.current?.set({
        fen: currentFen,
        turnColor: getTurnColor(currentFen),
        movable: {
          color: interactiveRef.current ? getTurnColor(currentFen) : undefined,
          dests: interactiveRef.current ? getLegalDests(currentFen) : undefined,
        },
      })
    }
  }, [pendingPromotion])

  return (
    <div ref={wrapperRef} className="chess-board-container" role="region" aria-label="Chess board">
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {premoveQueue && premoveQueue.length > 0 && (
        <div className="premove-piece-overlay" aria-hidden="true">
          {premoveQueue.map((pm) => {
            const orig = squareToPercent(pm.orig, orientation)
            const dest = squareToPercent(pm.dest, orientation)
            return (
              <React.Fragment key={`${pm.orig}-${pm.dest}`}>
                <div className="premove-sq-highlight" style={{ left: `${orig.left}%`, top: `${orig.top}%` }} />
                <div className="premove-sq-highlight" style={{ left: `${dest.left}%`, top: `${dest.top}%` }} />
              </React.Fragment>
            )
          })}
        </div>
      )}
      {pendingPromotion && (() => {
        const { to, color, orientation: ori } = pendingPromotion
        const fileIndex = to.charCodeAt(0) - 97
        const col = ori === 'white' ? fileIndex : 7 - fileIndex
        const leftPct = col * 12.5
        const isRank8 = to[1] === '8'
        const atVisualTop = (ori === 'white') === isRank8
        const pickerStyle: React.CSSProperties = {
          left: `${leftPct}%`,
          ...(atVisualTop ? { top: 0 } : { bottom: 0 }),
          flexDirection: atVisualTop ? 'column' : 'column-reverse',
        }
        const colorChar = color === 'white' ? 'w' : 'b'
        const pieces: [string, string][] = [['q','Queen'],['r','Rook'],['b','Bishop'],['n','Knight']]
        const cancelBtn = (
          <button
            key="cancel"
            className="promotion-cancel"
            onClick={() => {
              setPendingPromotion(null)
              const currentFen = fenRef.current
              apiRef.current?.set({
                fen: currentFen,
                turnColor: getTurnColor(currentFen),
                movable: {
                  color: interactiveRef.current ? getTurnColor(currentFen) : undefined,
                  dests: interactiveRef.current ? getLegalDests(currentFen) : undefined,
                },
              })
            }}
            title="Cancel"
          >✕</button>
        )
        const choiceBtns = pieces.map(([piece, label]) => (
          <button
            key={piece}
            className="promotion-choice"
            onClick={() => handlePromotion(piece)}
            title={label}
          >
            <img src={PIECE_IMAGES[`${colorChar}${piece}`]} alt={label} style={{ width: '85%', height: '85%' }} />
          </button>
        ))
        return (
          <div className="promotion-overlay">
            <div className="promotion-picker" style={pickerStyle}>
              {atVisualTop ? [cancelBtn, ...choiceBtns] : [...choiceBtns, cancelBtn]}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
