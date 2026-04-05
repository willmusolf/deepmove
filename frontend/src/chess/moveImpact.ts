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

  // Pawn moves only count as purposeful if they push toward the center or advance
  // past the 4th/5th rank (not side-pawn shuffles like a3, h3).
  const isPawnMove = pieceType === 'p'
  const pawnHasPurpose = isPawnMove && toSq !== '' && (() => {
    const f = toSq.charCodeAt(0) - 96  // a=1, h=8
    const r = parseInt(toSq[1], 10)
    const isCenterPush = (f >= 3 && f <= 6) && (r >= 4 && r <= 5)  // c4-f5 region
    const isAdvanced = userColor === 'white' ? r >= 5 : r <= 4      // past the midpoint
    return isCenterPush || isAdvanced
  })()

  // Rook moves only count as purposeful if they move to the back rank (connecting),
  // 7th rank (active), or stay on the same file (likely an open-file play).
  const isRookMove = pieceType === 'r'
  const rookHasPurpose = isRookMove && toSq !== '' && (() => {
    const r = parseInt(toSq[1], 10)
    const seventhRank = userColor === 'white' ? 7 : 2
    const backRank = userColor === 'white' ? 1 : 8
    const sameFile = fromSq && toSq && fromSq[0] === toSq[0]
    return r === seventhRank || r === backRank || sameFile
  })()

  // Did the piece move toward the center? Tight definition: d4/d5/e4/e5 and
  // immediately adjacent (c3-f6). Manhattan distance ≤ 2 from center.
  const toFile = toSq ? toSq.charCodeAt(0) - 96 : 0  // a=1, h=8
  const toRank = toSq ? parseInt(toSq[1], 10) : 0
  const centralDist = Math.abs(toFile - 4.5) + Math.abs(toRank - 4.5)
  const movesToCenter = toSq !== '' && centralDist <= 2

  // A move has "clear purpose" if it: captures, checks, develops, castles,
  // pushes a meaningful pawn, makes a purposeful rook move, centralizes a piece,
  // or is a minor piece / queen move (these almost always have a tactical or
  // positional reason — only rook shuffles and pawn shuffles are truly aimless).
  const isMinorOrQueen = pieceType === 'n' || pieceType === 'b' || pieceType === 'q'
  const hadClearPurpose = wasCapture || wasCheck || developedPiece || castled
    || pawnHasPurpose || rookHasPurpose || movesToCenter || isMinorOrQueen

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
