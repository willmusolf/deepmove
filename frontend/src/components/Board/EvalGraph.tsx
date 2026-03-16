// EvalGraph.tsx — Smooth bezier eval curve, pixel-accurate SVG, HTML annotation strip
// Uses ResizeObserver to track real container width → viewBox units = pixels → no stretching.
// Annotation symbols rendered as HTML badges below the graph (Chess.com style).

import { useState, useRef, useEffect } from 'react'
import type { MoveEval } from '../../engine/analysis'
import type { CriticalMoment } from '../../chess/types'

interface EvalGraphProps {
  moveEvals: MoveEval[]
  totalMoves: number
  currentMoveIndex: number
  onNavigate: (index: number) => void
  criticalMoments?: CriticalMoment[]
}

const HEIGHT = 96
const CLAMP = 700    // centipawns at which curve hits ~100%
const TENSION = 0.4  // Catmull-Rom tension

type Point = { x: number; y: number }

/** Convert centipawns (white-perspective) to Y pixel (0=top=black winning) */
function cpToY(cp: number, height: number): number {
  const clamped = Math.max(-CLAMP, Math.min(CLAMP, cp))
  const pct = 1 / (1 + Math.exp(-clamped / 200))
  return height * (1 - pct)
}

/** Build a smooth cubic bezier SVG path from an array of points (Catmull-Rom) */
function buildBezierPath(pts: Point[]): string {
  if (pts.length < 2) return ''
  let d = `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    const cp1x = p1.x + (p2.x - p0.x) * TENSION
    const cp1y = p1.y + (p2.y - p0.y) * TENSION
    const cp2x = p2.x - (p3.x - p1.x) * TENSION
    const cp2y = p2.y - (p3.y - p1.y) * TENSION
    d += ` C${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`
  }
  return d
}

/** Build closed bezier area path: bezier trace clipped to midY, then close along midY */
function buildBezierArea(pts: Point[], midY: number, above: boolean): string {
  if (pts.length < 2) return ''
  const clipped = pts.map(p => ({
    x: p.x,
    y: above ? Math.min(p.y, midY) : Math.max(p.y, midY),
  }))
  let d = buildBezierPath(clipped)
  d += ` L${clipped[clipped.length - 1].x.toFixed(2)},${midY.toFixed(2)}`
  d += ` L${clipped[0].x.toFixed(2)},${midY.toFixed(2)} Z`
  return d
}

interface Annotation {
  moveIndex: number
  grade: string
  symbol: string
  colorClass: string
  pctX: number  // 0-100 percentage for HTML positioning
}

export default function EvalGraph({
  moveEvals,
  totalMoves,
  currentMoveIndex,
  onNavigate,
  criticalMoments = [],
}: EvalGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [svgWidth, setSvgWidth] = useState(600)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const w = entries[0].contentRect.width
      if (w > 0) setSvgWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const analyzed = moveEvals.length
  const total = Math.max(totalMoves, analyzed)

  if (total === 0) return null

  // Pixel-accurate column width — SVG units now equal real pixels
  const colWidth = svgWidth / (total + 1)

  function moveX(i: number): number {
    return i * colWidth
  }

  const midY = cpToY(0, HEIGHT)

  // Build points: index 0 = start pos (eval 0), 1..n = analyzed moves
  const points: Point[] = [{ x: moveX(0), y: midY }]
  for (let i = 0; i < analyzed; i++) {
    points.push({ x: moveX(i + 1), y: cpToY(moveEvals[i].eval.score, HEIGHT) })
  }

  // ── Annotations (HTML strip) ─────────────────────────────────────────────
  const annotations: Annotation[] = []
  for (let i = 0; i < moveEvals.length; i++) {
    const me = moveEvals[i]
    const prevScore = i === 0 ? 0 : moveEvals[i - 1].eval.score
    const cpGain = me.color === 'white'
      ? (me.eval.score - prevScore)
      : (prevScore - me.eval.score)

    let symbol: string | null = null
    let colorClass = ''
    let grade = me.grade ?? ''

    if (me.grade === 'blunder') {
      symbol = '??'; colorClass = 'eval-graph-badge--blunder'
    } else if (me.grade === 'mistake') {
      symbol = '?'; colorClass = 'eval-graph-badge--mistake'
    } else if (me.grade === 'brilliant') {
      symbol = '!!'; colorClass = 'eval-graph-badge--brilliant'
    } else if ((me.grade === 'best' || me.grade === 'excellent') && cpGain > 150) {
      symbol = '!'; colorClass = 'eval-graph-badge--best'
    }

    if (symbol) {
      annotations.push({
        moveIndex: i + 1,
        grade,
        symbol,
        colorClass,
        pctX: Math.max(1, Math.min(99, (moveX(i + 1) / svgWidth) * 100)),
      })
    }
  }

  // ── Critical moment bands ────────────────────────────────────────────────
  const criticalBands: number[] = []
  for (const cm of criticalMoments) {
    const idx = moveEvals.findIndex(
      me => me.moveNumber === cm.moveNumber && me.color === cm.color
    )
    if (idx !== -1) criticalBands.push(idx + 1)
  }

  // ── Cursor ───────────────────────────────────────────────────────────────
  const cursorX = currentMoveIndex <= analyzed ? moveX(currentMoveIndex) : null
  const cursorY = currentMoveIndex > 0 && currentMoveIndex <= analyzed
    ? points[currentMoveIndex].y
    : midY

  // ── Hover ────────────────────────────────────────────────────────────────
  const hoveredEval = hoveredIndex !== null && hoveredIndex > 0
    ? moveEvals[hoveredIndex - 1] : null
  const hoveredX = hoveredIndex !== null ? moveX(hoveredIndex) : null

  // Tooltip left % (clamped so it stays within bounds)
  const tooltipLeftPct = hoveredX !== null
    ? Math.max(4, Math.min(96, (hoveredX / svgWidth) * 100))
    : null

  function formatEval(score: number, isMate: boolean, mateIn: number | null): string {
    if (isMate) return mateIn !== null ? `M${Math.abs(mateIn)}` : 'M'
    const pawns = (score / 100).toFixed(2)
    return score >= 0 ? `+${pawns}` : pawns
  }

  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    if (analyzed === 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const relX = (e.clientX - rect.left) / rect.width
    onNavigate(Math.max(0, Math.min(analyzed, Math.round(relX * total))))
  }

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (analyzed === 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const relX = (e.clientX - rect.left) / rect.width
    setHoveredIndex(Math.max(0, Math.min(analyzed, Math.round(relX * total))))
  }

  return (
    <div className="eval-graph-wrap" ref={containerRef}>
      {/* Tooltip — floats above the container */}
      {hoveredEval && tooltipLeftPct !== null && (
        <div className="eval-graph-tooltip" style={{ left: `${tooltipLeftPct}%` }}>
          <span className="eval-graph-tooltip-move">
            {Math.ceil(hoveredIndex! / 2)}{hoveredEval.color === 'white' ? '.' : '...'}
            {hoveredEval.san}
          </span>
          <span className="eval-graph-tooltip-eval">
            {formatEval(hoveredEval.eval.score, hoveredEval.eval.isMate, hoveredEval.eval.mateIn)}
          </span>
        </div>
      )}

      <div className="eval-graph-container">
        <svg
          className="eval-graph-svg"
          viewBox={`0 0 ${svgWidth} ${HEIGHT}`}
          preserveAspectRatio="none"
          onClick={handleClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <defs>
            <linearGradient id="whiteGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(238,232,212,0.92)" />
              <stop offset="100%" stopColor="rgba(218,210,185,0.68)" />
            </linearGradient>
          </defs>

          {/* Background */}
          <rect x="0" y="0" width={svgWidth} height={HEIGHT} fill="#0f1117" />

          {/* Critical moment golden bands */}
          {criticalBands.map(idx => (
            <rect
              key={`cm-${idx}`}
              x={moveX(idx) - colWidth * 0.6}
              y={0}
              width={colWidth * 1.4}
              height={HEIGHT}
              fill="rgba(251,191,36,0.09)"
              style={{ pointerEvents: 'none' }}
            />
          ))}

          {/* Greyed future area */}
          {analyzed < total && (
            <rect
              x={moveX(analyzed + 1)}
              y={0}
              width={svgWidth - moveX(analyzed + 1)}
              height={HEIGHT}
              fill="rgba(255,255,255,0.025)"
            />
          )}

          {/* White area */}
          {points.length >= 2 && (
            <path d={buildBezierArea(points, midY, true)} fill="url(#whiteGrad)" />
          )}

          {/* Black area */}
          {points.length >= 2 && (
            <path d={buildBezierArea(points, midY, false)} fill="rgba(22,22,22,0.92)" />
          )}

          {/* Center line */}
          <line
            x1="0" y1={midY} x2={svgWidth} y2={midY}
            stroke="rgba(255,255,255,0.20)"
            strokeWidth="0.8"
          />

          {/* Eval curve */}
          {points.length >= 2 && (
            <path
              d={buildBezierPath(points)}
              fill="none"
              stroke="rgba(255,255,255,0.30)"
              strokeWidth="0.8"
            />
          )}

          {/* Hover dashed line */}
          {hoveredX !== null && hoveredX !== cursorX && (
            <line
              x1={hoveredX} y1={0} x2={hoveredX} y2={HEIGHT}
              stroke="rgba(255,255,255,0.28)"
              strokeWidth="1"
              strokeDasharray="3,3"
            />
          )}

          {/* Cursor line + dot */}
          {cursorX !== null && (
            <>
              <line
                x1={cursorX} y1={0} x2={cursorX} y2={HEIGHT}
                stroke="var(--color-accent)"
                strokeWidth="1.2"
                opacity="0.88"
              />
              <circle
                cx={cursorX} cy={cursorY} r="2.5"
                fill="var(--color-accent)"
                stroke="rgba(255,255,255,0.6)"
                strokeWidth="0.8"
                opacity="0.95"
              />
            </>
          )}
        </svg>
      </div>

      {/* Annotation strip — HTML badges, immune to SVG coordinate stretching */}
      {annotations.length > 0 && (
        <div className="eval-graph-annotations">
          {annotations.map(a => (
            <span
              key={a.moveIndex}
              className={`eval-graph-badge ${a.colorClass}`}
              style={{ left: `${a.pctX}%` }}
              title={`${a.symbol} — move ${Math.ceil(a.moveIndex / 2)}`}
            >
              {a.symbol}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}