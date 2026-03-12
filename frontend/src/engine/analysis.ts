// analysis.ts — Full game analysis orchestrator
// Takes a parsed PGN (list of moves), runs Stockfish on every position,
// returns per-move evaluations for the eval bar and move annotation.
//
// TODO (Track A, Session 5): Implement after StockfishEngine is ready

import type { EvalResult } from './stockfish'

export interface MoveEval {
  moveNumber: number
  color: 'white' | 'black'
  san: string
  fen: string
  eval: EvalResult
}

export async function analyzeGame(
  _pgn: string,
  _onProgress?: (completed: number, total: number) => void,
): Promise<MoveEval[]> {
  // TODO: Parse PGN with chess.js, analyze each position with Stockfish
  throw new Error('analyzeGame not yet implemented')
}
