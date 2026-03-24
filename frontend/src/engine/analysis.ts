// analysis.ts — Full game analysis orchestrator
// Parses a PGN, analyzes every position with Stockfish, returns per-move evals + grades.

import { Chess } from 'chess.js'
import { StockfishEngine } from './stockfish'
import { cleanPgn } from '../chess/pgn'
import { STARTING_FEN } from '../chess/constants'
import type { EvalResult } from './stockfish'

export type MoveGrade =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'miss'
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



const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

// A move is a sacrifice if the moved piece can be immediately recaptured by a less-valuable
// opponent piece (net material loss for the mover). Uses chess.js to check opponent moves.
export function isSacrificeFn(move: { piece: string; captured?: string; to: string }, fen: string): boolean {
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
 * Thresholds aligned with Lichess (inaccuracy≥50, mistake≥100, blunder≥300)
 * but with finer top-end buckets to distinguish excellent/good play.
 * Scores are treated as white-perspective (positive = white advantage).
 * Mate scores are capped at ±1000cp before computing loss.
 * cpLoss: positive = player's position worsened.
 *
 * Also detects chess.com-style "Great" and "Miss":
 *   Great: player was losing (≤-200cp) but this move saves the game (now ≥-50cp)
 *   Miss:  opponent's previous move was a blunder AND this move fails to capitalize (cpLoss > 60)
 */
export function classifyMove(
  evalBefore: number,
  evalAfter: number,
  color: 'white' | 'black',
  legalMoveCount: number,
  sacrifice = false,
  prevOpponentGrade: MoveGrade = null,
): MoveGrade {
  // Forced: only one legal move, no agency
  if (legalMoveCount === 1) return 'forced'

  // Cap to avoid mate scores (±30000) producing garbage cpLoss values
  const before = capScore(evalBefore)
  const after = capScore(evalAfter)

  // Player's eval before/after from their own perspective (positive = they're winning)
  const playerBefore = color === 'white' ? before : -before
  const playerAfter  = color === 'white' ? after  : -after

  // cpLoss from the player's perspective (positive = worsened)
  const cpLoss = playerBefore - playerAfter

  // Great: player was losing, this move saves the position
  if (playerBefore <= -200 && playerAfter >= -50 && cpLoss <= 25) return 'great'

  // Miss: opponent just blundered AND player fails to capitalize
  if (prevOpponentGrade === 'blunder' && cpLoss > 60) return 'miss'

  if (cpLoss <= 10 && sacrifice) return 'brilliant'
  if (cpLoss <= 10)  return 'best'
  if (cpLoss <= 25)  return 'excellent'
  if (cpLoss <= 60)  return 'good'
  if (cpLoss <= 120) return 'inaccuracy'
  if (cpLoss <= 300) return 'mistake'
  return 'blunder'
}

// ── Accuracy % (Lichess open formula) ────────────────────────────────────────

function cpToWinPct(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1)
}

function moveAccuracy(winBefore: number, winAfter: number): number {
  const loss = Math.max(0, winBefore - winAfter)
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669))
}

/**
 * Compute accuracy % for one color using Lichess's published win% formula.
 * Uses harmonic mean to penalize very bad moves more than simple average.
 */
export function computeAccuracy(moveEvals: MoveEval[], color: 'white' | 'black'): number {
  const accs: number[] = []
  let prevScore = 0
  for (const me of moveEvals) {
    const score = me.eval.score
    if (me.color !== color) { prevScore = score; continue }
    const winBefore = color === 'white' ? cpToWinPct(prevScore) : cpToWinPct(-prevScore)
    const winAfter  = color === 'white' ? cpToWinPct(score)     : cpToWinPct(-score)
    accs.push(moveAccuracy(winBefore, winAfter))
    prevScore = score
  }
  if (accs.length === 0) return 100
  // Harmonic mean — penalizes catastrophic blunders more than simple average
  const harmonic = accs.length / accs.reduce((sum, a) => sum + 1 / Math.max(1, a), 0)
  return Math.round(harmonic * 10) / 10
}

export async function analyzeGame(
  pgn: string,
  engine: StockfishEngine,
  depth = 18,
  onProgress?: (completed: number, total: number) => void,
  signal?: AbortSignal,
  movetime?: number,
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
  let prevOpponentGrade: MoveGrade = null

  for (let i = 0; i < history.length; i++) {
    if (signal?.aborted) break
    const move = history[i]
    const fen = positions[i + 1]
    const color: 'white' | 'black' = i % 2 === 0 ? 'white' : 'black'
    const evalResult = await engine.analyzePosition(fen, depth, movetime)

    // Stockfish score cp is from the side-to-move's perspective.
    // After white's move, black is to move → negate to get white-perspective.
    // After black's move, white is to move → already correct.
    const scoreWhite = color === 'white' ? -evalResult.score : evalResult.score
    // Normalize mateIn to white-perspective (same logic as score normalization):
    // After white's move, black is to move → engine mateIn is from black's perspective → negate.
    // After black's move, white is to move → engine mateIn is from white's perspective → use as-is.
    const mateInWhite = evalResult.mateIn !== null
      ? (color === 'white' ? -evalResult.mateIn : evalResult.mateIn)
      : null

    const sacrifice = isSacrificeFn(history[i], positions[i + 1])
    const grade = classifyMove(prevScore, scoreWhite, color, legalMoveCounts[i], sacrifice, prevOpponentGrade)

    const moveEval: MoveEval = {
      moveNumber: Math.floor(i / 2) + 1,
      color,
      san: move.san,
      fen,
      eval: { ...evalResult, score: scoreWhite, mateIn: mateInWhite },
      grade,
    }
    results.push(moveEval)
    onProgress?.(i + 1, history.length)
    prevScore = scoreWhite
    prevOpponentGrade = grade  // this move's grade becomes next move's prevOpponentGrade
  }

  return results
}
