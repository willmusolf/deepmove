// EvalBar.tsx — Evaluation bar alongside the chess board
// IMPORTANT: hidden=true in Think First mode — hides eval until user engages.

interface EvalBarProps {
  evalCentipawns?: number  // undefined = no data yet (shows 50/50)
  isMate?: boolean
  mateIn?: number | null
  isAnalyzing?: boolean
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
  isAnalyzing,
  hidden,
  orientation = 'white',
}: EvalBarProps) {
  if (hidden) return null

  // During analysis, hold at 50/50 — don't jitter with every analyzed move
  const whitePct = (!isAnalyzing && evalCentipawns !== undefined) ? cpToWhitePct(evalCentipawns) : 50
  const blackPct = 100 - whitePct

  // When board is flipped (black at bottom), flip the bar too
  const topPct = orientation === 'white' ? blackPct : whitePct
  const botPct = orientation === 'white' ? whitePct : blackPct
  const topCls = orientation === 'white' ? 'eval-bar-black' : 'eval-bar-white'
  const botCls = orientation === 'white' ? 'eval-bar-white' : 'eval-bar-black'

  // Build the label shown at the boundary
  let boundaryLabel: string
  if (isAnalyzing) {
    boundaryLabel = '0.0'
  } else if (isMate && mateIn != null) {
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
      <div className={topCls} style={{ height: `${topPct}%` }} />
      <div className={botCls} style={{ height: `${botPct}%` }} />

      {/* Numeric eval label at the boundary */}
      <div
        className="eval-bar-label"
        style={{ top: `${topPct}%` }}
      >
        {boundaryLabel}
      </div>

      {isAnalyzing && <div className="eval-bar-analyzing" />}
    </div>
  )
}
