// development.ts — Development Tracker
// Relevant only in opening/early_middlegame (moves 1-15)
// Tracks: undeveloped minor pieces, castling, early queen moves, same piece moved twice
// Tests: frontend/src/chess/__tests__/development.test.ts

import type { DevelopmentStatus } from './types'
import type { Chess, Square } from 'chess.js'

type ColorCode = 'w' | 'b'

const STARTING_MINOR_SQUARES = {
  white: ['b1', 'g1', 'c1', 'f1'],
  black: ['b8', 'g8', 'c8', 'f8'],
} as const

const HOME_RANK = {
  white: '1',
  black: '8',
} as const

const KING_CASTLE_SQUARES = {
  white: new Set(['g1', 'c1']),
  black: new Set(['g8', 'c8']),
} as const

const STARTING_TOKENS: Record<ColorCode, Record<string, string>> = {
  w: {
    a1: 'w-rook-a1',
    b1: 'w-knight-b1',
    c1: 'w-bishop-c1',
    d1: 'w-queen-d1',
    e1: 'w-king-e1',
    f1: 'w-bishop-f1',
    g1: 'w-knight-g1',
    h1: 'w-rook-h1',
    a2: 'w-pawn-a2',
    b2: 'w-pawn-b2',
    c2: 'w-pawn-c2',
    d2: 'w-pawn-d2',
    e2: 'w-pawn-e2',
    f2: 'w-pawn-f2',
    g2: 'w-pawn-g2',
    h2: 'w-pawn-h2',
  },
  b: {
    a8: 'b-rook-a8',
    b8: 'b-knight-b8',
    c8: 'b-bishop-c8',
    d8: 'b-queen-d8',
    e8: 'b-king-e8',
    f8: 'b-bishop-f8',
    g8: 'b-knight-g8',
    h8: 'b-rook-h8',
    a7: 'b-pawn-a7',
    b7: 'b-pawn-b7',
    c7: 'b-pawn-c7',
    d7: 'b-pawn-d7',
    e7: 'b-pawn-e7',
    f7: 'b-pawn-f7',
    g7: 'b-pawn-g7',
    h7: 'b-pawn-h7',
  },
}

function hasStartingMinorPiece(chess: Chess, square: Square, color: ColorCode, type: 'n' | 'b'): boolean {
  const piece = chess.get(square)
  return piece?.color === color && piece.type === type
}

function countDevelopedMinorPieces(chess: Chess, color: 'white' | 'black'): number {
  const pieceColor = color === 'white' ? 'w' : 'b'
  const startingSquares = STARTING_MINOR_SQUARES[color] as readonly Square[]
  let undeveloped = 0

  for (const square of startingSquares) {
    const expectedType = square === 'b1' || square === 'g1' || square === 'b8' || square === 'g8' ? 'n' : 'b'
    if (hasStartingMinorPiece(chess, square, pieceColor, expectedType)) {
      undeveloped += 1
    }
  }

  return 4 - undeveloped
}

function areRooksConnected(chess: Chess, color: 'white' | 'black'): boolean {
  const pieceColor = color === 'white' ? 'w' : 'b'
  const homeRank = HOME_RANK[color]
  const rookSquares: Square[] = []

  for (const file of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
    const square = `${file}${homeRank}` as Square
    const piece = chess.get(square)
    if (piece?.color === pieceColor && piece.type === 'r') {
      rookSquares.push(square)
    }
  }

  if (rookSquares.length < 2) return false

  const leftFileCode = rookSquares[0].charCodeAt(0)
  const rightFileCode = rookSquares[rookSquares.length - 1].charCodeAt(0)

  for (let fileCode = leftFileCode + 1; fileCode < rightFileCode; fileCode++) {
    const square = `${String.fromCharCode(fileCode)}${homeRank}` as Square
    if (chess.get(square)) {
      return false
    }
  }

  return true
}

function isCastled(chess: Chess, color: 'white' | 'black'): boolean {
  const pieceColor = color === 'white' ? 'w' : 'b'
  for (const square of KING_CASTLE_SQUARES[color]) {
    const piece = chess.get(square as Square)
    if (piece?.color === pieceColor && piece.type === 'k') return true
  }

  return false
}

function getHistoryFlags(chess: Chess, color: 'white' | 'black'): Pick<DevelopmentStatus, 'earlyQueenMove' | 'sameMovedTwice'> {
  const pieceColor: ColorCode = color === 'white' ? 'w' : 'b'
  const history = chess.history({ verbose: true })

  if (history.length === 0) {
    return { earlyQueenMove: false, sameMovedTwice: false }
  }

  const currentSquares = new Map<string, string>(Object.entries(STARTING_TOKENS[pieceColor]))
  const tokenMoveCounts = new Map<string, number>()
  let colorMoveCount = 0
  let earlyQueenMove = false
  let sameMovedTwice = false

  for (const move of history) {
    const movingColor = move.color
    const token = currentSquares.get(move.from)

    if (token) {
      currentSquares.delete(move.from)
    }

    if (move.captured) {
      currentSquares.delete(move.to)
      if (move.isEnPassant()) {
        const captureRank = movingColor === 'w' ? Number(move.to[1]) - 1 : Number(move.to[1]) + 1
        currentSquares.delete(`${move.to[0]}${captureRank}`)
      }
    }

    if (move.color !== pieceColor) {
      if (token) currentSquares.set(move.to, token)
      continue
    }

    colorMoveCount += 1

    if (move.piece === 'q' && colorMoveCount < 7 && !move.isCapture()) {
      earlyQueenMove = true
    }

    if (!sameMovedTwice && colorMoveCount < 10 && token && move.piece !== 'q' && move.piece !== 'k') {
      const nextCount = (tokenMoveCounts.get(token) ?? 0) + 1
      tokenMoveCounts.set(token, nextCount)
      if (nextCount >= 2) {
        sameMovedTwice = true
      }
    }

    if (token) {
      currentSquares.set(move.to, token)
    }
  }

  return { earlyQueenMove, sameMovedTwice }
}

export function trackDevelopment(chess: Chess, color: 'white' | 'black'): DevelopmentStatus {
  const developedMinorPieces = countDevelopedMinorPieces(chess, color)
  const historyFlags = getHistoryFlags(chess, color)

  return {
    developedMinorPieces,
    undevelopedMinorPieces: 4 - developedMinorPieces,
    rooksConnected: areRooksConnected(chess, color),
    castled: isCastled(chess, color),
    earlyQueenMove: historyFlags.earlyQueenMove,
    sameMovedTwice: historyFlags.sameMovedTwice,
  }
}
