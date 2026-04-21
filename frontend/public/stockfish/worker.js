// worker.js — thin classic-worker wrapper for nmrugg stockfish.js
// Using importScripts guarantees classic worker context with proper self.location.
// This bypasses any ES module detection ambiguity in stockfish.js.
importScripts('/stockfish/stockfish.js')
