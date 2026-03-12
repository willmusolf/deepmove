// stockfish.worker.ts — Stockfish WASM Web Worker
// CRITICAL RULE: Stockfish MUST run in this Web Worker. NEVER on the main thread.
// The UI must never freeze during analysis.
//
// This worker:
//   1. Loads the Stockfish WASM binary from /public/stockfish/
//   2. Listens for messages from the main thread (positions to analyze)
//   3. Posts evaluation results back as they arrive (streaming)
//
// Message protocol (from main thread):
//   { type: 'analyze', fen: string, depth: number }
//   { type: 'stop' }
//
// Message protocol (to main thread):
//   { type: 'eval', fen: string, depth: number, score: number, bestMove: string }
//   { type: 'ready' }
//   { type: 'error', message: string }
//
// TODO (Track A, Session 5): Implement Stockfish WASM loading and UCI protocol
// Reference: https://github.com/lichess-org/stockfish.wasm

self.onmessage = (_e: MessageEvent) => {
  // TODO: Handle analyze/stop messages
}

export {}
