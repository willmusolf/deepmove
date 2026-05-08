// BestLines.tsx — Shows top engine lines (multi-PV) for the current position.
// Clicking a line enters variation mode to walk through the PV on the board.

import { Chess } from 'chess.js'
import { useMemo } from 'react'
import type { TopLine } from '../../engine/stockfish'
import { formatEval } from '../../utils/format'

interface BestLinesProps {
  lines: TopLine[]
  isAnalyzingPosition: boolean
  onLineClick: (line: TopLine) => void
  fen: string
}

const MAX_LINES = 3
const LINE_COLORS = ['#4ade80', '#60a5fa', '#facc15']  // green, blue, yellow

function pvToSans(fen: string, pv: string[]): string[] {
  const sans: string[] = []
  try {
    const chess = new Chess(fen)
    for (const uci of pv) {
      const from = uci.slice(0, 2)
      const to = uci.slice(2, 4)
      const promo = uci[4]
      const result = chess.move({ from, to, promotion: promo })
      if (!result) break
      sans.push(result.san)
    }
  } catch {
    // Stop at the first invalid move and keep the usable prefix.
  }
  return sans
}

function formatPvNotation(fen: string, sans: string[], maxMoves = 8): string {
  if (sans.length === 0) return ''
  const parts = fen.split(' ')
  let moveNum = parseInt(parts[5] ?? '1', 10)
  let isWhite = parts[1] === 'w'
  const tokens: string[] = []

  for (let i = 0; i < Math.min(sans.length, maxMoves); i += 1) {
    if (isWhite) {
      tokens.push(`${moveNum}.\u2009${sans[i]}`)
    } else {
      if (i === 0) tokens.push(`${moveNum}...\u2009${sans[i]}`)
      else tokens.push(sans[i])
      moveNum += 1
    }
    isWhite = !isWhite
  }

  return tokens.join(' ')
}

function formatScore(line: TopLine): string {
  return formatEval(line.score, line.isMate, line.mateIn)
}

export default function BestLines({ lines, isAnalyzingPosition, onLineClick, fen }: BestLinesProps) {
  const visibleLines = lines.slice(0, MAX_LINES)
  const pvNotations = useMemo(
    () => visibleLines.map(line => {
      const sans = pvToSans(fen, line.pv)
      return formatPvNotation(fen, sans)
    }),
    [fen, visibleLines],
  )

  return (
    <div className="best-lines">
      {isAnalyzingPosition && lines.length === 0 ? (
        <>
          <div className="best-line-row best-line-skeleton" />
          <div className="best-line-row best-line-skeleton" />
          <div className="best-line-row best-line-skeleton" />
        </>
      ) : (
        visibleLines.map((line, i) => (
          <button
            key={line.rank}
            className="best-line-row"
            onClick={() => onLineClick(line)}
            title="Click to explore this line"
          >
            <span className="best-line-dot" style={{ background: LINE_COLORS[i] ?? LINE_COLORS[0] }} />
            <span className="best-line-pv">{pvNotations[i] || line.san}</span>
            <span className="best-line-eval">{formatScore(line)}</span>
          </button>
        ))
      )}
    </div>
  )
}
