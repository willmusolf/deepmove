// MoveList.tsx — Scrollable move list with clickable move navigation
// Clicking a move jumps the board to that position.
// TODO (Track A, Session 3): Implement with chess.js move history

interface MoveListProps {
  moves: string[]          // SAN notation moves
  currentMoveIndex: number
  onMoveClick: (index: number) => void
}

export default function MoveList({ moves: _moves, currentMoveIndex: _index, onMoveClick: _onClick }: MoveListProps) {
  // TODO: Render move pairs (white + black), highlight current move
  return <div className="move-list" />
}
