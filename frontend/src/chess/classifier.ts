// classifier.ts — Rules-based principle classifier
// Input: PositionFeatures + context
// Output: ClassificationResult with principle ID + confidence score (0-100)
//
// PRIORITY QUEUE RULE (from CLAUDE.md):
//   If TACTICAL_01 or TACTICAL_02 triggers → suppress ALL other classifications.
//   A hanging piece is always the lesson. Never also mention pawn structure.
//
// Confidence scoring:
//   90-100: One clear principle, strong signals (e.g. piece literally hanging)
//   70-89:  Likely principle, somewhat complex position
//   50-69:  Multiple principles could apply → use simplified fallback lesson
//   <50:    Too ambiguous → describe what changed without asserting a principle
//
// Classifier evaluates rules in this priority order:
//   1. TACTICAL_01 — blunder check (hanging piece created by user's move)
//   2. TACTICAL_02 — ignored opponent threat (threat existed before, user didn't respond)
//   3. OPENING_02  — castle early
//   4. OPENING_01  — complete development
//   5. OPENING_05  — don't move same piece twice
//   6. Fallback    — null (no confident principle)
//
// Tests: frontend/src/chess/__tests__/classifier.test.ts

import type { AnalysisFacts, ClassificationResult, CriticalMoment, MistakeCategory, PositionFeatures } from './types'
import { CATEGORIES, PRINCIPLES } from './taxonomy'

/** Check if a principle is appropriate for the user's Elo */
export function isInEloGate(principleId: string, userElo: number): boolean {
  const principle = PRINCIPLES[principleId]
  if (!principle) return false
  return userElo >= principle.eloMin && userElo <= principle.eloMax
}

function makeResult(principleId: string, confidence: number): ClassificationResult {
  const { eloMin = 0, eloMax = 9999 } = PRINCIPLES[principleId] ?? {}
  return { principleId, confidence, eloGateMin: eloMin, eloGateMax: eloMax }
}

export function classifyPrinciple(
  features: PositionFeatures,
  moment: Pick<CriticalMoment, 'evalSwing' | 'moveNumber' | 'color'>,
  userElo: number,
): ClassificationResult | null {
  const { threats, development, gamePhase } = features
  const cpLoss = moment.evalSwing
  const moveNumber = moment.moveNumber

  // ── 1. TACTICAL_01 — Blunder Check (hanging piece after user's move) ────────
  // A piece is now hanging that wasn't necessarily hanging before.
  // The user's move created or exposed a hanging piece.
  if (
    isInEloGate('TACTICAL_01', userElo) &&
    threats.hangingPieces.length > 0 &&
    cpLoss >= 150
  ) {
    const confidence = Math.min(95, 70 + Math.floor(cpLoss / 10))
    return makeResult('TACTICAL_01', confidence)
  }

  // ── 2. TACTICAL_02 — Ignored Opponent Threat ────────────────────────────────
  // The piece was already threatened before the user's move, and user ignored it.
  if (
    isInEloGate('TACTICAL_02', userElo) &&
    threats.threatsIgnored.length > 0 &&
    cpLoss >= 100
  ) {
    const confidence = Math.min(90, 65 + Math.floor(cpLoss / 8))
    return makeResult('TACTICAL_02', confidence)
  }

  // ── 3. OPENING_02 — Castle Early ────────────────────────────────────────────
  // In opening, king still uncastled after move 10.
  const userDev = moment.color === 'white' ? development.white : development.black
  const userKingSafety = moment.color === 'white' ? features.kingSafety.white : features.kingSafety.black
  if (
    isInEloGate('OPENING_02', userElo) &&
    (gamePhase === 'opening' || gamePhase === 'early_middlegame') &&
    userKingSafety.castled === 'none' &&
    moveNumber > 10
  ) {
    return makeResult('OPENING_02', 75)
  }

  // ── 4. OPENING_01 — Complete Development ────────────────────────────────────
  // Still has 2+ minor pieces undeveloped in opening phase.
  if (
    isInEloGate('OPENING_01', userElo) &&
    (gamePhase === 'opening' || gamePhase === 'early_middlegame') &&
    userDev.undevelopedMinorPieces >= 2
  ) {
    return makeResult('OPENING_01', 72)
  }

  // ── 5. OPENING_05 — Don't Move Same Piece Twice ─────────────────────────────
  if (
    isInEloGate('OPENING_05', userElo) &&
    gamePhase === 'opening' &&
    userDev.sameMovedTwice
  ) {
    return makeResult('OPENING_05', 78)
  }

  // ── Fallback: no confident principle ────────────────────────────────────────
  return null
}

