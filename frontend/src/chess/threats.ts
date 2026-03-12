// threats.ts — Threat Analyzer
// CRITICAL extractor — the "leaky roof" detector for sub-1400 coaching
//
// Detects:
//   - Hanging pieces (undefended and attackable)
//   - Pieces that became undefended AFTER the user's move
//   - Opponent threats the user ignored (opponent's last move attacked something)
//   - New threats the user's move created
//
// Build this FIRST after material counter and game phase.
// This single extractor powers TACTICAL_01 and TACTICAL_02 — the highest-value
// coaching lessons for the majority of DeepMove's users.
//
// Tests: frontend/src/chess/__tests__/threats.test.ts

import type { ThreatAnalysis } from './types'
import type { Chess } from 'chess.js'

export function analyzeThreats(
  _before: Chess,
  _after: Chess,
  _opponentLastMove: string | null,
  _userColor: 'white' | 'black',
): ThreatAnalysis {
  // TODO (Track B, Session 5): Implement threat detection
  // Use chess.js board state: chess.board(), chess.moves({ verbose: true })
  // Key methods: chess.isAttacked(square, color), chess.attackers(square, color)
  return {
    hangingPieces: [],
    piecesLeftUndefended: [],
    threatsIgnored: [],
    threatsCreated: [],
  }
}
