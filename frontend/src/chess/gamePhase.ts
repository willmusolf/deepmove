// gamePhase.ts — Game phase detector
// Classifies position as opening / early_middlegame / middlegame / late_middlegame / endgame
// Based on material remaining and move number.
// Tests: frontend/src/chess/__tests__/gamePhase.test.ts

import type { GamePhase } from './types'
import type { Chess } from 'chess.js'
import { countMaterial, getMaterialValue } from './material'

export function detectGamePhase(chess: Chess, moveNumber: number): GamePhase {
  const whiteMat = countMaterial(chess, 'white')
  const blackMat = countMaterial(chess, 'black')
  const totalMaterial = getMaterialValue(whiteMat) + getMaterialValue(blackMat)
  const queensPresent = whiteMat.queens > 0 || blackMat.queens > 0

  // Endgame: queens are gone or very little total material
  if (!queensPresent || totalMaterial <= 26) return 'endgame'

  // Opening: very early moves with most material on board
  if (moveNumber <= 7 && totalMaterial >= 68) return 'opening'

  // Early middlegame: development phase, roughly moves 8-14
  if (moveNumber <= 14 && totalMaterial >= 56) return 'early_middlegame'

  // Late middlegame: material traded, queens still on board
  if (totalMaterial <= 42) return 'late_middlegame'

  return 'middlegame'
}
