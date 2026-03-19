// features.ts — Master feature extraction orchestrator
// Wires all extractors and provides enrichCriticalMoments() for the coaching pipeline.
//
// MVP scope (3B-2):
//   ✅ material, gamePhase, threats, development, moveImpact, openFiles
//   🔲 kingSafety, pieceActivity, pawnStructure — stubs returning defaults (V2)

import { Chess } from 'chess.js'
import type { CriticalMoment, ExtractionInput, PositionFeatures } from './types'
import type { MoveEval } from '../engine/analysis'
import { countMaterial, getMaterialBalance, hasBishopPair } from './material'
import { detectGamePhase } from './gamePhase'
import { analyzeThreats } from './threats'
import { trackDevelopment } from './development'
import { analyzeMoveImpact } from './moveImpact'
import { getOpenFiles, getHalfOpenFiles } from './openFiles'
import { analyzePawnStructure, detectStructureType } from './pawnStructure'
import { scoreKingSafety } from './kingSafety'
import { evaluatePieceActivity } from './pieceActivity'
import { classifyPrinciple } from './classifier'

// ─── Core extractor ──────────────────────────────────────────────────────────

/**
 * Extract all position features from a critical moment.
 * beforeChess:       Chess instance at position BEFORE the user's move (with full history)
 * afterChess:        Chess instance at position AFTER the user's move (with full history)
 * opponentLastMove:  SAN of opponent's last move (the move just before user's move)
 */
export function extractFeatures(
  input: ExtractionInput,
  beforeChess: Chess,
  afterChess: Chess,
  opponentLastMove?: string | null,
): PositionFeatures {
  const { color, moveNumber } = input

  const whiteMat = countMaterial(afterChess, 'white')
  const blackMat = countMaterial(afterChess, 'black')

  return {
    material: {
      white: whiteMat,
      black: blackMat,
      balance: getMaterialBalance(afterChess),
      hasBishopPair: {
        white: hasBishopPair(afterChess, 'white'),
        black: hasBishopPair(afterChess, 'black'),
      },
    },
    pawnStructure: {
      white: analyzePawnStructure(afterChess, 'white'),
      black: analyzePawnStructure(afterChess, 'black'),
      structureType: detectStructureType(afterChess),
    },
    kingSafety: {
      white: scoreKingSafety(afterChess, 'white'),
      black: scoreKingSafety(afterChess, 'black'),
    },
    pieceActivity: {
      white: evaluatePieceActivity(afterChess, 'white'),
      black: evaluatePieceActivity(afterChess, 'black'),
      worstPiece: null,
    },
    development: {
      white: trackDevelopment(afterChess, 'white'),
      black: trackDevelopment(afterChess, 'black'),
    },
    files: {
      openFiles: getOpenFiles(afterChess),
      halfOpenFiles: {
        white: getHalfOpenFiles(afterChess, 'white'),
        black: getHalfOpenFiles(afterChess, 'black'),
      },
    },
    gamePhase: detectGamePhase(afterChess, moveNumber),
    threats: analyzeThreats(beforeChess, afterChess, (opponentLastMove as string | null) ?? null, color),
    moveImpact: analyzeMoveImpact(beforeChess, afterChess, input.movePlayed, color),
    engineMoveImpact: {
      description: input.engineBest[0] ? `Engine preferred ${input.engineBest[0]}` : '',
      mainIdea: '',
    },
  }
}

// ─── Game replay helper ───────────────────────────────────────────────────────

/**
 * Build a Chess instance replayed to exactly `upToMoves` half-moves.
 * This preserves full move history for development tracking.
 */
function buildChessAtHalfMove(pgn: string, upToMoves: number): Chess {
  const fullGame = new Chess()
  fullGame.loadPgn(pgn)
  const sanHistory = fullGame.history() // string[] of SAN moves

  const chess = new Chess()
  const limit = Math.min(upToMoves, sanHistory.length)
  for (let i = 0; i < limit; i++) {
    chess.move(sanHistory[i])
  }
  return chess
}

// ─── Critical moment enrichment ──────────────────────────────────────────────

/**
 * Enrich critical moments with real feature extraction + principle classification.
 * Called after detectCriticalMoments() to fill in .features and .classification.
 *
 * @param moments  Output of detectCriticalMoments()
 * @param moveEvals Full MoveEval[] from analyzeGame() (used to look up move indices)
 * @param pgn      The original PGN string (needed to replay game for dev tracking)
 * @param userElo  Player's Elo rating
 */
export function enrichCriticalMoments(
  moments: CriticalMoment[],
  moveEvals: MoveEval[],
  pgn: string,
  userElo: number,
): CriticalMoment[] {
  // Parse SAN history once, reuse across all moments
  const fullGame = new Chess()
  fullGame.loadPgn(pgn)
  const sanHistory = fullGame.history() // string[]

  return moments.map(moment => {
    // Find this moment's index in the full moveEvals list
    const evalIdx = moveEvals.findIndex(
      mv => mv.moveNumber === moment.moveNumber && mv.color === moment.color,
    )
    if (evalIdx < 0) return moment // shouldn't happen

    // Half-move index (0-based): white move N = (N-1)*2, black move N = (N-1)*2+1
    const halfMoveIdx = (moment.moveNumber - 1) * 2 + (moment.color === 'black' ? 1 : 0)

    // Replay game to get Chess instances with full history for dev/history-aware extractors
    const beforeChess = buildChessAtHalfMove(pgn, halfMoveIdx)
    const afterChess = buildChessAtHalfMove(pgn, halfMoveIdx + 1)

    // The move immediately before the user's move was the opponent's last move
    const opponentLastMove = halfMoveIdx > 0 ? sanHistory[halfMoveIdx - 1] : null

    // Build evalBefore from the previous eval (or 0 if first move)
    const evalBefore = evalIdx > 0 ? moveEvals[evalIdx - 1].eval.score : 0
    const evalAfter = moveEvals[evalIdx].eval.score

    const input: ExtractionInput = {
      fen: evalIdx > 0 ? moveEvals[evalIdx - 1].fen : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      fenAfter: moveEvals[evalIdx].fen,
      movePlayed: moment.movePlayed,
      engineBest: moment.engineBest,
      evalBefore,
      evalAfter,
      moveNumber: moment.moveNumber,
      color: moment.color,
      timeControl: '600',
      userElo,
      opponentElo: userElo, // approximation when opponent Elo unknown
    }

    const features = extractFeatures(input, beforeChess, afterChess, opponentLastMove)
    const cpLoss = moment.evalSwing

    const classification = classifyPrinciple(
      features,
      { evalSwing: cpLoss, moveNumber: moment.moveNumber, color: moment.color },
      userElo,
    )

    return {
      ...moment,
      fen: input.fen,
      fenAfter: input.fenAfter,
      evalBefore,
      evalAfter,
      features,
      classification,
    }
  })
}
