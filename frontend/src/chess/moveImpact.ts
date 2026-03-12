// moveImpact.ts — Move Impact Analyzer
// THE most important extractor for coaching: what did the user's move actually change?
// Compares position BEFORE and AFTER the move — this "delta analysis" makes coaching specific.
//
// Questions answered:
//   - Did it develop a piece? (good in opening)
//   - Did it weaken the king? (usually bad)
//   - Did it create a pawn weakness?
//   - Did it trade an active piece for a passive one?
//   - Did it have a clear purpose? (if no → "nothing move")
//   - Did it ignore opponent threats?
//   - Did it improve the worst piece?
//
// Tests: frontend/src/chess/__tests__/moveImpact.test.ts

import type { MoveImpact } from './types'
import type { Chess } from 'chess.js'

export function analyzeMoveImpact(
  _before: Chess,
  _after: Chess,
  _movePlayed: string,
  _userColor: 'white' | 'black',
): MoveImpact {
  // TODO (Track B, Session 6)
  return {
    description: '',
    pieceMoved: '',
    fromSquare: '',
    toSquare: '',
    wasCapture: false,
    wasCheck: false,
    changedKingSafety: false,
    changedPawnStructure: false,
    developedPiece: false,
    improvedPieceActivity: false,
    createdWeakness: false,
    hadClearPurpose: false,
  }
}
