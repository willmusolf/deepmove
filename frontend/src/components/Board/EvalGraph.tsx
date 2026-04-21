// EvalGraph.tsx — Smooth bezier eval curve with small color-coded annotation dots.
// Fixed 120px height, ResizeObserver for width. SVG clipPath ensures fill matches curve.

import { useState, useRef, useEffect, useMemo } from 'react'
import type { MoveEval } from '../../engine/analysis'
import type { CriticalMoment } from '../../chess/types'
import { formatEval } from '../../utils/format'

interface EvalGraphProps {
  moveEvals: MoveEval[]
  totalMoves: number
  currentMoveIndex: number
  onNavigate: (index: number) => void
  criticalMoments?: CriticalMoment[]
  viewMode?: 'classic' | 'coach'
}

const HEIGHT = 120
const CLAMP = 700      // centipawns at which curve hits ~100%
const TENSION = 0.4   // Catmull-Rom tension
const DOT_R = 6       // radius of annotation circles
const DOT_R_HOVER = 9 // radius when hovered
const DOT_HIT_R = 13  // invisible hit target for easier mouse capture

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

/** Close a bezier path to midY, forming a filled area between curve and center */
function buildFillPath(bezierD: string, pts: Point[], midY: number): string {
  return `${bezierD} L${pts[pts.length - 1].x.toFixed(2)},${midY.toFixed(2)} L${pts[0].x.toFixed(2)},${midY.toFixed(2)} Z`
}

interface AnnotationCircle {
  moveIndex: number   // 1-based
  x: number
  y: number
  fill: string
  grade: string
}

// Grade → circle fill color. Only notable grades get circles.
const GRADE_CIRCLE_COLOR: Partial<Record<string, string>> = {
  blunder:    '#ef4444',
  mistake:    '#fb923c',
  inaccuracy: '#facc15',
  brilliant:  '#22d3ee',
  great:      '#22c55e',
  miss:       '#a78bfa',
}

const GRADE_LABEL: Partial<Record<string, string>> = {
  blunder:    'Blunder',
  mistake:    'Mistake',
  inaccuracy: 'Inaccuracy',
  brilliant:  'Brilliant',
  great:      'Great',
  miss:       'Miss',
}

