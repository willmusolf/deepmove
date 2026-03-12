// pieceActivity.ts — Piece Activity Evaluator
// Evaluates: mobility per piece, centralization, bad bishop detection, passive pieces
// Key output: identifies the "worst piece" on the board for each side
// Tests: frontend/src/chess/__tests__/pieceActivity.test.ts

import type { PieceActivityScore } from './types'
import type { Chess } from 'chess.js'

export function evaluatePieceActivity(_chess: Chess, _color: 'white' | 'black'): PieceActivityScore {
  // TODO (Track B, Session 5)
  return { totalMobility: 0, centralizedPieces: 0, passivePieces: [], badBishop: null }
}
