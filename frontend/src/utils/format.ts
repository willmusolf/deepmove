// format.ts — Shared formatting utilities used across components

/** Convert milliseconds to H:MM:SS display string for chess clocks */
export function msToHHMMSS(ms: number | null): string | undefined {
  if (ms === null) return undefined
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Format a unix-ms timestamp as "MMM DD YYYY - HH:MM" */
export function formatTimestamp(ms: number): string {
  const d = new Date(ms)
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).replace(',', '')
  return `${date} - ${time}`
}

/** Cap a centipawn score to +-SCORE_CAP to prevent mate scores (+-30000) from distorting calculations */
const SCORE_CAP = 1000
export function capScore(s: number): number {
  return Math.max(-SCORE_CAP, Math.min(SCORE_CAP, s))
}

/** Format an eval score for display (e.g. "+1.50", "-0.30", "M3") */
export function formatEval(score: number | undefined, isMate: boolean, mateIn: number | null): string {
  if (score === undefined) return '\u2014'  // em dash
  if (isMate) return mateIn !== null ? `M${Math.abs(mateIn)}` : 'M'
  const pawns = (score / 100).toFixed(2)
  return score >= 0 ? `+${pawns}` : pawns
}
