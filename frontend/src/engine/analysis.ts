// analysis.ts — Full game analysis orchestrator
// Parses a PGN, analyzes every position with Stockfish, returns per-move evals + grades.

import { Chess } from 'chess.js'
import { StockfishEngine } from './stockfish'
import { cleanPgn } from '../chess/pgn'
import type { EvalResult } from './stockfish'

export type MoveGrade =
  | 'brilliant'
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'forced'
  | null

export interface MoveEval {
  moveNumber: number
  color: 'white' | 'black'
  san: string
  fen: string           // FEN *after* this move
  eval: EvalResult
  grade: MoveGrade
}

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'


const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

// A move is a sacrifice if the moved piece can be immediately recaptured by a less-valuable
// opponent piece (net material loss for the mover). Uses chess.js to check opponent moves.
function isSacrificeFn(move: { piece: string; captured?: string; to: string }, fen: string): boolean {
  const movedValue = PIECE_VALUES[move.piece] ?? 0
  const capturedValue = move.captured ? (PIECE_VALUES[move.captured] ?? 0) : 0
  const netGiven = movedValue - capturedValue
  if (netGiven <= 0) return false  // not giving up net material

  const tempChess = new Chess(fen)
  const opMoves = tempChess.moves({ verbose: true }) as Array<{ to: string; piece: string; captured?: string }>
  return opMoves.some(
    m => m.to === move.to && m.captured !== undefined && (PIECE_VALUES[m.piece] ?? 0) < netGiven
  )
}

// Cap mate scores so ±30000 doesn't distort cpLoss calculations
const SCORE_CAP = 1000
function capScore(s: number): number {
  return Math.max(-SCORE_CAP, Math.min(SCORE_CAP, s))
}

/**
 * Classify a move based on centipawn loss from the player's perspective.
 * Scores are treated as white-perspective (positive = white advantage).
 * Mate scores are capped at ±1000cp before computing loss.
 * cpLoss: positive = player's position worsened.
 */
export function classifyMove(
  evalBefore: number,
  evalAfter: number,
  color: 'white' | 'black',
  legalMoveCount: number,
  sacrifice = false,
): MoveGrade {
  // Forced: only one legal move, no agency
  if (legalMoveCount === 1) return 'forced'

  // Cap to avoid mate scores (±30000) producing garbage cpLoss values
  const before = capScore(evalBefore)
  const after = capScore(evalAfter)

  // cpLoss from the player's perspective (positive = worsened)
  const cpLoss = color === 'white'
    ? (before - after)
    : (after - before)

  if (cpLoss <= 5 && sacrifice) return 'brilliant'
  if (cpLoss <= 5)   return 'best'
  if (cpLoss <= 15)  return 'excellent'
  if (cpLoss <= 50)  return 'good'
  if (cpLoss <= 150) return 'inaccuracy'
  if (cpLoss <= 300) return 'mistake'
  return 'blunder'
}

export async function analyzeGame(
  pgn: string,
  engine: StockfishEngine,
  depth = 18,
  onProgress?: (completed: number, total: number, latest: MoveEval) => void,
): Promise<MoveEval[]> {
  const chess = new Chess()
  chess.loadPgn(cleanPgn(pgn))
  const history = chess.history({ verbose: true })

  // Build position list: [startFen, afterMove1, afterMove2, ...]
  const positions: string[] = [STARTING_FEN, ...history.map(m => m.after)]

  const results: MoveEval[] = []

  // Pre-compute legal move counts at each position BEFORE the move
  const legalMoveCounts: number[] = []
  for (let i = 0; i < history.length; i++) {
    const tempChess = new Chess(positions[i])
    legalMoveCounts.push(tempChess.moves().length)
  }

  let prevScore = 0  // Starting position eval (assume ~0)

  for (let i = 0; i < history.length; i++) {
    const move = history[i]
    const fen = positions[i + 1]
    const color: 'white' | 'black' = i % 2 === 0 ? 'white' : 'black'
    const evalResult = await engine.analyzePosition(fen, depth)

    // Stockfish score cp is from the side-to-move's perspective.
    // After white's move, black is to move → negate to get white-perspective.
    // After black's move, white is to move → already correct.
    const scoreWhite = color === 'white' ? -evalResult.score : evalResult.score

    const sacrifice = isSacrificeFn(history[i], positions[i + 1])
    const grade = classifyMove(prevScore, scoreWhite, color, legalMoveCounts[i], sacrifice)

    const moveEval: MoveEval = {
      moveNumber: Math.floor(i / 2) + 1,
      color,
      san: move.san,
      fen,
      eval: { ...evalResult, score: scoreWhite },
      grade,
    }
    results.push(moveEval)
    onProgress?.(i + 1, history.length, moveEval)
    prevScore = scoreWhite
  }

  return results
}
