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
  if (
    isInEloGate('OPENING_02', userElo) &&
    (gamePhase === 'opening' || gamePhase === 'early_middlegame') &&
    !userDev.castled &&
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
): MistakeCategory {
  const userDev = moment.color === 'white' ? features.development.white : features.development.black
  const userKing = moment.color === 'white' ? features.kingSafety.white : features.kingSafety.black

  if (features.threats.hangingPieces.length > 0) return 'hung_piece'
  if (features.threats.threatsIgnored.length > 0) return 'ignored_threat'
  if (features.engineMoveImpact.isForcing && moment.evalSwing >= 90) return 'missed_tactic'
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
    userDev.undevelopedMinorPieces >= 2
  ) {
    return 'didnt_develop'
  }
  if (!features.moveImpact.hadClearPurpose) return 'aimless_move'
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
  moment: Pick<CriticalMoment, 'moveNumber' | 'color'>,
  category: MistakeCategory,
): string {
  const userDev = moment.color === 'white' ? features.development.white : features.development.black
  const userKing = moment.color === 'white' ? features.kingSafety.white : features.kingSafety.black

  switch (category) {
    case 'hung_piece': {
      const hanging = features.threats.hangingPieces[0]
      if (!hanging) return 'What your move failed to do: it left material loose.'
      const pieceName = PIECE_NAME_MAP[hanging.piece] ?? hanging.piece
      const attackers = hanging.attackedBy.length > 0 ? ` attacked from ${hanging.attackedBy.join(', ')}` : ''
      return `What your move failed to do: it left your ${pieceName} on ${hanging.square} undefended and under attack${attackers}.`
    }
    case 'ignored_threat': {
      const threat = features.threats.threatsIgnored[0]
      return threat
        ? `What your move failed to do: it ignored ${threat.description}.`
        : "What your move failed to do: it did not answer your opponent's threat."
    }
    case 'missed_tactic':
      return 'What your move failed to do: it missed a forcing move when the position demanded one.'
    case 'didnt_castle':
      return `What your move failed to do: your king stayed in the center with a king-safety score of ${userKing.score}/100.`
    case 'didnt_develop':
      return `What your move failed to do: you still had ${userDev.undevelopedMinorPieces} minor pieces undeveloped on move ${moment.moveNumber}.`
    case 'aimless_move':
      return 'What your move failed to do: it did not capture, give check, develop, castle, or create a clear threat.'
    default:
      return 'What your move failed to do: it did not solve the biggest problem in the position.'
  }
}

function buildBetterIdeaFact(features: PositionFeatures): string {
  if (features.engineMoveImpact.mainIdea) {
    return `What the better move would have done: ${features.engineMoveImpact.mainIdea}.`
  }
  if (features.engineMoveImpact.description) {
    return `What the better move would have done: ${features.engineMoveImpact.description}.`
  }
  return 'What the better move would have done: improved the position with a more purposeful idea.'
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
  const category = determineCategory(features, moment)
  const categoryName = CATEGORIES[category]?.name ?? CATEGORIES.unknown.name
  const mistakeType = describeMistakeType(features)
  const primaryIssue = `Mistake type: ${mistakeType}. The better move was ${features.engineMoveImpact.isForcing ? 'forcing' : 'a quiet improvement'}.`
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
      evalAfter: moment.evalAfter ?? 0,
    },
    [],
  ).factList
}

const PIECE_NAME_MAP: Record<string, string> = {
  p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King',
}
