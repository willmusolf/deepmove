// analysis.ts — Full game analysis orchestrator
// Parses a PGN, analyzes every position with Stockfish, returns per-move evals + grades.

import { Chess } from 'chess.js'
import { StockfishEngine } from './stockfish'
import { cleanPgn } from '../chess/pgn'
import { STARTING_FEN } from '../chess/constants'
import type { EvalResult, TopLine } from './stockfish'

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

// ── Win-probability grade thresholds ─────────────────────────────────────────
// All values are % win-probability loss from the player's perspective.
// Using win% instead of raw centipawns means a move in an already-won position
// doesn't get over-penalised (the curve flattens at the extremes).
const WINPCT_EXCELLENT  = 2.0   // ≤ 2%  → excellent (or better)
const WINPCT_GOOD       = 5.0   // ≤ 5%  → good
const WINPCT_INACCURACY = 10.0  // ≤ 10% → inaccuracy
const WINPCT_MISTAKE    = 22.0  // ≤ 22% → mistake  (> 22% → blunder)

// Min win-% gap between engine's #1 and #2 lines for a move to qualify as "great"
const WINPCT_GREAT_GAP = 10.0

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

// Cap mate scores so ±30000 doesn't distort win% calculations
const SCORE_CAP = 1000
function capScore(s: number): number {
  return Math.max(-SCORE_CAP, Math.min(SCORE_CAP, s))
}

/**
 * Convert centipawns (white-perspective) to win probability %.
 * Uses Lichess's published formula. Exported so branch eval can reuse it.
 */
export function cpToWinPct(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1)
}

/**
 * Classify a move using win-probability loss thresholds (Chess.com / Lichess approach).
 *
 * Grade priority:
 *   forced > brilliant > great > best > miss > excellent > good > inaccuracy > mistake > blunder
 *
 * "Great" (!) — the only good move in the position: top engine move AND it's significantly
 *   better than the 2nd-best option (gap ≥ WINPCT_GREAT_GAP). Recaptures are excluded
 *   because it's obvious you recapture after a trade.
 *
 * "Miss" (✗) — opponent just blundered but player fails to capitalise (winPctLoss > WINPCT_GOOD).
 */
export function classifyMove(
  evalBefore: number,
  evalAfter: number,
  color: 'white' | 'black',
  legalMoveCount: number,
  sacrifice = false,
  prevOpponentGrade: MoveGrade = null,
  isTopSuggested = true,
  isOnlyGoodMove = false,
): MoveGrade {
  // Forced: only one legal move, no agency
  if (legalMoveCount === 1) return 'forced'

  const playerBefore = color === 'white' ? capScore(evalBefore) : -capScore(evalBefore)
  const playerAfter  = color === 'white' ? capScore(evalAfter)  : -capScore(evalAfter)

  // Win-probability loss from the player's perspective (positive = they lost winning chance)
  const winPctLoss = cpToWinPct(playerBefore) - cpToWinPct(playerAfter)

  // Brilliant: sacrifice + top-suggested + no meaningful win% loss
  if (sacrifice && isTopSuggested && winPctLoss <= WINPCT_EXCELLENT) return 'brilliant'

  // Great: only good move in position (top-suggested + big gap from #2, not a recapture)
  if (isTopSuggested && isOnlyGoodMove && winPctLoss <= WINPCT_EXCELLENT) return 'great'

  // Best: top-suggested move with no meaningful win% loss
  if (isTopSuggested && winPctLoss <= WINPCT_EXCELLENT) return 'best'

  // Miss: opponent just blundered AND player fails to capitalise
  if (prevOpponentGrade === 'blunder' && winPctLoss > WINPCT_GOOD) return 'miss'

  if (winPctLoss <= WINPCT_EXCELLENT)  return 'excellent'
  if (winPctLoss <= WINPCT_GOOD)       return 'good'
  if (winPctLoss <= WINPCT_INACCURACY) return 'inaccuracy'
  if (winPctLoss <= WINPCT_MISTAKE)    return 'mistake'
  return 'blunder'
}

// ── Accuracy % (Lichess open formula) ────────────────────────────────────────

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

function terminalEvalFromFen(fen: string): EvalResult | null {
  try {
    const chess = new Chess(fen)
    if (chess.isCheckmate()) {
      const score = chess.turn() === 'w' ? -30000 : 30000
      return {
        fen,
        score,
        isMate: true,
        mateIn: 0,
        bestMove: '',
        pv: [],
        depth: 0,
      }
    }
    if (chess.isDraw()) {
      return {
        fen,
        score: 0,
        isMate: false,
        mateIn: null,
        bestMove: '',
        pv: [],
        depth: 0,
      }
    }
  } catch {
    return null
  }

  return null
}

