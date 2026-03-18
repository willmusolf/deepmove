// EvalBar.tsx — Evaluation bar alongside the chess board
// Uses absolute positioning to avoid flex reflow flicker.
// Holds last known eval to prevent 50/50 flash during transitions.

import { useRef } from 'react'

interface EvalBarProps {
  evalCentipawns?: number  // undefined = no data yet (shows 50/50)
  isMate?: boolean
  mateIn?: number | null
  hidden?: boolean         // Think First mode
  orientation?: 'white' | 'black'
}

// Convert centipawns to white-side percentage (0–100) for the bar height.
// Divisor of 150: +300cp (~3 pawns) ≈ 88%, +500cp (~5 pawns) ≈ 96% — feels decisive.
function cpToWhitePct(cp: number): number {
  return 100 / (1 + Math.exp(-cp / 150))
}

export default function EvalBar({
  evalCentipawns,
  isMate,
  mateIn,
  hidden,
  orientation = 'white',
}: EvalBarProps) {
  if (hidden) return null

  // Hold the last known eval so the bar never flashes to 50/50 during
  // transient undefined frames (branch entry, position change debounce).
  const lastRef = useRef<{ cp: number; isMate: boolean; mateIn: number | null }>({ cp: 0, isMate: false, mateIn: null })
  if (evalCentipawns !== undefined) {
    lastRef.current = { cp: evalCentipawns, isMate: isMate ?? false, mateIn: mateIn ?? null }
  }
  const cp = evalCentipawns ?? lastRef.current.cp
  const mate = evalCentipawns !== undefined ? (isMate ?? false) : lastRef.current.isMate
  const mIn = evalCentipawns !== undefined ? (mateIn ?? null) : lastRef.current.mateIn

  const whitePct = cpToWhitePct(cp)
  const blackPct = 100 - whitePct

  // When board is flipped (black at bottom), flip the bar too
  const topPct = orientation === 'white' ? blackPct : whitePct
  const botPct = orientation === 'white' ? whitePct : blackPct

  // Build the label shown at the boundary
  let boundaryLabel: string
  if (mate && mIn != null) {
    boundaryLabel = `M${Math.abs(mIn)}`
  } else {
    const pawns = cp / 100
    const sign = pawns > 0 ? '+' : ''
    boundaryLabel = `${sign}${pawns.toFixed(1)}`
  }

  return (
    <div className="eval-bar-container">
      {/* Inner wrapper clips the bar segments to rounded corners */}
      <div className="eval-bar-inner">
        {/* Black: grows down from top. White: grows up from bottom.
            Both absolutely positioned — immune to flex reflow. */}
        <div className="eval-bar-black" style={{ height: `${topPct}%` }} />
        <div className="eval-bar-white" style={{ height: `${botPct}%` }} />
      </div>

      {/* Center tick — marks the even (0.0) position */}
      <div className="eval-bar-midline" />

      {/* Numeric eval label at the boundary — outside inner so it's not clipped */}
      <div
        className="eval-bar-label"
        style={{ top: `${topPct}%` }}
      >
        {boundaryLabel}
      </div>
    </div>
  )
}