export default function EvalGraph({
  moveEvals,
  totalMoves,
  currentMoveIndex,
  onNavigate,
  criticalMoments = [],
  viewMode = 'classic',
}: EvalGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [svgWidth, setSvgWidth] = useState(600)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let rafId = 0
    const ro = new ResizeObserver(entries => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        const w = entries[0].contentRect.width
        if (w > 0) setSvgWidth(w)
      })
    })
    ro.observe(el)
    return () => { ro.disconnect(); cancelAnimationFrame(rafId) }
  }, [])

  const analyzed = moveEvals.length
  // Use the larger of totalMoves prop and analyzed count — totalMoves should always be the
  // full game length from PGN, so x-positions are stable even as analysis fills in.
  const total = Math.max(totalMoves, analyzed, 1)

  const { colWidth, midY, points, annotations, criticalBands, curvePath } = useMemo(() => {
    const cw = svgWidth / (total + 1)
    const mx = (i: number) => i * cw
    const my = cpToY(0, HEIGHT)

    const pts: Point[] = [{ x: mx(0), y: my }]
    for (let i = 0; i < analyzed; i++) {
      pts.push({ x: mx(i + 1), y: cpToY(moveEvals[i].eval.score, HEIGHT) })
    }

    const anns: AnnotationCircle[] = []
    for (let i = 0; i < moveEvals.length; i++) {
      const me = moveEvals[i]
      const grade = me.grade ?? ''

      // Coach mode: only blunder + mistake circles
      if (viewMode === 'coach' && grade !== 'blunder' && grade !== 'mistake') continue

      const fill = GRADE_CIRCLE_COLOR[grade]
      if (!fill) continue

      const x = mx(i + 1)
      const y = cpToY(me.eval.score, HEIGHT)
      anns.push({ moveIndex: i + 1, x, y, fill, grade })
    }

    const bands: number[] = []
    for (const cm of criticalMoments) {
      const idx = moveEvals.findIndex(
        me => me.moveNumber === cm.moveNumber && me.color === cm.color
      )
      if (idx !== -1) bands.push(idx + 1)
    }

    const cp = buildBezierPath(pts)

    return { colWidth: cw, midY: my, points: pts, annotations: anns, criticalBands: bands, curvePath: cp }
  }, [moveEvals, svgWidth, total, analyzed, criticalMoments, viewMode])

  const moveX = (i: number) => i * colWidth

  // ── Cursor ───────────────────────────────────────────────────────────────
  const cursorX = currentMoveIndex <= analyzed ? moveX(currentMoveIndex) : null
  const cursorY = currentMoveIndex > 0 && currentMoveIndex <= analyzed
    ? points[currentMoveIndex].y
    : midY

  // ── Hover ────────────────────────────────────────────────────────────────
  const hoveredEval = hoveredIndex !== null && hoveredIndex > 0
    ? moveEvals[hoveredIndex - 1] : null
  const hoveredX = hoveredIndex !== null ? moveX(hoveredIndex) : null

  const tooltipLeftPct = hoveredX !== null
    ? Math.max(4, Math.min(96, (hoveredX / svgWidth) * 100))
    : null

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
      {/* Tooltip */}
      {hoveredEval && tooltipLeftPct !== null && (
        <div className="eval-graph-tooltip" style={{ left: `${tooltipLeftPct}%` }}>
          {(() => {
            const hoveredAnnotation = annotations.find(a => a.moveIndex === hoveredIndex)
            const gradeLabel = hoveredAnnotation ? GRADE_LABEL[hoveredAnnotation.grade] : undefined
            return gradeLabel ? (
              <span
                className="eval-graph-tooltip-grade"
                style={{ color: hoveredAnnotation!.fill }}
              >
                {gradeLabel}
              </span>
            ) : null
          })()}
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
            <clipPath id="clipAboveMid">
              <rect x="0" y="0" width={svgWidth} height={midY} />
            </clipPath>
            <clipPath id="clipBelowMid">
              <rect x="0" y={midY} width={svgWidth} height={HEIGHT - midY} />
            </clipPath>
            <filter id="dotGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="3" floodOpacity="0.7" />
            </filter>
          </defs>

          {/* Background */}
          <rect x="0" y="0" width={svgWidth} height={HEIGHT} fill="#0f1117" />

          {/* Critical moment golden bands (coach mode only) */}
          {viewMode === 'coach' && criticalBands.map(idx => (
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

          {/* White area (above midY) — fill between curve and center, clipped to top half */}
          {curvePath && (
            <path
              d={buildFillPath(curvePath, points, midY)}
              fill="url(#whiteGrad)"
              clipPath="url(#clipAboveMid)"
            />
          )}

          {/* Black area (below midY) — fill between curve and center, clipped to bottom half */}
          {curvePath && (
            <path
              d={buildFillPath(curvePath, points, midY)}
              fill="rgba(22,22,22,0.92)"
              clipPath="url(#clipBelowMid)"
            />
          )}

          {/* Center line */}
          <line
            x1="0" y1={midY} x2={svgWidth} y2={midY}
            stroke="rgba(255,255,255,0.20)"
            strokeWidth="0.8"
          />

          {/* Eval curve */}
          {curvePath && (
            <path
              d={curvePath}
              fill="none"
              stroke="rgba(255,255,255,0.35)"
              strokeWidth="1.2"
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

          {/* Annotation dots — color-coded circles on the curve */}
          {annotations.map(a => {
            const isHovered = hoveredIndex === a.moveIndex
            return (
              <g
                key={`ann-${a.moveIndex}`}
                style={{ cursor: 'pointer' }}
                onClick={(e) => { e.stopPropagation(); onNavigate(a.moveIndex) }}
                onMouseEnter={() => setHoveredIndex(a.moveIndex)}
              >
                {/* Invisible larger hit area for easier hovering */}
                <circle cx={a.x} cy={a.y} r={DOT_HIT_R} fill="transparent" />
                {/* Visible dot — grows and glows on hover */}
                <circle
                  cx={a.x}
                  cy={a.y}
                  r={isHovered ? DOT_R_HOVER : DOT_R}
                  fill={a.fill}
                  stroke={isHovered ? 'rgba(255,255,255,0.85)' : 'rgba(15,17,23,0.7)'}
                  strokeWidth={isHovered ? 2 : 1}
                  filter={isHovered ? 'url(#dotGlow)' : undefined}
                  style={{ transition: 'r 0.1s, stroke-width 0.1s' }}
                />
              </g>
            )
          })}

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
                cx={cursorX} cy={cursorY} r="2.8"
                fill="var(--color-accent)"
                stroke="rgba(255,255,255,0.6)"
                strokeWidth="0.8"
                opacity="0.95"
              />
            </>
          )}
        </svg>
      </div>
    </div>
  )
}
