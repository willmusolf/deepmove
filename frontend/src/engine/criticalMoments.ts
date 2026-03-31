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
import type { CriticalMoment, PositionFeatures } from '../chess/types'
import { getCriticalMomentThreshold } from '../chess/eloConfig'

// Stub features object — satisfies the type until Track B feature extraction is implemented
function stubFeatures(): PositionFeatures {
  const emptyMaterial = { pawns: 0, knights: 0, bishops: 0, rooks: 0, queens: 0 }
  const emptyPawns = { isolatedPawns: [], doubledPawns: [], backwardPawns: [], passedPawns: [], pawnIslands: 0 }
  const emptyKingSafety = { castled: 'none' as const, pawnShieldIntegrity: 0, openFilesNearKing: [], score: 0 }
  const emptyActivity = { totalMobility: 0, centralizedPieces: 0, passivePieces: [], badBishop: null }
  const emptyDevelopment = { developedMinorPieces: 0, undevelopedMinorPieces: 0, rooksConnected: false, castled: false, earlyQueenMove: false, sameMovedTwice: false }
  return {
    material: {
      white: emptyMaterial,
      black: emptyMaterial,
      balance: 0,
      hasBishopPair: { white: false, black: false },
    },
    pawnStructure: {
      white: emptyPawns,
      black: emptyPawns,
      structureType: 'semi-open',
    },
    kingSafety: {
      white: emptyKingSafety,
      black: emptyKingSafety,
    },
    pieceActivity: {
      white: emptyActivity,
      black: emptyActivity,
      worstPiece: null,
    },
    development: {
      white: emptyDevelopment,
      black: emptyDevelopment,
    },
    files: {
      openFiles: [],
      halfOpenFiles: { white: [], black: [] },
    },
    gamePhase: 'middlegame',
    threats: {
      hangingPieces: [],
      piecesLeftUndefended: [],
      threatsIgnored: [],
      threatsCreated: [],
    },
    moveImpact: {
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
    },
    engineMoveImpact: {
      description: '',
      mainIdea: '',
      bestMoveSan: null,
      isCapture: false,
      givesCheck: false,
      isCastle: false,
      developsPiece: false,
      isForcing: false,
    },
  }
}

export function detectCriticalMoments(
  moveEvals: MoveEval[],
  userColor: 'white' | 'black',
  userElo: number,
): CriticalMoment[] {
  const threshold = getCriticalMomentThreshold(userElo)

  const candidates: Array<CriticalMoment & { _cpLoss: number }> = []

  for (let i = 0; i < moveEvals.length; i++) {
    const mv = moveEvals[i]
    if (mv.color !== userColor) continue

    const evalBefore = i === 0 ? 0 : moveEvals[i - 1].eval.score
    const evalAfter = mv.eval.score

    const cpLoss = userColor === 'white'
      ? (evalBefore - evalAfter)
      : (evalAfter - evalBefore)

    if (cpLoss < threshold) continue

    candidates.push({
      _cpLoss: cpLoss,
      moveNumber: mv.moveNumber,
      color: mv.color,
      fen: mv.fen,        // FEN after the move (fenAfter will be filled in Track B)
      fenAfter: mv.fen,
      movePlayed: mv.san,
      engineBest: [],     // filled in Track B
      evalBefore,
      evalAfter,
      evalSwing: cpLoss,
      features: stubFeatures(),
      analysisFacts: null,
      classification: null,
    })
  }

  candidates.sort((a, b) => b._cpLoss - a._cpLoss)

  return candidates.slice(0, 3).map(({ _cpLoss: _, ...rest }) => rest)
}
