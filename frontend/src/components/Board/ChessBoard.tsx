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
  onPremoveSet?: (orig: string | null, dest: string | null) => void
  premoveColor?: "white" | "black"  // Keep movable.color set for premoves even when not interactive
  forceCheck?: 'white' | 'black'   // Force king highlight (e.g. on resign, even without check)
  externalPremoveHandling?: boolean // When true, cancel premoves on FEN change instead of playing them.
                                    // The parent hook (useBotPlay) handles premove processing directly
                                    // to avoid chessground's setTimeout(1) race condition.
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

export default function ChessBoard({
  fen = STARTING_FEN,
  orientation = 'white',
  interactive = true,
  onMove,
  shapes = [],
  lastMove,
  pathKey = 0,
  onPremoveSet,
  premoveColor,
  forceCheck,
  externalPremoveHandling = false,
  onIllegalMove,
}: ChessBoardProps) {
  // Compute check highlight + legal move destinations + turn color from a single Chess instance
  const { checkColor, legalDests, turnColor: fenTurnColor } = useMemo(() => {
    const chess = new Chess(fen)
    const inCheck = chess.inCheck()
    const turn = chess.turn()
    const dests = new Map<Key, Key[]>()
    chess.moves({ verbose: true }).forEach(m => {
      const from = m.from as Key
      if (!dests.has(from)) dests.set(from, [])
      dests.get(from)!.push(m.to as Key)
    })
    return {
      checkColor: inCheck ? (turn === 'w' ? 'white' : 'black') as 'white' | 'black' | false : false as 'white' | 'black' | false,
      legalDests: dests,
      turnColor: turn === 'w' ? 'white' : 'black' as 'white' | 'black',
    }
  }, [fen])

  const [pendingPromotion, setPendingPromotion] = useState<{ from: Key; to: Key; color: 'white' | 'black'; orientation: 'white' | 'black' } | null>(null)
  const [boardReady, setBoardReady] = useState(false)

  const orientationRef = useRef(orientation)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<Api | null>(null)
  const fenRef = useRef(fen)
  const onMoveRef = useRef(onMove)
  const onPremoveSetRef = useRef(onPremoveSet)
  const interactiveRef = useRef(interactive)
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
  onPremoveSetRef.current = onPremoveSet
  interactiveRef.current = interactive
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
            const chess = new Chess(currentFen)
            const piece = chess.get(from as any)
            const toRank = to[1]

            // Detect promotion: pawn reaching last rank
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
        enabled: interactive || !!premoveColor,
        showGhost: true,
        distance: 3,
      },
      premovable: {
        enabled: true,
        showDests: true,
        events: {
          set: (orig: Key, dest: Key) => {
            onPremoveSetRef.current?.(orig, dest)
          },
          unset: () => {
            onPremoveSetRef.current?.(null, null)
          },
        },
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
  useEffect(() => {
    fenRef.current = fen
    if (!apiRef.current) return

    const pathKeyChanged = prevPathKeyRef.current !== pathKey
    prevPathKeyRef.current = pathKey

    if (pathKeyChanged) {
      apiRef.current.cancelMove() // Cancel any ongoing move interaction when navigation changes
    }

    apiRef.current.set({
      fen,
      lastMove: lastMove ?? [],
      orientation,
      check: forceCheck ?? checkColor,
      turnColor: fenTurnColor,
      movable: {
        color: interactive ? fenTurnColor : (premoveColor ?? undefined),
        dests: interactive ? legalDests : undefined,
      },
      draggable: { enabled: interactive || !!premoveColor },
    })

    // Premove handling after FEN update:
    // - externalPremoveHandling=true (bot play): The parent hook (useBotPlay) processes
    //   premoves synchronously via chess.js. We just cancel the chessground premove visual
    //   here so it doesn't fire its own setTimeout(1) `after` callback, which would race
    //   with React re-renders and cause tree corruption.
    // - externalPremoveHandling=false (default): Let chessground play the premove itself.
    //   This is the standard lichess behavior for non-bot contexts.
    if (premoveColor) {
      if (externalPremoveHandling) {
        apiRef.current.cancelPremove()
      } else {
        apiRef.current.playPremove()
      }
    }
  }, [fen, lastMove, orientation, interactive, pathKey, checkColor, premoveColor, forceCheck, externalPremoveHandling])

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
