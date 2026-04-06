// BestLines.tsx — Shows top engine lines (multi-PV) for the current position.
// Clicking a line enters variation mode to walk through the PV on the board.

import type { TopLine } from '../../engine/stockfish'

interface BestLinesProps {
  lines: TopLine[]
  isAnalyzingPosition: boolean
  onLineClick: (line: TopLine) => void
}

const LINE_COLORS = ['#4ade80', '#60a5fa', '#facc15']  // green, blue, yellow

function formatScore(line: TopLine): string {
  if (line.isMate) {
    return line.mateIn !== null ? `M${Math.abs(line.mateIn)}` : 'M'
  }
  const pawns = (line.score / 100).toFixed(2)
  return line.score >= 0 ? `+${pawns}` : pawns
}

export default function BestLines({ lines, isAnalyzingPosition, onLineClick }: BestLinesProps) {
  return (
    <div className="best-lines">
      {isAnalyzingPosition && lines.length === 0 ? (
        <>
          <div className="best-line-row best-line-skeleton" />
          <div className="best-line-row best-line-skeleton" />
        </>
      ) : (
        lines.map((line, i) => (
          <button
            key={line.rank}
            className="best-line-row"
            onClick={() => onLineClick(line)}
            title="Click to explore this line"
          >
            <span className="best-line-dot" style={{ background: LINE_COLORS[i] ?? LINE_COLORS[0] }} />
            <span className="best-line-move">{line.san}</span>
            <span className="best-line-eval">{formatScore(line)}</span>
          </button>
        ))
      )}
    </div>
  )
}
