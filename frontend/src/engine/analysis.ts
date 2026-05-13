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

function buildTerminalTopLine(fen: string, depth: number): TopLine[] {
  try {
    const chess = new Chess(fen)
    if (chess.isCheckmate()) {
      const sideToMove = fen.split(' ')[1] === 'b' ? 'black' : 'white'
      const score = sideToMove === 'white' ? -30_000 : 30_000
      return [{
        rank: 1,
        score,
        isMate: true,
        mateIn: sideToMove === 'white' ? -1 : 1,
        pv: [],
        san: '',
        depth,
      }]
    }
    if (chess.isDraw()) {
      return [{
        rank: 1,
        score: 0,
        isMate: false,
        mateIn: null,
        pv: [],
        san: '',
        depth,
      }]
    }
  } catch {
    // Fall through — empty array means caller will keep the previous guard behavior.
  }
  return []
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

// Min win-probability the player must have HAD before the move for a brilliant to be valid
// Prevents awarding !! in already-lost positions where winPctLoss is trivially near 0
const WINPCT_MIN_FOR_BRILLIANT = 20.0  // ~-350cp from player's perspective
const WINPCT_MISS_OPPORTUNITY = 6.0
const WINPCT_GREAT_CHECKING_WIN = 88.0

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 999 }

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

function scoreToPlayerWinPct(scoreWhite: number, color: 'white' | 'black'): number {
  return color === 'white' ? cpToWinPct(scoreWhite) : cpToWinPct(-scoreWhite)
}

interface ClassifyMoveContext {
  availableChanceWinPct?: number
  missedChanceWinPct?: number
  isCheckingMove?: boolean
  isPromotionMove?: boolean
}

