// tactics.ts — Basic Tactical Pattern Detector
// Detects: forks, pins, skewers, discovered attacks
// Used to: name the tactic when Stockfish's preferred move involves one
// "There was a knight fork available" is far more instructive than "Nd5 was better"
//
// Tests: frontend/src/chess/__tests__/tactics.test.ts

import type { Chess } from 'chess.js'

export interface TacticalPattern {
  type: 'fork' | 'pin' | 'skewer' | 'discovered_attack'
  description: string
  square: string
}

export function detectTacticalPatterns(
  _chess: Chess,
  _color: 'white' | 'black',
): TacticalPattern[] {
  // TODO (Track B, Session 9)
  return []
}
