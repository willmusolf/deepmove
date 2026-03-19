// openFiles.ts — Open and Half-Open File Detector
// Open file: no pawns of either color on the file
// Half-open file (for a color): no pawns of THAT color on the file (opponent's pawn may be there)
// Used for: rook placement recommendations, king safety assessment

import type { Chess, Square } from 'chess.js'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const

function fileHasPawn(chess: Chess, file: string, color?: 'w' | 'b'): boolean {
  for (const rank of RANKS) {
    const square = `${file}${rank}` as Square
    const piece = chess.get(square)
    if (!piece || piece.type !== 'p') continue
    if (!color || piece.color === color) return true
  }

  return false
}

export function getOpenFiles(chess: Chess): string[] {
  return FILES.filter((file) => !fileHasPawn(chess, file))
}

export function getHalfOpenFiles(chess: Chess, color: 'white' | 'black'): string[] {
  const pieceColor = color === 'white' ? 'w' : 'b'
  return FILES.filter((file) => !fileHasPawn(chess, file, pieceColor))
}
