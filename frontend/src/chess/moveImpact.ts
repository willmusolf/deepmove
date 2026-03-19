// moveImpact.ts — Move Impact Analyzer (MVP)
// What did the user's move actually change? Delta analysis for coaching specificity.
//
// MVP scope: captures the most coaching-relevant facts.
// Full version (V2): pawn structure changes, worst-piece improvement, exchange assessment.
//
// Tests: frontend/src/chess/__tests__/moveImpact.test.ts

import type { MoveImpact } from './types'
import type { Chess, Square } from 'chess.js'

// Starting squares for minor pieces — a piece moved OFF these squares = development
const WHITE_MINOR_STARTS = new Set(['b1', 'g1', 'c1', 'f1'])
const BLACK_MINOR_STARTS = new Set(['b8', 'g8', 'c8', 'f8'])

// King squares that indicate castling occurred
const WHITE_CASTLE_SQUARES = new Set(['g1', 'c1'])
const BLACK_CASTLE_SQUARES = new Set(['g8', 'c8'])

function getKingSquare(chess: Chess, color: 'white' | 'black'): Square | null {
  const colorCode = color === 'white' ? 'w' : 'b'
  for (const file of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
    for (const rank of ['1', '2', '3', '4', '5', '6', '7', '8']) {
      const sq = `${file}${rank}` as Square
      const piece = chess.get(sq)
      if (piece?.color === colorCode && piece.type === 'k') return sq
    }
  }
  return null
}

export function analyzeMoveImpact(
  before: Chess,
  after: Chess,
  _movePlayed: string,
  userColor: 'white' | 'black',
): MoveImpact {
  // Get the last move from history (most accurate source of from/to/piece)
  const history = after.history({ verbose: true })
  const lastMove = history.length > 0 ? history[history.length - 1] : null

  const fromSq = lastMove?.from ?? ''
  const toSq = lastMove?.to ?? ''
  const pieceType = lastMove?.piece ?? ''
  const wasCapture = !!(lastMove?.captured)
  const wasCheck = after.inCheck()

  // Did this move develop a minor piece off its starting square?
  const minorStarts = userColor === 'white' ? WHITE_MINOR_STARTS : BLACK_MINOR_STARTS
  const developedPiece = !!(
    fromSq &&
    minorStarts.has(fromSq) &&
    (pieceType === 'n' || pieceType === 'b')
  )

  // Did the king move to a castling square?
  const castleSquares = userColor === 'white' ? WHITE_CASTLE_SQUARES : BLACK_CASTLE_SQUARES
  const castled = pieceType === 'k' && castleSquares.has(toSq)

  // Did king safety change? (king moved, including castling)
  const kingBefore = getKingSquare(before, userColor)
  const kingAfter = getKingSquare(after, userColor)
  const changedKingSafety = kingBefore !== kingAfter

  // A move has "clear purpose" if it: captures, checks, develops, or castles
  const hadClearPurpose = wasCapture || wasCheck || developedPiece || castled

  // Build a plain-English description
  const parts: string[] = []
  if (castled) parts.push('Castled')
  else if (developedPiece) parts.push(`Developed ${pieceType.toUpperCase()} from ${fromSq} to ${toSq}`)
  else if (wasCapture) parts.push(`Captured on ${toSq}`)
  else if (wasCheck) parts.push(`Gave check from ${toSq}`)
  else parts.push(`Moved ${pieceType.toUpperCase()} from ${fromSq} to ${toSq}`)

  if (!hadClearPurpose) parts.push('(no clear purpose)')

  return {
    description: parts.join(' — '),
    pieceMoved: pieceType,
    fromSquare: fromSq,
    toSquare: toSq,
    wasCapture,
    wasCheck,
    changedKingSafety,
    changedPawnStructure: false, // TODO V2: compare pawn counts per file before/after
    developedPiece,
    improvedPieceActivity: false, // TODO V2: mobility comparison
    createdWeakness: false, // TODO V2: pawn structure weakness detection
    hadClearPurpose,
  }
}