function describeMistakeType(features: PositionFeatures): AnalysisFacts['mistakeType'] {
  return features.engineMoveImpact.isForcing ? 'tactical' : 'strategic'
}

function determineCategory(
  features: PositionFeatures,
  moment: Pick<CriticalMoment, 'moveNumber' | 'color' | 'evalSwing'>,
  futureUserScores: number[] = [],
): MistakeCategory {
  const userDev = moment.color === 'white' ? features.development.white : features.development.black
  const userKing = moment.color === 'white' ? features.kingSafety.white : features.kingSafety.black

  if (features.threats.hangingPieces.length > 0) {
    // Sacrifice / trap guard: if eval recovers within 3 half-moves, this was likely
    // intentional — don't label it as a blunder when it isn't.
    // futureUserScores are player-perspective: positive = good for user
    const evalRecovers = futureUserScores.slice(0, 3).some(s => s > 50)
    if (!evalRecovers) {
      const hangingPiece = features.threats.hangingPieces[0]
      const isPawnOrMinor = hangingPiece?.piece === 'p' || hangingPiece?.piece === 'n' || hangingPiece?.piece === 'b'
      const swingThreshold = hangingPiece?.piece === 'p' ? 200 : 100
      // If only a pawn/minor is hanging but there's a bigger forcing tactical blow,
      // yield to missed_tactic — the hanging piece is a symptom, not the lesson.
      const bigTactical = features.engineMoveImpact.isForcing && moment.evalSwing >= 250
      if (moment.evalSwing >= swingThreshold && !(isPawnOrMinor && bigTactical)) {
        return 'hung_piece'
      }
    }
    // eval recovers or threshold not met → fall through to other checks
  }
  if (features.threats.threatsIgnored.length > 0) return 'ignored_threat'
  // missed_tactic: the engine's best move must involve a genuine tactical blow, not just
  // any capture. A capture-only "best move" at 250cp is usually just picking up a hanging
  // piece — that's a hung_piece or ignored_threat lesson, not a "missed tactic."
  // True missed tactics: check + capture combo, check alone with big swing, or massive swing
  // (≥400cp) suggesting a real combination the user missed.
  if (features.engineMoveImpact.isForcing) {
    const emi = features.engineMoveImpact
    const isTrueTactic = (
      (emi.givesCheck && moment.evalSwing >= 150) ||           // check = always tactical
      (emi.givesCheck && emi.isCapture) ||                      // check + capture = double threat
      (moment.evalSwing >= 250 && emi.isCapture) ||             // winning material = real tactic
      (moment.evalSwing >= 300 && emi.isForcing)                // big swing + forcing = missed tactic
    )
    if (isTrueTactic) return 'missed_tactic'
  }
  if (
    (features.gamePhase === 'opening' || features.gamePhase === 'early_middlegame') &&
    userKing.castled === 'none' &&
    moment.moveNumber >= 8 &&
    userKing.score >= 30
  ) {
    return 'didnt_castle'
  }
  if (
    (features.gamePhase === 'opening' || features.gamePhase === 'early_middlegame') &&
    userDev.undevelopedMinorPieces >= 2 &&
    // Don't flag didnt_develop if the move itself developed a piece
    !features.moveImpact.developedPiece &&
    // Don't flag didnt_develop if the move was a forced retreat of an already-developed piece.
    // Heuristic: minor piece moved, eval swing is small (<120cp), and piece didn't come from start square.
    // A genuinely bad non-development move has a larger eval swing.
    !(features.moveImpact.pieceMoved === 'n' || features.moveImpact.pieceMoved === 'b'
      ? moment.evalSwing < 120
      : false)
  ) {
    return 'didnt_develop'
  }
  // A large eval swing on an "aimless" move almost always means something tactical happened
  // (e.g. queen trap, fork setup). Never label >200cp swings as aimless — use missed_tactic.
  if (!features.moveImpact.hadClearPurpose) {
    // Only escalate to missed_tactic if it's a genuine tactical blow (check or huge swing)
    const emi2 = features.engineMoveImpact
    if (emi2.isForcing && (emi2.givesCheck || moment.evalSwing >= 300)) return 'missed_tactic'
    return 'aimless_move'
  }
  return 'unknown'
}

