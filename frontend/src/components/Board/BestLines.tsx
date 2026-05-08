// BestLines.tsx — Shows top engine lines (multi-PV) for the current position.
// Clicking a line enters variation mode to walk through the PV on the board.

import { Chess } from 'chess.js'
import { useEffect, useMemo, useState } from 'react'
import type { TopLine } from '../../engine/stockfish'
import { formatEval } from '../../utils/format'

interface BestLinesProps {
  lines: TopLine[]
  isAnalyzingPosition: boolean
  onLineClick: (line: TopLine) => void
  onLineMoveClick: (line: TopLine, plyCount: number) => void
  fen: string
}

const MAX_LINES = 2
const COLLAPSED_MAX_PLIES = 10
const EXPANDED_MAX_PLIES = 16
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

function buildPvTokens(fen: string, sans: string[], maxMoves = 8): Array<{ text: string; plyCount: number | null; key: string }> {
  const parts = fen.split(' ')
  let moveNum = parseInt(parts[5] ?? '1', 10)
  let isWhite = parts[1] === 'w'
  const tokens: Array<{ text: string; plyCount: number | null; key: string }> = []

  for (let i = 0; i < Math.min(sans.length, maxMoves); i += 1) {
    if (isWhite) {
      tokens.push({ text: `${moveNum}.`, plyCount: null, key: `mn-${i}` })
    } else if (i === 0) {
      tokens.push({ text: `${moveNum}...`, plyCount: null, key: `mn-${i}` })
    }

    tokens.push({ text: sans[i], plyCount: i + 1, key: `san-${i}` })

    if (!isWhite) moveNum += 1
    isWhite = !isWhite
  }

  return tokens
}

export default function BestLines({ lines, isAnalyzingPosition, onLineClick, onLineMoveClick, fen }: BestLinesProps) {
  const visibleLines = lines.slice(0, MAX_LINES)
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const pvData = useMemo(
    () => visibleLines.map(line => {
      const sans = pvToSans(fen, line.pv)
      return {
        notation: formatPvNotation(fen, sans, COLLAPSED_MAX_PLIES),
        collapsedTokens: buildPvTokens(fen, sans, COLLAPSED_MAX_PLIES),
        expandedTokens: buildPvTokens(fen, sans, EXPANDED_MAX_PLIES),
      }
    }),
    [fen, visibleLines],
  )

  useEffect(() => {
    setExpandedIndex(null)
  }, [fen])

  const expandedLine = expandedIndex !== null ? visibleLines[expandedIndex] : null
  const expandedTokens = expandedIndex !== null ? (pvData[expandedIndex]?.expandedTokens ?? []) : []

  return (
    <div className="best-lines">
      {isAnalyzingPosition && lines.length === 0 ? (
        <>
          <div className="best-line-row best-line-skeleton" />
          <div className="best-line-row best-line-skeleton" />
        </>
      ) : (
        visibleLines.map((line, i) => (
          <div
            key={line.rank}
            className="best-line-row"
            role="button"
            tabIndex={0}
            onClick={() => onLineClick(line)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onLineClick(line)
              }
            }}
          >
            <div className="best-line-main" title="Click to explore this line">
              <span className="best-line-dot" style={{ background: LINE_COLORS[i] ?? LINE_COLORS[0] }} />
              <span className="best-line-pv">
                {(pvData[i]?.collapsedTokens.length ?? 0) > 0
                  ? pvData[i]!.collapsedTokens.map(token => (
                    token.plyCount === null ? (
                      <span key={token.key} className="best-line-pv__move-num">{token.text}</span>
                    ) : (
                      <button
                        key={token.key}
                        type="button"
                        className="best-line-pv__move"
                        onClick={(event) => {
                          event.stopPropagation()
                          onLineMoveClick(line, token.plyCount!)
                        }}
                        onKeyDown={(event) => event.stopPropagation()}
                        title={`Go to ${token.text}`}
                      >
                        {token.text}
                      </button>
                    )
                  ))
                  : (pvData[i]?.notation || line.san)}
              </span>
            </div>
            <button
              type="button"
              className={`best-line-expand${expandedIndex === i ? ' best-line-expand--open' : ''}`}
              aria-label={expandedIndex === i ? 'Hide full line' : 'Show full line'}
              title={expandedIndex === i ? 'Hide full line' : 'Show full line'}
              onClick={(event) => {
                event.stopPropagation()
                setExpandedIndex(prev => (prev === i ? null : i))
              }}
              onKeyDown={(event) => event.stopPropagation()}
            >
              ▾
            </button>
            <span className="best-line-eval">{formatScore(line)}</span>
          </div>
        ))
      )}
      {expandedLine && (
        <div className="best-lines-overlay" role="dialog" aria-label="Full best line">
          <button
            type="button"
            className="best-lines-overlay__close"
            onClick={() => setExpandedIndex(null)}
            aria-label="Close full line"
          >
            ×
          </button>
          <div className="best-lines-overlay__body">
            <span className="best-lines-overlay__pv">
              {expandedTokens.map(token => (
                token.plyCount === null ? (
                  <span key={token.key} className="best-lines-overlay__move-num">{token.text}</span>
                ) : (
                  <button
                    key={token.key}
                    type="button"
                    className="best-lines-overlay__move"
                    onClick={() => onLineMoveClick(expandedLine, token.plyCount!)}
                    title={`Go to ${token.text}`}
                  >
                    {token.text}
                  </button>
                )
              ))}
            </span>
            <span className="best-lines-overlay__eval">{formatScore(expandedLine)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
