// EvalGraph.tsx — Chess Sigma style progressive eval curve
// Area chart: white fill above center, black fill below.
// Renders progressively as moveEvals stream in from Stockfish.
// Clicking a position navigates to that move. Cursor line tracks currentMoveIndex.

import type { MoveEval } from '../../engine/analysis'

interface EvalGraphProps {
  moveEvals: MoveEval[]
  totalMoves: number          // total expected moves (for greyed out future area)
  currentMoveIndex: number    // 1-based move index (0 = start)
  onNavigate: (index: number) => void
}

const HEIGHT = 96
const CLAMP = 700            // centipawns at which the bar hits ~100%

/** Convert centipawns (white-perspective) to Y pixel (0 = top = black winning) */
function cpToY(cp: number): number {
  const clamped = Math.max(-CLAMP, Math.min(CLAMP, cp))
  // Sigmoid: 50% = center (eval 0), top = black winning, bottom = white winning
  const pct = 1 / (1 + Math.exp(-clamped / 200))
  // pct = 1 means white winning totally → bottom. pct = 0 → top (black winning)
  return HEIGHT * (1 - pct)
}

const GRADE_COLORS: Record<string, string> = {
  blunder:    '#ef4444',
  mistake:    '#f97316',
  inaccuracy: '#eab308',
}

export default function EvalGraph({
  moveEvals,
  totalMoves,
  currentMoveIndex,
  onNavigate,
}: EvalGraphProps) {
  const analyzed = moveEvals.length
  const total = Math.max(totalMoves, analyzed)

  // Nothing to render yet
  if (total === 0) return null

  // X positions: each move gets equal width. Move index i → x = (i + 0.5) * colWidth
  // We include a point at x=0 for the starting position (eval = 0).
  const W = 100  // Use viewBox units (percentage-based)
  const colWidth = W / (total + 1)  // +1 to include start position column

  function moveX(i: number): number {
    // i=0 → start position, i=1 → after move 1, etc.
    return i * colWidth
  }

  // Build points: [startPos, ...analyzed moves]
  // startPos always at eval 0
  const points: Array<{ x: number; y: number; evalScore: number }> = [
    { x: moveX(0), y: cpToY(0), evalScore: 0 },
  ]
  for (let i = 0; i < analyzed; i++) {
    points.push({
      x: moveX(i + 1),
      y: cpToY(moveEvals[i].eval.score),
      evalScore: moveEvals[i].eval.score,
    })
  }

  const midY = cpToY(0)  // y at eval=0 (center line)

  // Build SVG polygon path for white area (above center) and black area (below center)
  // We'll use a filled area: white fill = above midY, black fill = below midY
  // Combine into single path that clips at midY

  // White area: polygon going along the line then down to midY
  function buildWhiteArea(): string {
    if (points.length < 2) return ''
    // trace forward along top then back along midY
    const forward = points.map(p => `${p.x},${Math.min(p.y, midY)}`).join(' ')
    const back = [...points].reverse().map(p => `${p.x},${midY}`).join(' ')
    return `${forward} ${back}`
  }

  function buildBlackArea(): string {
    if (points.length < 2) return ''
    const forward = points.map(p => `${p.x},${Math.max(p.y, midY)}`).join(' ')
    const back = [...points].reverse().map(p => `${p.x},${midY}`).join(' ')
    return `${forward} ${back}`
  }

  // The eval curve line itself
  function buildLine(): string {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  }

  // Annotation dots for significant moves
  const annotations = moveEvals
    .map((me, i) => ({ me, i }))
    .filter(({ me }) => me.grade === 'blunder' || me.grade === 'mistake' || me.grade === 'inaccuracy')
    .map(({ me, i }) => ({
      x: moveX(i + 1),
      y: cpToY(me.eval.score),
      color: GRADE_COLORS[me.grade!],
      moveIndex: i + 1,
    }))

  // Cursor line for current move
  const cursorX = currentMoveIndex <= analyzed ? moveX(currentMoveIndex) : null

  // Click handler: map clientX → move index
  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    if (analyzed === 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const relX = (e.clientX - rect.left) / rect.width  // 0–1
    const index = Math.round(relX * total)
    const clamped = Math.max(0, Math.min(analyzed, index))
    onNavigate(clamped)
  }

  return (
    <div className="eval-graph-container">
      <svg
        className="eval-graph-svg"
        viewBox={`0 0 ${W} ${HEIGHT}`}
        preserveAspectRatio="none"
        onClick={handleClick}
      >
        {/* Background */}
        <rect x="0" y="0" width={W} height={HEIGHT} fill="var(--graph-bg, #1a1a2e)" />

        {/* Center line */}
        <line x1="0" y1={midY} x2={W} y2={midY} stroke="var(--color-border)" strokeWidth="0.5" />

        {/* Greyed future area (unanalyzed) */}
        {analyzed < total && (
          <rect
            x={moveX(analyzed + 1)}
            y={0}
            width={moveX(total) - moveX(analyzed + 1)}
            height={HEIGHT}
            fill="rgba(255,255,255,0.03)"
          />
        )}

        {/* White area (above midY = white advantage) */}
        {points.length >= 2 && (
          <polygon
            points={buildWhiteArea()}
            fill="rgba(220,216,200,0.85)"
          />
        )}

        {/* Black area (below midY = black advantage) */}
        {points.length >= 2 && (
          <polygon
            points={buildBlackArea()}
            fill="rgba(40,40,40,0.9)"
          />
        )}

        {/* Eval line */}
        {points.length >= 2 && (
          <path
            d={buildLine()}
            fill="none"
            stroke="rgba(255,255,255,0.4)"
            strokeWidth="0.6"
          />
        )}

        {/* Annotation dots */}
        {annotations.map(a => (
          <circle
            key={a.moveIndex}
            cx={a.x}
            cy={a.y}
            r="2"
            fill={a.color}
            className="eval-graph-dot"
          />
        ))}

        {/* Cursor line (current move) */}
        {cursorX !== null && (
          <line
            x1={cursorX}
            y1={0}
            x2={cursorX}
            y2={HEIGHT}
            stroke="var(--color-accent)"
            strokeWidth="0.8"
            opacity="0.7"
          />
        )}
      </svg>
    </div>
  )
}
