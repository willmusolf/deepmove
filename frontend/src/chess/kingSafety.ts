// kingSafety.ts — King Safety Scorer
// Factors: castled status, pawn shield integrity, open files near king, pieces aimed at king
// Score: 0 (completely safe) to 100 (critical danger)
// Tests: frontend/src/chess/__tests__/kingSafety.test.ts

import type { KingSafetyScore } from './types'
import type { Chess, Square } from 'chess.js'
import { getOpenFiles } from './openFiles'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const

function getKingSquare(chess: Chess, color: 'white' | 'black'): Square | null {
  const colorCode = color === 'white' ? 'w' : 'b'
  for (const file of FILES) {
    for (const rank of ['1', '2', '3', '4', '5', '6', '7', '8']) {
      const square = `${file}${rank}` as Square
      const piece = chess.get(square)
      if (piece?.color === colorCode && piece.type === 'k') {
        return square
      }
    }
  }
  return null
}

function detectCastleState(kingSquare: Square | null, color: 'white' | 'black'): KingSafetyScore['castled'] {
  if (!kingSquare) return 'none'
  if (color === 'white') {
    if (kingSquare === 'g1') return 'kingside'
    if (kingSquare === 'c1') return 'queenside'
  } else {
    if (kingSquare === 'g8') return 'kingside'
    if (kingSquare === 'c8') return 'queenside'
  }
  return 'none'
}

function fileIndex(file: string): number {
  return FILES.indexOf(file as typeof FILES[number])
}

function isEndgameLike(chess: Chess): boolean {
  let queens = 0
  let nonPawnNonKing = 0

  for (const file of FILES) {
    for (const rank of ['1', '2', '3', '4', '5', '6', '7', '8']) {
      const square = `${file}${rank}` as Square
      const piece = chess.get(square)
      if (!piece || piece.type === 'p' || piece.type === 'k') continue
      if (piece.type === 'q') queens += 1
      nonPawnNonKing += 1
    }
  }

  return queens === 0 || nonPawnNonKing <= 6
}

export function scoreKingSafety(chess: Chess, color: 'white' | 'black'): KingSafetyScore {
  const colorCode = color === 'white' ? 'w' : 'b'
  const kingSquare = getKingSquare(chess, color)
  const castled = detectCastleState(kingSquare, color)

  let pawnShieldIntegrity = 0
  const kingFile = kingSquare ? fileIndex(kingSquare[0]) : 4
  const rawShieldRank = color === 'white' ? Number(kingSquare?.[1] ?? '1') + 1 : Number(kingSquare?.[1] ?? '8') - 1
  const shieldRank = Math.max(1, Math.min(8, rawShieldRank))

  for (let offset = -1; offset <= 1; offset++) {
    const file = FILES[Math.max(0, Math.min(FILES.length - 1, kingFile + offset))]
    const square = `${file}${shieldRank}` as Square
    const piece = chess.get(square)
    if (piece?.color === colorCode && piece.type === 'p') {
      pawnShieldIntegrity += 1
    }
  }

  const openFilesNearKing = getOpenFiles(chess).filter(file => {
    const idx = fileIndex(file)
    return idx >= kingFile - 1 && idx <= kingFile + 1
  })

  let score = 0
  if (castled === 'none' && !isEndgameLike(chess)) {
    score += 30
  }
  score += (3 - pawnShieldIntegrity) * 15
  score += openFilesNearKing.length * 10

  return {
    castled,
    pawnShieldIntegrity,
    openFilesNearKing,
    score: Math.max(0, Math.min(100, score)),
  }
}
