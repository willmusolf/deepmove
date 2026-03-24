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

  // Analyze what the engine's preferred move would have achieved
  const engineMoveImpact = describeEngineMoveIdea(beforeChess, input.engineBest, color)

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
    engineMoveImpact,
  }
}

// ─── Engine move idea generation ──────────────────────────────────────────────

const PIECE_NAMES: Record<string, string> = {
  p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king',
}

/**
 * Generate a plain-English description of what the engine's preferred move would achieve.
 * This replaces the generic "Engine preferred Bf1" with something the LLM can use for coaching.
 */
function describeEngineMoveIdea(
  beforeChess: Chess,
  engineBest: string[],
  _userColor: string,
): { description: string; mainIdea: string } {
  const bestMove = engineBest[0]
  if (!bestMove) return { description: '', mainIdea: '' }

  // Try to play the engine move on a copy of the position
  const testChess = new Chess(beforeChess.fen())
  const result = testChess.move(bestMove)
  if (!result) return { description: `Better move was ${bestMove}`, mainIdea: '' }

  const pieceName = PIECE_NAMES[result.piece] ?? result.piece
  const ideas: string[] = []

  // Check if it's a capture
  if (result.captured) {
    const capturedName = PIECE_NAMES[result.captured] ?? result.captured
    ideas.push(`captures the ${capturedName} on ${result.to}`)
  }

  // Check if it gives check
  if (testChess.inCheck()) {
    ideas.push('gives check')
  }

  // Check if it's castling
  if (result.san === 'O-O' || result.san === 'O-O-O') {
    ideas.push('gets the king to safety and connects the rooks')
  }

  // Check if it develops a minor piece from the back rank
  const minorStarts = new Set(
    result.color === 'w'
      ? ['b1', 'g1', 'c1', 'f1']
      : ['b8', 'g8', 'c8', 'f8'],
  )
  if ((result.piece === 'n' || result.piece === 'b') && minorStarts.has(result.from)) {
    ideas.push(`develops the ${pieceName} into the game`)
  }

  // Check if the move defends a hanging piece (piece was attacked before)
  if (result.to && !result.captured) {
    // Simple heuristic: if the piece moved TO a square that's adjacent to a friendly piece
    // that was under attack, it might be a defensive move
    const beforeBoard = beforeChess.board()
    const colorCode = result.color
    for (const row of beforeBoard) {
      for (const cell of row) {
        if (cell && cell.color === colorCode && cell.type !== 'k') {
          if (beforeChess.isAttacked(cell.square, colorCode === 'w' ? 'b' : 'w')) {
            // A friendly piece was under attack — the engine move might address this
            // Only add if we haven't found a more specific idea
            if (ideas.length === 0) {
              ideas.push(`addresses a threat against a piece`)
            }
            break
          }
        }
      }
      if (ideas.length > 0 && ideas[ideas.length - 1].includes('addresses')) break
    }
  }

  const description = `The better approach was ${result.san} (moving the ${pieceName} to ${result.to})`
  const mainIdea = ideas.length > 0
    ? `This ${ideas.join(' and ')}`
    : `This repositions the ${pieceName} to a more active square`

  return { description, mainIdea }
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