function buildMoveEffectFact(
  features: PositionFeatures,
  moment: Pick<CriticalMoment, 'movePlayed' | 'moveNumber'>,
): string {
  return `What your move did: move ${moment.moveNumber}, ${moment.movePlayed}. ${features.moveImpact.description}.`
}

function buildFailureFact(
  features: PositionFeatures,
  moment: Pick<CriticalMoment, 'moveNumber' | 'color' | 'evalSwing'>,
  category: MistakeCategory,
): string {
  const userDev = moment.color === 'white' ? features.development.white : features.development.black
  const userKing = moment.color === 'white' ? features.kingSafety.white : features.kingSafety.black

  switch (category) {
    case 'hung_piece': {
      const allHanging = features.threats.hangingPieces
      if (allHanging.length === 0) return 'What your move failed to do: it left material loose.'
      const descriptions = allHanging.map(h => {
        const name = PIECE_NAME_MAP[h.piece] ?? h.piece
        return `your ${name} on ${h.square}`
      })
      const hangingText = descriptions.length === 1
        ? descriptions[0]
        : descriptions.slice(0, -1).join(', ') + ' and ' + descriptions[descriptions.length - 1]
      return `What your move failed to do: it left ${hangingText} undefended and under attack.`
    }
    case 'ignored_threat': {
      const threat = features.threats.threatsIgnored[0]
      return threat
        ? `What your move failed to do: it ignored ${threat.description}.`
        : "What your move failed to do: it did not answer your opponent's threat."
    }
    case 'missed_tactic': {
      const emi = features.engineMoveImpact
      const parts: string[] = []
      if (emi.givesCheck) parts.push('gives check')
      if (emi.isCapture) parts.push('wins material')
      const detail = parts.length > 0 ? parts.join(' and ') : 'creates a concrete threat'
      const moveRef = emi.bestMoveSan ? ` (${emi.bestMoveSan})` : ''
      return `What your move failed to do: the position had a forcing move${moveRef} that ${detail}, but you played a quieter move instead.`
    }
    case 'didnt_castle':
      return `What your move failed to do: your king stayed in the center with a king-safety score of ${userKing.score}/100.`
    case 'didnt_develop':
      return `What your move failed to do: you still had ${userDev.undevelopedMinorPieces} minor pieces undeveloped on move ${moment.moveNumber}.`
    case 'aimless_move':
      return 'What your move failed to do: it did not capture, give check, develop, castle, or create a clear threat.'
    default: {
      // Build the most specific fallback we can from available features
      const emi = features.engineMoveImpact
      // Name the actual problem using engine move data
      if (emi.mainIdea) {
        return `What your move failed to do: ${emi.mainIdea.charAt(0).toLowerCase() + emi.mainIdea.slice(1)}${emi.mainIdea.endsWith('.') ? '' : '.'} Instead your move cost ${moment.evalSwing}cp.`
      }
      // Fall back to threat info if available
      if (features.threats.hangingPieces.length > 0) {
        const hp = features.threats.hangingPieces[0]
        const name = PIECE_NAME_MAP[hp.piece] ?? hp.piece
        return `What your move failed to do: it left your ${name} on ${hp.square} vulnerable, costing ${moment.evalSwing}cp.`
      }
      if (features.threats.threatsIgnored.length > 0) {
        const ti = features.threats.threatsIgnored[0]
        return `What your move failed to do: ${ti.description}, costing ${moment.evalSwing}cp.`
      }
      return `What your move failed to do: the position needed a more active approach — your move cost ${moment.evalSwing}cp without creating threats or improving your pieces.`
    }
  }
}

