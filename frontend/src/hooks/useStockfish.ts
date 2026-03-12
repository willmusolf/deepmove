// useStockfish.ts — React hook for Stockfish engine lifecycle
// Manages engine initialization, analysis requests, and cleanup.
// TODO (Track A, Session 5): Implement after StockfishEngine is ready

export function useStockfish() {
  // TODO: Initialize StockfishEngine, expose analyzePosition and isReady
  return {
    isReady: false,
    analyzePosition: (_fen: string) => { void _fen },
  }
}
