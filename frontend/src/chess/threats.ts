// threats.ts — Threat Analyzer
// The "leaky roof" detector. Powers TACTICAL_01 (blunder check) and TACTICAL_02 (ignored threats).
//
// hangingPieces:        user's pieces attacked and with NO friendly defenders (in position after user's move)
// piecesLeftUndefended: pieces that WERE defended before user's move but aren't after (defender moved away)
// threatsIgnored:       pieces that were already hanging BEFORE user's move and are STILL hanging after
// threatsCreated:       new threats user's move created against opponent (MVP: stubbed as [])
//
// Tests: frontend/src/chess/__tests__/threats.test.ts

import type { ThreatAnalysis } from './types'
import type { Chess, Square } from 'chess.js'

const PIECE_NAMES: Record<string, string> = {
  p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King',
}

const ALL_SQUARES: Square[] = []
for (const file of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
  for (const rank of ['1', '2', '3', '4', '5', '6', '7', '8']) {
    ALL_SQUARES.push(`${file}${rank}` as Square)
  }
}

/** Returns all squares occupied by pieces of the given color (skips king by default) */
function getPieceSquares(chess: Chess, colorCode: 'w' | 'b', skipKing = true): Square[] {
  return ALL_SQUARES.filter(sq => {
    const piece = chess.get(sq)
    return piece && piece.color === colorCode && (!skipKing || piece.type !== 'k')
  })
}

/**
 * Get squares of opponent's pieces that can legally capture on targetSq.
 * Uses legal moves from the position (it's the opponent's turn in afterChess).
 */
function getAttackerSquares(chess: Chess, targetSq: Square): string[] {
  const moves = chess.moves({ verbose: true }) as Array<{ from: string; to: string }>
  return moves.filter(m => m.to === targetSq).map(m => m.from)
}

/**
 * Hanging = attacked by opponent AND not defended by any friendly piece.
 * We skip the king (its safety is handled by chess rules; it can never be "hanging").
 */
function findHangingPieces(afterChess: Chess, userColor: 'white' | 'black'): ThreatAnalysis['hangingPieces'] {
  const colorCode = userColor === 'white' ? 'w' : 'b'
  const oppCode = userColor === 'white' ? 'b' : 'w'
  const hanging: ThreatAnalysis['hangingPieces'] = []

  for (const sq of getPieceSquares(afterChess, colorCode)) {
    const piece = afterChess.get(sq)
    if (!piece) continue

    if (afterChess.isAttacked(sq, oppCode) && !afterChess.isAttacked(sq, colorCode)) {
      hanging.push({ square: sq, piece: piece.type, attackedBy: getAttackerSquares(afterChess, sq) })
    }
  }

  return hanging
}

/**
 * Pieces that were defended before the user's move but became undefended after.
 * Happens when the moved piece was the sole defender of another piece.
 */
function findPiecesLeftUndefended(
  beforeChess: Chess,
  afterChess: Chess,
  userColor: 'white' | 'black',
): ThreatAnalysis['piecesLeftUndefended'] {
  const colorCode = userColor === 'white' ? 'w' : 'b'
  const oppCode = userColor === 'white' ? 'b' : 'w'
  const result: ThreatAnalysis['piecesLeftUndefended'] = []

  for (const sq of getPieceSquares(afterChess, colorCode)) {
    const pieceBefore = beforeChess.get(sq)
    const pieceAfter = afterChess.get(sq)

    // Same piece still at the same square
    if (!pieceBefore || !pieceAfter || pieceBefore.type !== pieceAfter.type) continue

    const wasDefended = beforeChess.isAttacked(sq, colorCode)
    const nowAttacked = afterChess.isAttacked(sq, oppCode)
    const nowUndefended = !afterChess.isAttacked(sq, colorCode)

    if (wasDefended && nowAttacked && nowUndefended) {
      result.push({ square: sq, piece: pieceAfter.type, wasDefendedBy: 'a friendly piece that moved' })
    }
  }

  return result
}

/**
 * Threats that existed BEFORE the user's move and still exist after.
 * = the user had a hanging piece, played a different move, and left it hanging.
 * This is the core of TACTICAL_02: opponent threatened something and user ignored it.
 */
function findThreatsIgnored(
  beforeChess: Chess,
  afterChess: Chess,
  opponentLastMove: string | null,
  userColor: 'white' | 'black',
): ThreatAnalysis['threatsIgnored'] {
  const colorCode = userColor === 'white' ? 'w' : 'b'
  const oppCode = userColor === 'white' ? 'b' : 'w'
  const ignored: ThreatAnalysis['threatsIgnored'] = []

  for (const sq of getPieceSquares(beforeChess, colorCode)) {
    const pieceBefore = beforeChess.get(sq)
    if (!pieceBefore) continue

    // Was this piece hanging BEFORE the move?
    if (!beforeChess.isAttacked(sq, oppCode) || beforeChess.isAttacked(sq, colorCode)) continue

    // Is the SAME piece STILL at that square and STILL hanging after the move?
    const pieceAfter = afterChess.get(sq)
    if (!pieceAfter || pieceAfter.color !== colorCode || pieceAfter.type !== pieceBefore.type) continue

    if (afterChess.isAttacked(sq, oppCode) && !afterChess.isAttacked(sq, colorCode)) {
      const name = PIECE_NAMES[pieceBefore.type] ?? pieceBefore.type
      ignored.push({
        description: `${name} on ${sq} was under attack and left undefended`,
        opponentMove: opponentLastMove ?? "opponent's last move",
        threat: `${name} on ${sq} can be captured for free`,
      })
    }
  }

  return ignored
}

export function analyzeThreats(
  before: Chess,
  after: Chess,
  opponentLastMove: string | null,
  userColor: 'white' | 'black',
): ThreatAnalysis {
  return {
    hangingPieces: findHangingPieces(after, userColor),
    piecesLeftUndefended: findPiecesLeftUndefended(before, after, userColor),
    threatsIgnored: findThreatsIgnored(before, after, opponentLastMove, userColor),
    threatsCreated: [], // MVP: not needed for TACTICAL coaching; implement in V2
  }
}
