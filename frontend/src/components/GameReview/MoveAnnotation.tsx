// MoveAnnotation.tsx — Move quality annotation badges
// Shows ?? (blunder), ? (mistake), ?! (inaccuracy) on moves in the move list.
// Symbols derived from eval swing thresholds (see eloConfig.ts).

export default function MoveAnnotation({ swing }: { swing: number }) {
  if (swing > 300) return <span className="annotation blunder">??</span>
  if (swing > 150) return <span className="annotation mistake">?</span>
  if (swing > 75)  return <span className="annotation inaccuracy">?!</span>
  return null
}
