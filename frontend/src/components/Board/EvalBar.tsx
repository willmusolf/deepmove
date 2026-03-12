// EvalBar.tsx — Evaluation bar alongside the chess board
// Shows the current position evaluation as a visual bar.
//
// IMPORTANT: In Think First mode, the eval bar is HIDDEN until the user engages
// with the coach's question. This prevents users from seeing -2.5 and stopping thinking.
//
// Props: evalCentipawns (number), hidden (boolean for Think First mode)
// TODO (Track A, Session 5): Implement after Stockfish integration

interface EvalBarProps {
  evalCentipawns: number
  hidden?: boolean
}

export default function EvalBar({ evalCentipawns: _eval, hidden }: EvalBarProps) {
  if (hidden) return <div className="eval-bar eval-bar--hidden" />
  // TODO: Convert centipawns to visual bar percentage, handle mate scores
  return <div className="eval-bar" />
}
