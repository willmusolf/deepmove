// pieceActivity.ts — Piece Activity Evaluator
// Evaluates: mobility per piece, centralization, bad bishop detection, passive pieces
// Key output: identifies the "worst piece" on the board for each side
// Tests: frontend/src/chess/__tests__/pieceActivity.test.ts

import type { PieceActivityScore } from './types'
import { Chess } from 'chess.js'
import type { Square } from 'chess.js'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const
const CENTRAL_SQUARES = new Set([
  'c3', 'c4', 'c5', 'c6',
  'd3', 'd4', 'd5', 'd6',
  'e3', 'e4', 'e5', 'e6',
  'f3', 'f4', 'f5', 'f6',
])

function withTurn(chess: Chess, colorCode: 'w' | 'b'): Chess {
  const fenParts = chess.fen().split(' ')
  fenParts[1] = colorCode
  return new Chess(fenParts.join(' '))
}

function getSquaresForColor(chess: Chess, colorCode: 'w' | 'b'): Square[] {
  const squares: Square[] = []
  for (const file of FILES) {
    for (const rank of RANKS) {
      const square = `${file}${rank}` as Square
      const piece = chess.get(square)
      if (piece?.color === colorCode) {
        squares.push(square)
      }
    }
  }
  return squares
}

function isLightSquare(square: string): boolean {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0)
  const rank = Number(square[1]) - 1
  return (file + rank) % 2 === 1
}

export function evaluatePieceActivity(chess: Chess, color: 'white' | 'black'): PieceActivityScore {
  const colorCode = color === 'white' ? 'w' : 'b'
  const mobilityChess = withTurn(chess, colorCode)
  const moves = mobilityChess.moves({ verbose: true })
  const mobilityBySquare = new Map<string, number>()

  for (const move of moves) {
    const piece = mobilityChess.get(move.from)
    if (!piece || piece.type === 'k') continue
    mobilityBySquare.set(move.from, (mobilityBySquare.get(move.from) ?? 0) + 1)
  }

  const squares = getSquaresForColor(chess, colorCode)
  let totalMobility = 0
  let centralizedPieces = 0
  const passivePieces: string[] = []
  let badBishop: string | null = null

  for (const square of squares) {
    const piece = chess.get(square)
    if (!piece || piece.type === 'k') continue

    const mobility = mobilityBySquare.get(square) ?? 0
    totalMobility += mobility

    if (piece.type !== 'p' && CENTRAL_SQUARES.has(square)) {
      centralizedPieces += 1
    }

    if (piece.type !== 'p' && mobility <= 2) {
      passivePieces.push(square)
    }
  }

  const ownPawnSquares = squares.filter(square => chess.get(square)?.type === 'p')
  for (const square of squares) {
    const piece = chess.get(square)
    if (!piece || piece.type !== 'b') continue

    const sameColorPawnCount = ownPawnSquares.filter(pawnSquare => isLightSquare(pawnSquare) === isLightSquare(square)).length
    const oppositeColorPawnCount = ownPawnSquares.length - sameColorPawnCount
    if (sameColorPawnCount > oppositeColorPawnCount) {
      badBishop = square
      break
    }
  }

  return { totalMobility, centralizedPieces, passivePieces, badBishop }
}
