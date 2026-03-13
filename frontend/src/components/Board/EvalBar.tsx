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

  // Mate label: white winning = white shows "M{n}", black winning = black shows "M{n}"
  const mateLabel =
    isMate && mateIn != null ? `M${Math.abs(mateIn)}` : null

  return (
    <div className="eval-bar-container" title={evalCentipawns !== undefined ? `${evalCentipawns > 0 ? '+' : ''}${(evalCentipawns / 100).toFixed(2)}` : 'Analyzing…'}>
      {/* Black's section (top) */}
      <div className="eval-bar-black" style={{ height: `${blackPct}%` }}>
        {mateLabel && mateIn != null && mateIn < 0 && (
          <span className="eval-mate-label">{mateLabel}</span>
        )}
      </div>

      {/* White's section (bottom) */}
      <div className="eval-bar-white" style={{ height: `${whitePct}%` }}>
        {mateLabel && mateIn != null && mateIn > 0 && (
          <span className="eval-mate-label">{mateLabel}</span>
        )}
      </div>

      {isAnalyzing && <div className="eval-bar-analyzing" />}
    </div>
  )
}