/**
 * Classify a move using win-probability loss thresholds (Chess.com / Lichess approach).
 *
 * Grade priority:
 *   forced > brilliant > great > best > miss > excellent > good > inaccuracy > mistake > blunder
 *
 * "Brilliant" (!!) — a sound sacrifice: top engine move, no meaningful win% loss,
 *   and the player was not already dead lost. This intentionally does NOT require
 *   the move to be the only good option; forcing that check under-awards common
 *   Chess.com-style brilliants where multiple winning continuations exist.
 *
 * "Great" (!) — the only good move in the position: top engine move AND it's significantly
 *   better than the 2nd-best option (gap ≥ WINPCT_GREAT_GAP). Recaptures are excluded
 *   because it's obvious you recapture after a trade. Immediate checkmates are also
 *   excluded so obvious finishing blows stay "best" rather than being over-promoted.
 *   We also suppress "great" for forcing checks/promotions when the side was already
 *   overwhelmingly winning, which keeps conversion moves from being over-awarded.
 *
 * "Miss" (✗) — player overlooks a concrete chance to improve their winning chances,
 *   either from the position itself or because the opponent just made a mistake/blunder.
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
  inCheck = false,
  isCheckmateMove = false,
  context: ClassifyMoveContext = {},
): MoveGrade {
  // Forced: only one legal move, no agency
  if (legalMoveCount === 1) return 'forced'

  const playerBefore = color === 'white' ? capScore(evalBefore) : -capScore(evalBefore)
  const playerAfter  = color === 'white' ? capScore(evalAfter)  : -capScore(evalAfter)
  const playerBeforeWinPct = cpToWinPct(playerBefore)

  // Win-probability loss from the player's perspective (positive = they lost winning chance)
  const winPctLoss = playerBeforeWinPct - cpToWinPct(playerAfter)
  const availableChanceWinPct = Math.max(0, context.availableChanceWinPct ?? 0)
  const missedChanceWinPct = Math.max(0, context.missedChanceWinPct ?? 0)

  // Suppress "great" when responding to check, delivering immediate mate, or converting
  // an already-winning position with an obvious forcing check/promotion.
  const suppressGreatForForcingWin =
    (context.isCheckingMove || context.isPromotionMove) && playerBeforeWinPct >= WINPCT_GREAT_CHECKING_WIN
  const effectiveOnlyGoodMove = (inCheck || isCheckmateMove || suppressGreatForForcingWin) ? false : isOnlyGoodMove

  // Brilliant: sound sacrifice + top-suggested + no meaningful win% loss.
  // We still suppress check-escape brilliants because getting out of check is too forced.
  if (!inCheck && sacrifice && isTopSuggested && winPctLoss <= WINPCT_EXCELLENT
      && playerBeforeWinPct >= WINPCT_MIN_FOR_BRILLIANT) return 'brilliant'

  // Great: only good move in position (top-suggested + big gap from #2, not a recapture).
  // Uses WINPCT_GOOD (5%) not WINPCT_EXCELLENT — a defensive resource can cost a few percent
  // yet still be the only sane option; restricting to 2% silently downgrades those moves.
  if (isTopSuggested && effectiveOnlyGoodMove && winPctLoss <= WINPCT_GOOD) return 'great'

  // Best: top-suggested move with no meaningful win% loss
  if (isTopSuggested && winPctLoss <= WINPCT_EXCELLENT) return 'best'

  // Miss: player fails to capitalize on a concrete tactical or strategic opportunity.
  const opponentCreatedChance = prevOpponentGrade === 'mistake' || prevOpponentGrade === 'blunder'
  if (
    !isTopSuggested
    && missedChanceWinPct >= WINPCT_MISS_OPPORTUNITY
    && (availableChanceWinPct >= WINPCT_MISS_OPPORTUNITY || opponentCreatedChance)
  ) return 'miss'

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
 * Uses a blended harmonic/arithmetic mean to keep catastrophic blunders costly
 * without producing unrealistically harsh game-level accuracy collapses.
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
  const harmonic = accs.length / accs.reduce((sum, a) => sum + 1 / Math.max(1, a), 0)
  const arithmetic = accs.reduce((sum, a) => sum + a, 0) / accs.length
  const blended = 0.65 * harmonic + 0.35 * arithmetic
  return Math.round(Math.max(0, Math.min(100, blended)) * 10) / 10
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

  // Pre-compute legal move counts and check status at each position BEFORE the move
  const legalMoveCounts: number[] = []
  const inCheckFlags: boolean[] = []
  const checkmateAfterFlags: boolean[] = []
  for (let i = 0; i < history.length; i++) {
    const tempChess = new Chess(positions[i])
    legalMoveCounts.push(tempChess.moves().length)
    inCheckFlags.push(tempChess.isCheck())
    checkmateAfterFlags.push(new Chess(positions[i + 1]).isCheckmate())
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
    const analyzedLines = await engine.analyzePositionMultiPV(fen, depth, 2)
    const topLines = analyzedLines.length > 0 ? analyzedLines : buildTerminalTopLine(fen, depth)
    if (topLines.length === 0) {
      // Shouldn't happen, but guard against empty results
      prevTopLines = topLines
      continue
    }

    const scoreWhite = topLines[0].score
    const mateInWhite = topLines[0].mateIn

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
        const topWin = scoreToPlayerWinPct(prevTopLines[0].score, color)
        const secondWin = scoreToPlayerWinPct(prevTopLines[1].score, color)
        isOnlyGoodMove = (topWin - secondWin) >= WINPCT_GREAT_GAP
      }
    }

    const playerBeforeWinPct = scoreToPlayerWinPct(prevScore, color)
    const topSuggestedWinPct = prevTopLines.length > 0 ? scoreToPlayerWinPct(prevTopLines[0].score, color) : playerBeforeWinPct
    const actualAfterWinPct = scoreToPlayerWinPct(scoreWhite, color)
    const availableChanceWinPct = Math.max(0, topSuggestedWinPct - playerBeforeWinPct)
    const missedChanceWinPct = Math.max(0, topSuggestedWinPct - actualAfterWinPct)

    const grade = classifyMove(
      prevScore, scoreWhite, color, legalMoveCounts[i],
      sacrifice, prevOpponentGrade, isTopSuggested, isOnlyGoodMove, inCheckFlags[i], checkmateAfterFlags[i], {
        availableChanceWinPct,
        missedChanceWinPct,
        isCheckingMove: move.san.includes('+') || move.san.includes('#'),
        isPromotionMove: Boolean(move.promotion),
      },
    )

    const moveEval: MoveEval = {
      moveNumber: Math.floor(i / 2) + 1,
      color,
      san: move.san,
      fen,
      eval: {
        fen,
        score: scoreWhite,
        isMate: topLines[0].isMate,
        mateIn: mateInWhite,
        bestMove: topLines[0].pv[0] ?? '',
        pv: topLines[0].pv,
        depth: topLines[0].depth,
      },
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