export async function analyzeGame(
  pgn: string,
  engine: StockfishEngine,
  depth = 18,
  onProgress?: (completed: number, total: number) => void,
  signal?: AbortSignal,
  _movetime?: number,  // unused — multi-PV doesn't support movetime; kept for API compat
  onMoveComplete?: (eval_: MoveEval, index: number) => void,
  startFromIndex = 0,
  initialEvals: MoveEval[] = [],
): Promise<MoveEval[]> {
  const chess = new Chess()
  chess.loadPgn(cleanPgn(pgn))
  const history = chess.history({ verbose: true })

  // Build position list: [startFen, afterMove1, afterMove2, ...]
  const positions: string[] = [STARTING_FEN, ...history.map(m => m.after)]

  // Start with already-analyzed evals (from resume)
  const results: MoveEval[] = [...initialEvals]

  // Pre-compute legal move counts at each position BEFORE the move
  const legalMoveCounts: number[] = []
  for (let i = 0; i < history.length; i++) {
    const tempChess = new Chess(positions[i])
    legalMoveCounts.push(tempChess.moves().length)
  }

  // Seed prevScore/prevOpponentGrade from the last known eval (for resume continuity)
  let prevScore = results.length > 0 ? results[results.length - 1].eval.score : 0
  let prevOpponentGrade: MoveGrade = results.length > 0 ? results[results.length - 1].grade : null

  // prevTopLines: multi-PV results from the position BEFORE the current move.
  // Used to check whether the played move was the engine's top suggestion ("best")
  // and whether it was the ONLY good move ("great").
  // Seeded from the current starting position so even move 1 has a real
  // top-suggestion check instead of defaulting to "best".
  let prevTopLines: TopLine[] = []
  if (startFromIndex < history.length && !signal?.aborted) {
    try {
      prevTopLines = await engine.analyzePositionMultiPV(positions[startFromIndex], depth, 2)
    } catch {
      prevTopLines = []
    }
  }

  for (let i = startFromIndex; i < history.length; i++) {
    if (signal?.aborted) break
    const move = history[i]
    const fen = positions[i + 1]
    const color: 'white' | 'black' = i % 2 === 0 ? 'white' : 'black'

    // Multi-PV(2): gives us the eval AND top-2 lines for the next move's "great" check
    const topLines = await engine.analyzePositionMultiPV(fen, depth, 2)
    const terminalEval = topLines.length === 0 ? terminalEvalFromFen(fen) : null
    if (topLines.length === 0 && !terminalEval) {
      // Unexpected empty engine result in a non-terminal position — preserve resumeability
      prevTopLines = topLines
      continue
    }

    const primaryEval = terminalEval ?? {
      fen,
      score: topLines[0].score,
      isMate: topLines[0].isMate,
      mateIn: topLines[0].mateIn,
      bestMove: topLines[0].pv[0] ?? '',
      pv: topLines[0].pv,
      depth: topLines[0].depth,
    }

    const scoreWhite = primaryEval.score

    const sacrifice = isSacrificeFn(history[i], positions[i + 1])

    // Determine if the played move was the engine's top suggestion at this position
    const playedUci = move.from + move.to + (move.promotion ?? '')
    const isTopSuggested = prevTopLines.length === 0 || prevTopLines[0]?.pv?.[0] === playedUci

    // Determine if it was the "only good move" (qualifies for "great")
    let isOnlyGoodMove = false
    if (isTopSuggested && prevTopLines.length >= 2 && prevTopLines[1]?.pv?.[0]) {
      const prevMove = i > 0 ? history[i - 1] : null
      // Exclude obvious recaptures: previous move was a capture, current move captures same square
      const isRecapture = !!(prevMove?.captured && move.to === prevMove.to)
      if (!isRecapture) {
        // Win% gap between top move and second-best, from the player's perspective
        const topWin    = color === 'white' ? cpToWinPct(prevTopLines[0].score) : cpToWinPct(-prevTopLines[0].score)
        const secondWin = color === 'white' ? cpToWinPct(prevTopLines[1].score) : cpToWinPct(-prevTopLines[1].score)
        isOnlyGoodMove = (topWin - secondWin) >= WINPCT_GREAT_GAP
      }
    }

    const grade = classifyMove(
      prevScore, scoreWhite, color, legalMoveCounts[i],
      sacrifice, prevOpponentGrade, isTopSuggested, isOnlyGoodMove,
    )

    const moveEval: MoveEval = {
      moveNumber: Math.floor(i / 2) + 1,
      color,
      san: move.san,
      fen,
      eval: primaryEval,
      grade,
    }
    results.push(moveEval)
    onMoveComplete?.(moveEval, i)
    onProgress?.(results.length, history.length)
    prevScore = scoreWhite
    prevOpponentGrade = grade  // this move's grade becomes next move's prevOpponentGrade
    prevTopLines = topLines   // store for next iteration's "great" / "best" check
  }

  return results
}
