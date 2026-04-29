import { useMemo } from 'react'
import type { MoveEval } from '../../engine/analysis'
import { computeAccuracy } from '../../engine/analysis'
import { getGradeBadgeMeta, renderGradeBadgeGlyph } from './gradeBadges'

interface GameReportProps {
  moveEvals: MoveEval[]
  userColor?: 'white' | 'black' | null
  isAnalyzing?: boolean
}

interface SideStats {
  acpl: number
  accuracy: number
  counts: Partial<Record<string, number>>
}

const SCORE_CAP = 1000
const GRADE_ORDER = ['brilliant', 'great', 'best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder', 'miss'] as const

function capScore(score: number): number {
  return Math.max(-SCORE_CAP, Math.min(SCORE_CAP, score))
}

export function computeSideStats(allEvals: MoveEval[], side: 'white' | 'black'): SideStats | null {
  if (allEvals.length === 0) return null

  let totalLoss = 0
  let moveCount = 0
  const counts: Partial<Record<string, number>> = {}

  for (let i = 0; i < allEvals.length; i += 1) {
    const moveEval = allEvals[i]
    if (moveEval.color !== side) continue

    moveCount += 1
    const prevScore = capScore(i === 0 ? 0 : allEvals[i - 1].eval.score)
    const curScore = capScore(moveEval.eval.score)
    const loss = side === 'white'
      ? (prevScore - curScore)
      : (curScore - prevScore)

    totalLoss += Math.max(0, loss)

    if (moveEval.grade) {
      counts[moveEval.grade] = (counts[moveEval.grade] ?? 0) + 1
    }
  }

  if (moveCount === 0) return null

  return {
    acpl: Math.round(totalLoss / moveCount),
    accuracy: computeAccuracy(allEvals, side),
    counts,
  }
}

function accuracyColor(percent: number): string {
  if (percent >= 90) return '#22c55e'
  if (percent >= 75) return '#84cc16'
  if (percent >= 60) return '#eab308'
  if (percent >= 45) return '#f97316'
  return '#ef4444'
}

interface SidePanelProps {
  label: string
  stats: SideStats | null
  isUser: boolean
  isAnalyzing: boolean
}

function SidePanel({ label, stats, isUser, isAnalyzing }: SidePanelProps) {
  const accuracy = stats?.accuracy ?? null
  const color = accuracy !== null ? accuracyColor(accuracy) : undefined

  return (
    <div className={`game-report-side${isUser ? ' game-report-side--user' : ''}`}>
      <div className="game-report-header">
        <span className="game-report-label">{label}</span>
        <span className="game-report-accuracy" style={color ? { color } : undefined}>
          {accuracy !== null ? `${accuracy}%` : '—'}
        </span>
      </div>
      <div className="game-report-acpl">
        avg loss <strong>{stats ? stats.acpl : '—'}</strong> cp
      </div>
      <div className="game-report-grades">
        {stats
          ? GRADE_ORDER.map(grade => {
              const count = stats.counts[grade]
              if (!count) return null
              const meta = getGradeBadgeMeta(grade)
              if (!meta) return null

              return (
                <span key={grade} className={`game-report-pill ${meta.reportClass}`} title={meta.ariaLabel}>
                  <span className="game-report-pill-sym">{renderGradeBadgeGlyph(grade, 'report')}</span>
                  <span className="game-report-pill-count">{count}</span>
                </span>
              )
            })
          : isAnalyzing
            ? <span className="game-report-status">Analyzing…</span>
            : <span className="game-report-status">No moves yet</span>}
      </div>
    </div>
  )
}

export default function GameReport({ moveEvals, userColor, isAnalyzing = false }: GameReportProps) {
  const white = useMemo(() => computeSideStats(moveEvals, 'white'), [moveEvals])
  const black = useMemo(() => computeSideStats(moveEvals, 'black'), [moveEvals])

  if (!white && !black && !isAnalyzing) return null

  return (
    <div className="game-report">
      <SidePanel
        label="White"
        stats={white}
        isUser={userColor === 'white'}
        isAnalyzing={isAnalyzing}
      />
      <div className="game-report-divider" />
      <SidePanel
        label="Black"
        stats={black}
        isUser={userColor === 'black'}
        isAnalyzing={isAnalyzing}
      />
    </div>
  )
}
