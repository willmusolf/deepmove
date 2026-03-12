// development.ts — Development Tracker
// Relevant only in opening/early_middlegame (moves 1-15)
// Tracks: undeveloped minor pieces, castling, early queen moves, same piece moved twice
// Tests: frontend/src/chess/__tests__/development.test.ts

import type { DevelopmentStatus } from './types'
import type { Chess } from 'chess.js'

export function trackDevelopment(_chess: Chess, _color: 'white' | 'black'): DevelopmentStatus {
  // TODO (Track B, Session 5)
  return {
    developedMinorPieces: 0,
    undevelopedMinorPieces: 4,
    rooksConnected: false,
    castled: false,
    earlyQueenMove: false,
    sameMovedTwice: false,
  }
}
