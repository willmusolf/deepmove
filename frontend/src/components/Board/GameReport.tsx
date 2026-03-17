// GameReport.tsx — Compact per-player stats strip shown below the eval graph.
// Shows accuracy %, ACPL, and move grade breakdown for both sides.

import type { MoveEval } from '../../engine/analysis'

interface GameReportProps {
  moveEvals: MoveEval[]
  userColor?: 'white' | 'black' | null
}

interface SideStats {
  acpl: number
  accuracy: number
  counts: Partial<Record<string, number>>
}

const SCORE_CAP = 1000
function capScore(s: number): number {
  return Math.max(-SCORE_CAP, Math.min(SCORE_CAP, s))
}

export function computeSideStats(allEvals: MoveEval[], side: 'white' | 'black'): SideStats | null {
  if (allEvals.length === 0) return null

  let totalLoss = 0
  let moveCount = 0
  const counts: Partial<Record<string, number>> = {}

  for (let i = 0; i < allEvals.length; i++) {
    const me = allEvals[i]
    if (me.color !== side) continue
    moveCount++
    const prevScore = capScore(i === 0 ? 0 : allEvals[i - 1].eval.score)
    const curScore = capScore(me.eval.score)
    const loss = side === 'white'
      ? (prevScore - curScore)
      : (curScore - prevScore)
    totalLoss += Math.max(0, loss)
    if (me.grade) counts[me.grade] = (counts[me.grade] ?? 0) + 1
  }

  if (moveCount === 0) return null

  const acpl = totalLoss / moveCount
  // Lichess-style accuracy formula
  const accuracy = Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * acpl) - 3.1669))

  return { acpl: Math.round(acpl), accuracy: Math.round(accuracy), counts }
}

const GRADE_ORDER = ['brilliant', 'best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder'] as const

const GRADE_DISPLAY: Record<string, { symbol: string; cls: string }> = {
  brilliant:  { symbol: '!!', cls: 'gr-brilliant' },
  best:       { symbol: '!',  cls: 'gr-best' },
  excellent:  { symbol: '!',  cls: 'gr-excellent' },
  good:       { symbol: '',   cls: 'gr-good' },
  inaccuracy: { symbol: '?!', cls: 'gr-inaccuracy' },
  mistake:    { symbol: '?',  cls: 'gr-mistake' },
  blunder:    { symbol: '??', cls: 'gr-blunder' },
}

function accuracyColor(pct: number): string {
  if (pct >= 90) return '#22c55e'
  if (pct >= 75) return '#84cc16'
  if (pct >= 60) return '#eab308'
  if (pct >= 45) return '#f97316'
  return '#ef4444'
}

interface SidePanelProps {
  label: string
  stats: SideStats
  isUser: boolean
}

function SidePanel({ label, stats, isUser }: SidePanelProps) {
  const color = accuracyColor(stats.accuracy)
  return (
    <div className={`game-report-side${isUser ? ' game-report-side--user' : ''}`}>
      <div className="game-report-header">
        <span className="game-report-label">{label}</span>
        <span className="game-report-accuracy" style={{ color }}>
          {stats.accuracy}%
        </span>
      </div>
      <div className="game-report-acpl">
        avg loss <strong>{stats.acpl}</strong> cp
      </div>
      <div className="game-report-grades">
        {GRADE_ORDER.map(g => {
          const count = stats.counts[g]
          if (!count) return null
          const d = GRADE_DISPLAY[g]
          return (
            <span key={g} className={`game-report-pill ${d.cls}`} title={g}>
              {d.symbol || g.slice(0, 1).toUpperCase()}{count}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export default function GameReport({ moveEvals, userColor }: GameReportProps) {
  const white = computeSideStats(moveEvals, 'white')
  const black = computeSideStats(moveEvals, 'black')
  if (!white || !black) return null

  return (
    <div className="game-report">
      <SidePanel
        label="White"
        stats={white}
        isUser={userColor === 'white'}
      />
      <div className="game-report-divider" />
      <SidePanel
        label="Black"
        stats={black}
        isUser={userColor === 'black'}
      />
    </div>
  )
}
