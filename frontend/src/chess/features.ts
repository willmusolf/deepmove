// features.ts — Master feature extraction orchestrator
// Wires all extractors and provides enrichCriticalMoments() for the coaching pipeline.
//
// Current scope:
//   ✅ material, gamePhase, threats, development, moveImpact, openFiles
//   ✅ kingSafety, pieceActivity
//   🔲 pawnStructure — lightweight placeholder until V2

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
import { buildAnalysisFacts, classifyPrinciple } from './classifier'

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

function uciToSan(beforeChess: Chess, uciMove: string): string | null {
  if (!uciMove || uciMove.length < 4) return null

  try {
    const chess = new Chess(beforeChess.fen())
    const move = chess.move({
      from: uciMove.slice(0, 2),
      to: uciMove.slice(2, 4),
      promotion: (uciMove[4] as 'q' | 'r' | 'b' | 'n' | undefined) ?? undefined,
    })
    return move?.san ?? null
  } catch {
    return null
  }
}

/**
 * Generate a plain-English description of what the engine's preferred move would achieve.
 * This replaces the generic "Engine preferred Bf1" with something the LLM can use for coaching.
 */
function describeEngineMoveIdea(
  beforeChess: Chess,
  engineBest: string[],
  _userColor: string,
): PositionFeatures['engineMoveImpact'] {
  const bestMove = engineBest[0]
  if (!bestMove) {
    return {
      description: '',
      mainIdea: '',
      bestMoveSan: null,
      isCapture: false,
      givesCheck: false,
      isCastle: false,
      developsPiece: false,
      isForcing: false,
    }
  }

  // Try to play the engine move on a copy of the position
  const testChess = new Chess(beforeChess.fen())
  const result = testChess.move(bestMove)
  if (!result) {
    return {
      description: `The better move was ${bestMove}.`,
      mainIdea: '',
      bestMoveSan: bestMove,
      isCapture: false,
      givesCheck: false,
      isCastle: false,
      developsPiece: false,
      isForcing: false,
    }
  }

  const pieceName = PIECE_NAMES[result.piece] ?? result.piece
  const ideas: string[] = []
  const isCapture = !!result.captured
  const givesCheck = testChess.inCheck()
  const isCastle = result.san === 'O-O' || result.san === 'O-O-O'

  // Check if it's a capture
  if (isCapture) {
    const capturedKey = result.captured ?? ''
    const capturedName = PIECE_NAMES[capturedKey] ?? capturedKey
    ideas.push(`wins material by capturing the ${capturedName} on ${result.to}`)
  }

  // Check if it gives check
  if (givesCheck) {
    ideas.push('gives check')
  }

  // Check if it's castling
  if (isCastle) {
    ideas.push('gets the king safe and connects the rooks')
  }

  // Check if it develops a minor piece from the back rank
  const minorStarts = new Set(
    result.color === 'w'
      ? ['b1', 'g1', 'c1', 'f1']
      : ['b8', 'g8', 'c8', 'f8'],
  )
  const developsPiece = (result.piece === 'n' || result.piece === 'b') && minorStarts.has(result.from)
  if (developsPiece) {
    ideas.push(`develops the ${pieceName} into the game`)
  }
  if (ideas.length === 0) {
    ideas.push(`improves the ${pieceName} on ${result.to}`)
  }

  const description = `The better move was ${result.san}.`
  const mainIdea = ideas.length > 0
    ? `It ${ideas.join(' and ')}`
    : `It repositions the ${pieceName} to a more active square`

  return {
    description,
    mainIdea,
    bestMoveSan: result.san,
    isCapture,
    givesCheck,
    isCastle,
    developsPiece,
    isForcing: isCapture || givesCheck,
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
 * Enrich critical moments with real feature extraction + analysis facts.
 * Called after detectCriticalMoments() to fill in .features, .engineBest, and .analysisFacts.
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
    try {
      // Find this moment's index in the full moveEvals list
      const evalIdx = moveEvals.findIndex(
        mv => mv.moveNumber === moment.moveNumber && mv.color === moment.color,
      )
      if (evalIdx < 0) return moment

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
      const engineBestUci = evalIdx > 0 ? moveEvals[evalIdx - 1].eval.bestMove : ''
      const engineBest = engineBestUci
        ? [uciToSan(beforeChess, engineBestUci)].filter((move): move is string => Boolean(move))
        : moment.engineBest
      const futureUserScores = moveEvals
        .slice(evalIdx + 1, evalIdx + 5)
        .map(nextEval => (moment.color === 'white' ? nextEval.eval.score : -nextEval.eval.score))
      const userEvalAfter = moment.color === 'white' ? evalAfter : -evalAfter

      const input: ExtractionInput = {
        fen: evalIdx > 0 ? moveEvals[evalIdx - 1].fen : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        fenAfter: moveEvals[evalIdx].fen,
        movePlayed: moment.movePlayed,
        engineBest,
        evalBefore,
        evalAfter,
        moveNumber: moment.moveNumber,
        color: moment.color,
        timeControl: '600',
        userElo,
        opponentElo: userElo,
      }

      const features = extractFeatures(input, beforeChess, afterChess, opponentLastMove)
      const cpLoss = moment.evalSwing
      const analysisFacts = buildAnalysisFacts(
        features,
        {
          evalSwing: cpLoss,
          moveNumber: moment.moveNumber,
          color: moment.color,
          movePlayed: moment.movePlayed,
          evalAfter: userEvalAfter,
        },
        futureUserScores,
      )

      const classification = classifyPrinciple(
        features,
        { evalSwing: cpLoss, moveNumber: moment.moveNumber, color: moment.color },
        userElo,
      )

      return {
        ...moment,
        fen: input.fen,
        fenAfter: input.fenAfter,
        engineBest,
        evalBefore,
        evalAfter,
        features,
        analysisFacts,
        classification,
      }
    } catch (err) {
      console.error('[enrichCriticalMoments] failed for moment', moment.moveNumber, moment.color, err)
      return moment
    }
  })
}
