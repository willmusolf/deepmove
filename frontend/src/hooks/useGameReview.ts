// useGameReview.ts — React hook for game review state and navigation
// Handles: loading a game, stepping through moves, jumping to critical moments.
// TODO (Track A, Session 3+): Implement

export function useGameReview() {
  // TODO: Wire up gameStore + chess.js for move navigation
  return {
    currentFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    goToMove: (_index: number) => {},
    goForward: () => {},
    goBack: () => {},
  }
}
