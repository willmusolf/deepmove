// criticalMoments.ts — Critical Moment Detection
// From a list of MoveEvals, identify the 2-3 most instructive moments.
// A critical moment is a move where the eval swung significantly against the user.
//
// Thresholds (from eloConfig.ts):
//   Below 1200: >150cp swing
//   1200-1600:  >100cp swing
//   1600+:      >60cp swing
//
// Returns the TOP 2-3 moments, not all of them — coaching one thing well beats five things badly.

import type { MoveEval } from './analysis'
import type { CriticalMoment } from '../chess/types'
import { getCriticalMomentThreshold } from '../chess/eloConfig'

export function detectCriticalMoments(
  _moveEvals: MoveEval[],
  _userColor: 'white' | 'black',
  _userElo: number,
): CriticalMoment[] {
  void getCriticalMomentThreshold
  // TODO (Track B, Session 7):
  // 1. For each move where userColor played, compute eval swing
  // 2. Filter to moves above the Elo-appropriate threshold
  // 3. Sort by severity (largest swing first)
  // 4. Return top 2-3
  return []
}
