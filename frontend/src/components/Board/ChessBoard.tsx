// ChessBoard.tsx — Interactive chess board using chessground
// The BOARD is the centerpiece — always visible, never hidden.
// Should feel as good as Lichess's board.
//
// Props: fen, orientation, onMove, highlightedSquares, arrows
// TODO (Track A, Session 2): Implement with chessground

interface ChessBoardProps {
  fen: string
  orientation?: 'white' | 'black'
  onMove?: (from: string, to: string) => void
  interactive?: boolean
}

export default function ChessBoard({ fen: _fen }: ChessBoardProps) {
  // TODO: Initialize chessground, sync with FEN, handle moves
  return <div className="chess-board-placeholder" style={{ width: 480, height: 480, background: '#333' }} />
}
