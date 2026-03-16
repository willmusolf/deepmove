// ChessBoard.tsx — Interactive chess board using chessground + chess.js
// chessground handles rendering and drag/drop
// chess.js handles legal move computation

import { useEffect, useRef, useMemo } from 'react'
import { Chessground } from 'chessground'
import type { Api } from 'chessground/api'
import type { Config } from 'chessground/config'
import type { Key } from 'chessground/types'
import type { DrawShape } from 'chessground/draw'
import { Chess } from 'chess.js'

export type { DrawShape }

export interface ChessBoardProps {
  fen?: string
  orientation?: 'white' | 'black'
  interactive?: boolean
  onMove?: (from: string, to: string, san: string, fen: string) => void
  shapes?: DrawShape[]
  lastMove?: [Key, Key]
  pathKey?: number  // Changes whenever position navigates; ensures FEN sync always fires
}

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

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
}: ChessBoardProps) {
  // Detect check so chessground can highlight the king's square in red
  const checkColor = useMemo((): 'white' | 'black' | false => {
    const chess = new Chess(fen)
    if (!chess.inCheck()) return false
    return chess.turn() === 'w' ? 'white' : 'black'
  }, [fen])

  const wrapperRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<Api | null>(null)
  const fenRef = useRef(fen)
  const onMoveRef = useRef(onMove)
  const interactiveRef = useRef(interactive)
  const prevFenRef = useRef(fen)
  const prevPathKeyRef = useRef(pathKey)
  const prevLastMoveRef = useRef(lastMove)
  const prevOrientationRef = useRef(orientation)
  const prevCheckColorRef = useRef(checkColor)
  const prevInteractiveRef = useRef(interactive)

  // Snap board container to nearest multiple of 8 to prevent chessground square misalignment
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      const size = Math.floor(Math.min(width, height) / 8) * 8
      el.style.width = `${size}px`
      el.style.height = `${size}px`
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Keep refs current without triggering re-init
  fenRef.current = fen
  onMoveRef.current = onMove
  interactiveRef.current = interactive

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
            const move = chess.move({ from, to, promotion: 'q' })

            if (move && onMoveRef.current) {
              onMoveRef.current(from, to, move.san, chess.fen())
            } else {
              // Move failed validation — snap back and re-enable the board.
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
        enabled: interactive,
        showGhost: true,
        distance: 3,
      },
      premovable: {
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
          bestMove: { key: 'bestMove', color: '#15781B', opacity: 0.85, lineWidth: 12 },
          goodMove: { key: 'goodMove', color: '#15781B', opacity: 0.55, lineWidth: 7 },
          okMove:   { key: 'okMove',   color: '#15781B', opacity: 0.35, lineWidth: 4 },
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
    const fenChanged = prevFenRef.current !== fen
    const lastMoveChanged = prevLastMoveRef.current !== lastMove
    const orientationChanged = prevOrientationRef.current !== orientation
    const checkColorChanged = prevCheckColorRef.current !== checkColor
    const interactiveChanged = prevInteractiveRef.current !== interactive

    prevPathKeyRef.current = pathKey
    prevFenRef.current = fen
    prevLastMoveRef.current = lastMove
    prevOrientationRef.current = orientation
    prevCheckColorRef.current = checkColor
    prevInteractiveRef.current = interactive

    // Only update the board when something meaningful changes.
    if (!pathKeyChanged && !fenChanged && !lastMoveChanged && !orientationChanged && !checkColorChanged && !interactiveChanged) {
      return
    }

    if (pathKeyChanged || fenChanged) {
      apiRef.current.cancelMove() // Cancel any ongoing move interaction when navigation changes
    }

    apiRef.current.set({
      fen,
      lastMove: lastMove ?? [],
      orientation,
      check: checkColor,
      turnColor: getTurnColor(fen),
      movable: {
        color: interactive ? getTurnColor(fen) : undefined,
        dests: interactive ? getLegalDests(fen) : undefined,
      },
    })
  }, [fen, lastMove, orientation, interactive, pathKey, checkColor])

  // Sync engine arrow shapes — always re-pass movable so chessground's partial
  // set() can never accidentally clear movable.dests during an arrows update.
  useEffect(() => {
    if (!apiRef.current) return
    apiRef.current.set({
      drawable: { autoShapes: shapes },

    })
  }, [shapes])

  return (
    <div ref={wrapperRef} className="chess-board-container" role="region" aria-label="Chess board">
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}
