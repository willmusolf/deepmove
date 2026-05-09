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
const COLLAPSED_MAX_PLIES = 5
const EXPANDED_MAX_PLIES = 12
const MOBILE_BREAKPOINT = '(max-width: 640px)'

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

function formatScore(line: TopLine): string {
  return formatEval(line.score, line.isMate, line.mateIn)
}

function buildCollapsedSegments(
  fen: string,
  sans: string[],
  maxMoves = 8,
): Array<{ prefix: string; san: string; plyCount: number; key: string }> {
  const parts = fen.split(' ')
  let moveNum = parseInt(parts[5] ?? '1', 10)
  let isWhite = parts[1] === 'w'
  const segments: Array<{ prefix: string; san: string; plyCount: number; key: string }> = []

  for (let i = 0; i < Math.min(sans.length, maxMoves); i += 1) {
    let prefix = ''
    if (isWhite) {
      prefix = `${moveNum}.`
    } else if (i === 0) {
      prefix = `${moveNum}...`
    }

    segments.push({ prefix, san: sans[i], plyCount: i + 1, key: `seg-${i}` })

    if (!isWhite) moveNum += 1
    isWhite = !isWhite
  }

  return segments
}

export default function BestLines({ lines, isAnalyzingPosition, onLineClick, onLineMoveClick, fen }: BestLinesProps) {
  const visibleLines = lines.slice(0, MAX_LINES)
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const [isMobile, setIsMobile] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia(MOBILE_BREAKPOINT).matches
  ))
  const pvData = useMemo(
    () => visibleLines.map(line => {
      const sans = pvToSans(fen, line.pv)
      return {
        collapsedSegments: buildCollapsedSegments(fen, sans, COLLAPSED_MAX_PLIES),
        expandedSegments: buildCollapsedSegments(fen, sans, EXPANDED_MAX_PLIES),
      }
    }),
    [fen, visibleLines],
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mediaQuery = window.matchMedia(MOBILE_BREAKPOINT)
    const sync = () => setIsMobile(mediaQuery.matches)
    sync()
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', sync)
      return () => mediaQuery.removeEventListener('change', sync)
    }
    mediaQuery.addListener(sync)
    return () => mediaQuery.removeListener(sync)
  }, [])

  useEffect(() => {
    setExpandedIndex(null)
  }, [fen])

  const expandedLine = expandedIndex !== null ? visibleLines[expandedIndex] : null
  const expandedSegments = expandedIndex !== null ? (pvData[expandedIndex]?.expandedSegments ?? []) : []

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
              <span className="best-line-pv">
                {(pvData[i]?.collapsedSegments.length ?? 0) > 0
                  ? pvData[i]!.collapsedSegments.map(segment => (
                    <span key={segment.key} className="best-line-pv__segment">
                      {segment.prefix && <span className="best-line-pv__prefix">{segment.prefix}</span>}
                      {isMobile ? (
                        <span className="best-line-pv__text">{segment.san}</span>
                      ) : (
                        <button
                          type="button"
                          className="best-line-pv__move"
                          onClick={(event) => {
                            event.stopPropagation()
                            onLineMoveClick(line, segment.plyCount)
                          }}
                          onKeyDown={(event) => event.stopPropagation()}
                          title={`Go to ${segment.prefix}${segment.san}`}
                        >
                          {segment.san}
                        </button>
                      )}
                    </span>
                  ))
                  : line.san}
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
              {expandedSegments.map(segment => (
                <span key={segment.key} className="best-lines-overlay__segment">
                  {segment.prefix && <span className="best-lines-overlay__prefix">{segment.prefix}</span>}
                  <button
                    type="button"
                    className="best-lines-overlay__move"
                    onClick={() => onLineMoveClick(expandedLine, segment.plyCount)}
                    title={`Go to ${segment.prefix}${segment.san}`}
                  >
                    {segment.san}
                  </button>
                </span>
              ))}
            </span>
            <span className="best-lines-overlay__eval">{formatScore(expandedLine)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
