// classifier.ts — Rules-based principle classifier
// Input: PositionFeatures + context
// Output: ClassificationResult with principle ID + confidence score (0-100)
//
// PRIORITY QUEUE RULE (from CLAUDE.md):
//   If TACTICAL_01 or TACTICAL_02 triggers → suppress ALL other classifications
//   A hanging piece is always the lesson. Never also mention pawn structure.
//
// Confidence scoring:
//   90-100: One clear principle, strong signals (e.g. piece literally hanging)
//   70-89:  Likely principle, somewhat complex position
//   50-69:  Multiple principles could apply → use simplified fallback lesson
//   <50:    Too ambiguous → describe what changed without asserting a principle
//
// Tests: frontend/src/chess/__tests__/classifier.test.ts

import type { PositionFeatures, ClassificationResult, CriticalMoment } from './types'
import { PRINCIPLES, PRIORITY_PRINCIPLES } from './taxonomy'

export function classifyPrinciple(
  _features: PositionFeatures,
  _moment: Pick<CriticalMoment, 'evalSwing' | 'moveNumber' | 'color'>,
  _userElo: number,
): ClassificationResult | null {
  // TODO (Track B, Session 9): Implement classification rules
  // See docs/feature-extraction.md for all rule examples
  // Remember: TACTICAL_01/02 suppress everything else
  void PRINCIPLES
  void PRIORITY_PRINCIPLES
  return null
}

// Check if a principle is appropriate for the user's Elo
export function isInEloGate(principleId: string, userElo: number): boolean {
  const principle = PRINCIPLES[principleId]
  if (!principle) return false
  return userElo >= principle.eloMin && userElo <= principle.eloMax
}
