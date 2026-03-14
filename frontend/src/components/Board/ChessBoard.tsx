// ChessBoard.tsx — Interactive chess board using chessground + chess.js
// chessground handles rendering and drag/drop
// chess.js handles legal move computation

import { useEffect, useRef } from 'react'
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
}

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/** Compute legal move destinations for chessground's movable.dests */
function getLegalDests(fen: string): Map<Key, Key[]> {
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
function getTurnColor(fen: string): 'white' | 'black' {
  return fen.split(' ')[1] === 'w' ? 'white' : 'black'
}

export default function ChessBoard({
  fen = STARTING_FEN,
  orientation = 'white',
  interactive = true,
  onMove,
  shapes = [],
}: ChessBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<Api | null>(null)
  const fenRef = useRef(fen)
  const onMoveRef = useRef(onMove)

  // Keep refs current without triggering re-init
  fenRef.current = fen
  onMoveRef.current = onMove

  // Initialize chessground once on mount
  useEffect(() => {
    if (!containerRef.current) return

    const config: Config = {
      fen,
      orientation,
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
              // Lock the board immediately so no second move can fire before
              // React re-renders and sets the correct movable.color for the next turn.
              apiRef.current?.set({ movable: { color: undefined } })
              onMoveRef.current(from, to, move.san, chess.fen())
            } else {
              // Move failed validation — snap the piece back to its origin square.
              apiRef.current?.set({ fen: currentFen })
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

  // Sync FEN and orientation changes after init
  useEffect(() => {
    fenRef.current = fen
    if (!apiRef.current) return
    apiRef.current.set({
      fen,
      orientation,
      movable: {
        color: interactive ? getTurnColor(fen) : undefined,
        dests: interactive ? getLegalDests(fen) : undefined,
      },
    })
  }, [fen, orientation, interactive])

  // Sync engine arrow shapes
  useEffect(() => {
    if (!apiRef.current) return
    apiRef.current.set({
      drawable: { autoShapes: shapes },
    })
  }, [shapes])

  return (
    <div className="chess-board-container">
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}
