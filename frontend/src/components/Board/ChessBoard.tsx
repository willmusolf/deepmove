// ChessBoard.tsx — Interactive chess board using chessground + chess.js
// chessground handles rendering and drag/drop
// chess.js handles legal move computation

import { useEffect, useRef } from 'react'
import { Chessground } from 'chessground'
import type { Api } from 'chessground/api'
import type { Config } from 'chessground/config'
import type { Key } from 'chessground/types'
import { Chess } from 'chess.js'

export interface ChessBoardProps {
  fen?: string
  orientation?: 'white' | 'black'
  interactive?: boolean
  onMove?: (from: string, to: string, fen: string) => void
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
}: ChessBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<Api | null>(null)
  const fenRef = useRef(fen)
  const onMoveRef = useRef(onMove)

  // Keep refs current without triggering re-init
  useRef(() => { fenRef.current = fen })
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
              onMoveRef.current(from, to, chess.fen())
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

  return (
    <div className="chess-board-container">
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}