function buildBetterIdeaFact(features: PositionFeatures): string {
  if (features.engineMoveImpact.mainIdea) {
    return `What the better move would have done: ${features.engineMoveImpact.mainIdea}.`
  }
  if (features.engineMoveImpact.description) {
    return `What the better move would have done: ${features.engineMoveImpact.description}.`
  }
  // Derive a basic description from the engine move SAN when extraction failed
  const san = features.engineMoveImpact.bestMoveSan ?? ''
  if (san) {
    if (san.startsWith('O-O')) return 'What the better move would have done: castling first kept the king safe and connected the rooks.'
    if (san.includes('+')) return 'What the better move would have done: it gave check, creating immediate threats the opponent had to answer.'
    if (san.includes('x')) return 'What the better move would have done: it made a capture that won material or opened lines.'
    if (san[0] === 'R') return 'What the better move would have done: it activated the rook on an open or important file.'
    if (san[0] === 'Q') return 'What the better move would have done: it put the queen on a more active and threatening square.'
  }
  return 'What the better move would have done: it solved the most urgent problem in the position.'
}

function formatCp(cp: number): string {
  return `${cp >= 0 ? '+' : ''}${cp}cp`
}

function buildConsequenceFact(
  moment: Pick<CriticalMoment, 'evalAfter'>,
  futureUserScores: number[],
): string {
  if (futureUserScores.length === 0) {
    return `What happened next: the move already left you at ${formatCp(moment.evalAfter)} from your side of the board.`
  }

  const current = moment.evalAfter
  const bestFuture = Math.max(...futureUserScores)
  const worstFuture = Math.min(...futureUserScores)

  if (worstFuture <= current - 80) {
    return `What happened next: over the next ${futureUserScores.length} half-moves, your eval dropped from ${formatCp(current)} to ${formatCp(worstFuture)}.`
  }
  if (bestFuture >= current + 80) {
    return `What happened next: over the next ${futureUserScores.length} half-moves, the eval recovered from ${formatCp(current)} to ${formatCp(bestFuture)}, but this move still started the slide.`
  }
  return `What happened next: over the next ${futureUserScores.length} half-moves, the eval stayed worse at roughly ${formatCp(current)} to ${formatCp(worstFuture)}.`
}

export function buildAnalysisFacts(
  features: PositionFeatures,
  moment: Pick<CriticalMoment, 'evalSwing' | 'moveNumber' | 'color' | 'movePlayed' | 'evalAfter'>,
  futureUserScores: number[] = [],
): AnalysisFacts {
  // Suppress lessons for dead-lost endgame positions — they are not teachable.
  // evalAfter is from the user's perspective: negative = bad for user.
  const isDeadLost = moment.evalAfter <= -500 && features.gamePhase === 'endgame'

  const category = isDeadLost ? 'unknown' : determineCategory(features, moment, futureUserScores)
  const categoryName = CATEGORIES[category]?.name ?? CATEGORIES.unknown.name
  const mistakeType = describeMistakeType(features)
  const primaryIssue = isDeadLost
    ? `Position context: ${features.gamePhase}, move ${moment.moveNumber}. This position was already heavily losing (${moment.evalAfter}cp) — the critical mistake happened earlier in the game.`
    : `Mistake type: ${mistakeType}. Game phase: ${features.gamePhase}, move ${moment.moveNumber}. Eval swing: ${moment.evalSwing}cp. The better move was ${features.engineMoveImpact.isForcing ? 'forcing' : 'a quiet improvement'}.`
  const moveEffect = buildMoveEffectFact(features, moment)
  const missedResponsibility = buildFailureFact(features, moment, category)
  const betterIdea = buildBetterIdeaFact(features)
  const consequence = buildConsequenceFact(moment, futureUserScores)

  return {
    category,
    categoryName,
    mistakeType,
    primaryIssue,
    moveEffect,
    missedResponsibility,
    betterIdea,
    consequence,
    factList: [primaryIssue, moveEffect, missedResponsibility, betterIdea, consequence],
  }
}

// Backward-compat export for hot-reload and any stale callers still importing the old helper.
export function buildVerifiedFacts(
  features: PositionFeatures,
  moment: Pick<CriticalMoment, 'evalSwing' | 'moveNumber' | 'color' | 'movePlayed'> & { evalAfter?: number },
  _principleId?: string | null,
): string[] {
  return buildAnalysisFacts(
    features,
    {
      evalSwing: moment.evalSwing,
      moveNumber: moment.moveNumber,
      color: moment.color,
      movePlayed: moment.movePlayed,
      evalAfter: moment.evalAfter ?? -(moment.evalSwing ?? 0),  // rough proxy: assume started near 0
    },
    [],
  ).factList
}

const PIECE_NAME_MAP: Record<string, string> = {
  p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King',
}
