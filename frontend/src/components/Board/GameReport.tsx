import { useMemo } from 'react'
import { computeAccuracy, type MoveEval } from '../../engine/analysis'
import { getGradeBadgeMeta, renderGradeBadgeGlyph } from './gradeBadges'

interface GameReportProps {
  moveEvals: MoveEval[]
  userColor?: 'white' | 'black' | null
  analysisComplete?: boolean
  whiteName?: string | null
  blackName?: string | null
  whiteElo?: string | null
  blackElo?: string | null
}

interface SideStats {
  counts: Partial<Record<string, number>>
}

const GRADE_ORDER = ['brilliant', 'great', 'best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder', 'miss'] as const

export function computeSideStats(allEvals: MoveEval[], side: 'white' | 'black'): SideStats | null {
  if (allEvals.length === 0) return null

  let moveCount = 0
  const counts: Partial<Record<string, number>> = {}

  for (let i = 0; i < allEvals.length; i += 1) {
    const moveEval = allEvals[i]
    if (moveEval.color !== side) continue

    moveCount += 1
    if (moveEval.grade) {
      counts[moveEval.grade] = (counts[moveEval.grade] ?? 0) + 1
    }
  }

  if (moveCount === 0) return null

  return { counts }
}

interface SidePanelProps {
  label: string
  stats: SideStats | null
  isUser: boolean
  accuracy: number | null
  playerName?: string | null
  elo?: string | null
}

function accuracyToneClass(accuracy: number): string {
  if (accuracy >= 80) return 'game-report-accuracy--green'
  if (accuracy >= 60) return 'game-report-accuracy--yellow'
  return 'game-report-accuracy--red'
}

function SidePanel({ label, stats, isUser, accuracy, playerName, elo }: SidePanelProps) {
  const displayName = playerName?.trim() || label
  const showElo = elo?.trim() || null

  return (
    <div className={`game-report-side${isUser ? ' game-report-side--user' : ''}`}>
      <div className="game-report-header">
        <div className="game-report-player">
          <span className="game-report-player-name">{displayName}</span>
          {showElo && <span className="game-report-player-elo">({showElo})</span>}
        </div>
      </div>
      {stats && accuracy !== null && (
        <div className={`game-report-accuracy ${accuracyToneClass(accuracy)}`}>
          {accuracy.toFixed(1)}%
        </div>
      )}
      <div className="game-report-grades">
        {stats
          ? GRADE_ORDER.map(grade => {
              const count = stats.counts[grade]
              if (!count) return null
              const meta = getGradeBadgeMeta(grade)
              if (!meta) return null

              return (
                <span
                  key={grade}
                  className={`game-report-pill ${meta.reportClass}`}
                  title={meta.ariaLabel}
                >
                  <span className="game-report-pill-sym">{renderGradeBadgeGlyph(grade, 'report')}</span>
                  <span className="game-report-pill-count">{count}</span>
                </span>
              )
            })
          : <span className="game-report-status">No moves yet</span>}
      </div>
    </div>
  )
}

export default function GameReport({
  moveEvals,
  userColor,
  analysisComplete = true,
  whiteName,
  blackName,
  whiteElo,
  blackElo,
}: GameReportProps) {
  const white = useMemo(() => computeSideStats(moveEvals, 'white'), [moveEvals])
  const black = useMemo(() => computeSideStats(moveEvals, 'black'), [moveEvals])
  const whiteAccuracy = useMemo(() => computeAccuracy(moveEvals, 'white'), [moveEvals])
  const blackAccuracy = useMemo(() => computeAccuracy(moveEvals, 'black'), [moveEvals])

  if (!analysisComplete) return null
  if (!white && !black) return null

  return (
    <div className="game-report">
      <SidePanel
        label="White"
        stats={white}
        isUser={userColor === 'white'}
        accuracy={white ? whiteAccuracy : null}
        playerName={whiteName}
        elo={whiteElo}
      />
      <div className="game-report-divider" />
      <SidePanel
        label="Black"
        stats={black}
        isUser={userColor === 'black'}
        accuracy={black ? blackAccuracy : null}
        playerName={blackName}
        elo={blackElo}
      />
    </div>
  )
}
