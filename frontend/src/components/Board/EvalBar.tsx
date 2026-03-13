// EvalBar.tsx — Evaluation bar alongside the chess board
// IMPORTANT: hidden=true in Think First mode — hides eval until user engages.

interface EvalBarProps {
  evalCentipawns?: number  // undefined = no data yet (shows 50/50)
  isMate?: boolean
  mateIn?: number | null
  isAnalyzing?: boolean
  hidden?: boolean         // Think First mode
}

// Convert centipawns to white-side percentage (0–100) for the bar height.
// Uses a sigmoid so extreme advantages look decisive without hitting hard 100/0.
function cpToWhitePct(cp: number): number {
  return 100 / (1 + Math.exp(-cp / 300))
}

export default function EvalBar({
  evalCentipawns,
  isMate,
  mateIn,
  isAnalyzing,
  hidden,
}: EvalBarProps) {
  if (hidden) return null

  const whitePct = evalCentipawns !== undefined ? cpToWhitePct(evalCentipawns) : 50
  const blackPct = 100 - whitePct

  // Build the label shown at the boundary
  let boundaryLabel: string
  if (isMate && mateIn != null) {
    boundaryLabel = `M${Math.abs(mateIn)}`
  } else if (evalCentipawns !== undefined) {
    const pawns = evalCentipawns / 100
    const sign = pawns > 0 ? '+' : ''
    boundaryLabel = `${sign}${pawns.toFixed(1)}`
  } else {
    boundaryLabel = '0.0'
  }

  return (
    <div className="eval-bar-container" style={{ position: 'relative' }}>
      {/* Black's section (top) */}
      <div className="eval-bar-black" style={{ height: `${blackPct}%` }} />

      {/* White's section (bottom) */}
      <div className="eval-bar-white" style={{ height: `${whitePct}%` }} />

      {/* Numeric eval label at the boundary */}
      <div
        className="eval-bar-label"
        style={{ top: `${blackPct}%` }}
      >
        {boundaryLabel}
      </div>

      {isAnalyzing && <div className="eval-bar-analyzing" />}
    </div>
  )
}
