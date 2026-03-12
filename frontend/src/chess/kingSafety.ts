// kingSafety.ts — King Safety Scorer
// Factors: castled status, pawn shield integrity, open files near king, pieces aimed at king
// Score: 0 (completely safe) to 100 (critical danger)
// Tests: frontend/src/chess/__tests__/kingSafety.test.ts

import type { KingSafetyScore } from './types'
import type { Chess } from 'chess.js'

export function scoreKingSafety(_chess: Chess, _color: 'white' | 'black'): KingSafetyScore {
  // TODO (Track B, Session 5)
  return { castled: 'none', pawnShieldIntegrity: 3, openFilesNearKing: [], score: 0 }
}
