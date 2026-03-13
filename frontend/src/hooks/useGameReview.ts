import { useMemo } from 'react'
import { Chess } from 'chess.js'
import { useGameStore } from '../stores/gameStore'
 import { cleanPgn } from '../chess/pgn'

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export function useGameReview() {
  const pgn = useGameStore(s => s.pgn)
  const currentMoveIndex = useGameStore(s => s.currentMoveIndex)
  const setCurrentMove = useGameStore(s => s.setCurrentMove)

  const parsed = useMemo(() => {
    if (!pgn) {
      return { positions: [STARTING_FEN], moves: [] as string[], whitePlayer: null, blackPlayer: null, whiteElo: null, blackElo: null, result: null, parseError: null }
    }

    const chess = new Chess()
    try {
      chess.loadPgn(cleanPgn(pgn))
    } catch {
      return { positions: [STARTING_FEN], moves: [] as string[], whitePlayer: null, blackPlayer: null, whiteElo: null, blackElo: null, result: null, parseError: 'Invalid PGN.' }
    }

    const history = chess.history({ verbose: true })
    const headers = chess.header() as Record<string, string>
    return {
      positions: [STARTING_FEN, ...history.map(m => m.after)] as string[],
      moves: history.map(m => m.san),
      whitePlayer: headers['White'] ?? null,
      blackPlayer: headers['Black'] ?? null,
      whiteElo: headers['WhiteElo'] ?? null,
      blackElo: headers['BlackElo'] ?? null,
      result: headers['Result'] ?? null,
      parseError: null,
    }
  }, [pgn])

  const isLoaded = pgn !== null && parsed.parseError === null && parsed.moves.length > 0
  const clampedIndex = Math.min(Math.max(currentMoveIndex, 0), parsed.positions.length - 1)

  const goToMove = (index: number) =>
    setCurrentMove(Math.min(Math.max(index, 0), parsed.positions.length - 1))

  return {
    currentFen: parsed.positions[clampedIndex] ?? STARTING_FEN,
    moves: parsed.moves,
    currentMoveIndex: clampedIndex,
    goToMove,
    goForward: () => goToMove(clampedIndex + 1),
    goBack: () => goToMove(clampedIndex - 1),
    isLoaded,
    whitePlayer: parsed.whitePlayer,
    blackPlayer: parsed.blackPlayer,
    whiteElo: parsed.whiteElo,
    blackElo: parsed.blackElo,
    result: parsed.result,
    totalMoves: parsed.positions.length - 1,
    parseError: parsed.parseError,
  }
}
