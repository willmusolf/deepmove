// material.ts — Material counter and balance
// Prerequisites for gamePhase detection and feature extraction
// Tests: frontend/src/chess/__tests__/material.test.ts

import type { MaterialCount } from './types'
import type { Chess } from 'chess.js'

export const PIECE_VALUES: Record<string, number> = {
  p: 1, n: 3, b: 3, r: 5, q: 9, k: 0,
}

export function countMaterial(chess: Chess, color: 'white' | 'black'): MaterialCount {
  const colorCode = color === 'white' ? 'w' : 'b'
  const count: MaterialCount = { pawns: 0, knights: 0, bishops: 0, rooks: 0, queens: 0 }

  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece || piece.color !== colorCode) continue
      switch (piece.type) {
        case 'p': count.pawns++; break
        case 'n': count.knights++; break
        case 'b': count.bishops++; break
        case 'r': count.rooks++; break
        case 'q': count.queens++; break
      }
    }
  }

  return count
}

export function getMaterialValue(count: MaterialCount): number {
  return (
    count.pawns * 1 +
    count.knights * 3 +
    count.bishops * 3 +
    count.rooks * 5 +
    count.queens * 9
  )
}

/** Returns material balance in centipawns-equivalent: positive = white ahead */
export function getMaterialBalance(chess: Chess): number {
  return getMaterialValue(countMaterial(chess, 'white')) - getMaterialValue(countMaterial(chess, 'black'))
}

export function hasBishopPair(chess: Chess, color: 'white' | 'black'): boolean {
  return countMaterial(chess, color).bishops >= 2
}
