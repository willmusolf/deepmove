// stockfish.ts — Web Worker manager and message interface
// Creates and manages the Stockfish Web Worker.
// All communication with Stockfish goes through this module.
// Never import stockfish.worker.ts directly — use this interface.
//
// TODO (Track A, Session 5): Implement worker lifecycle management

export interface EvalResult {
  fen: string
  depth: number
  score: number      // centipawns, positive = white advantage
  bestMove: string   // SAN notation
  pv: string[]       // principal variation
}

export class StockfishEngine {
  private worker: Worker | null = null

  async initialize(): Promise<void> {
    // TODO: Create Worker, wait for 'ready' message
    throw new Error('StockfishEngine not yet implemented')
  }

  async analyzePosition(_fen: string, _depth = 18): Promise<EvalResult> {
    // TODO: Post 'analyze' message, return promise that resolves on 'eval'
    throw new Error('StockfishEngine not yet implemented')
  }

  terminate(): void {
    this.worker?.terminate()
    this.worker = null
  }
}
