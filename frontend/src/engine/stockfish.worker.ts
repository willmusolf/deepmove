// stockfish.worker.ts
// NOTE: The nmrugg/stockfish.js build (in /public/stockfish/stockfish.js) is itself
// designed to run as a Web Worker — it auto-detects worker context and sets up UCI
// communication over postMessage. We therefore load it directly as the worker in
// StockfishEngine rather than wrapping it here.
//
// This file is intentionally empty. The worker IS /public/stockfish/stockfish.js.
// See stockfish.ts for the engine manager.

export {}
