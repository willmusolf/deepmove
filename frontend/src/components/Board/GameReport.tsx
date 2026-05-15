import { useMemo } from 'react'
import { computeAccuracy, type MoveEval } from '../../engine/analysis'
import { getGradeBadgeMeta, renderGradeBadgeGlyph } from './gradeBadges'
import {
  estimatePerformanceRatingFromInputs,
  parseRating,
  type SideResult,
} from './gameRatingModel'

interface GameReportProps {
  moveEvals: MoveEval[]
  userColor?: 'white' | 'black' | null
  analysisComplete?: boolean
  whiteName?: string | null
  blackName?: string | null
  whiteElo?: string | null
  blackElo?: string | null
  result?: string | null
}

interface SideStats {
  counts: Partial<Record<string, number>>
}

type CalibrationExportPlatform = 'chesscom' | 'lichess' | 'pgn-paste' | null

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
  rating?: string | null
  opponentRating?: string | null
}

function accuracyToneClass(accuracy: number): string {
  if (accuracy >= 80) return 'game-report-accuracy--green'
  if (accuracy >= 60) return 'game-report-accuracy--yellow'
  return 'game-report-accuracy--red'
}

function getSideResult(result: string | null | undefined, label: string): SideResult {
  if (!result) return null
  if (result === '1/2-1/2') return 'draw'
  if (result === '1-0') return label === 'White' ? 'win' : 'loss'
  if (result === '0-1') return label === 'Black' ? 'win' : 'loss'
  return null
}

export function estimatePerformanceRating(
  accuracy: number | null,
  rating: string | null | undefined,
  opponentRating: string | null | undefined,
  sideResult: 'win' | 'loss' | 'draw' | null,
): number | null {
  const parsedRating = parseRating(rating)
  const parsedOpponentRating = parseRating(opponentRating)
  return estimatePerformanceRatingFromInputs(accuracy, parsedRating, parsedOpponentRating, sideResult)
}

function buildSourceUrl(platform: CalibrationExportPlatform, gameId: string | null | undefined): string | null {
  if (!gameId) return null
  if (platform === 'chesscom' && gameId.startsWith('http')) return gameId
  if (platform === 'lichess' && gameId.startsWith('lichess:')) return `https://lichess.org/${gameId.slice('lichess:'.length)}`
  return null
}

export interface CalibrationSnapshotSide {
  name: string
  rating: number | null
  deepmoveAccuracy: number | null
  deepmoveGameRating: number | null
  deepmoveBadges: Partial<Record<string, number>>
}

export interface CalibrationSnapshot {
  sourceUrl: string | null
  platform: CalibrationExportPlatform
  gameId: string | null
  result: string | null
  timeControl: string | null
  endTimeIso: string | null
  players: {
    white: CalibrationSnapshotSide
    black: CalibrationSnapshotSide
  }
  chesscomReview: {
    whiteAccuracy: number | null
    blackAccuracy: number | null
    whiteGameRating: number | null
    blackGameRating: number | null
    whiteBadgeNotes: string
    blackBadgeNotes: string
    notableDifferences: string
  }
}

interface BuildCalibrationSnapshotArgs {
  platform?: CalibrationExportPlatform
  gameId?: string | null
  timeControl?: string | null
  endTime?: number | null
  result?: string | null
  whiteName?: string | null
  blackName?: string | null
  whiteElo?: string | null
  blackElo?: string | null
  whiteStats: SideStats | null
  blackStats: SideStats | null
  whiteAccuracy: number | null
  blackAccuracy: number | null
}

export function buildCalibrationSnapshot({
  platform = null,
  gameId = null,
  timeControl = null,
  endTime = null,
  result = null,
  whiteName,
  blackName,
  whiteElo,
  blackElo,
  whiteStats,
  blackStats,
  whiteAccuracy,
  blackAccuracy,
}: BuildCalibrationSnapshotArgs): CalibrationSnapshot {
  const whiteGameRating = estimatePerformanceRating(whiteAccuracy, whiteElo, blackElo, getSideResult(result, 'White'))
  const blackGameRating = estimatePerformanceRating(blackAccuracy, blackElo, whiteElo, getSideResult(result, 'Black'))

  return {
    sourceUrl: buildSourceUrl(platform, gameId),
    platform,
    gameId,
    result,
    timeControl,
    endTimeIso: typeof endTime === 'number' ? new Date(endTime).toISOString() : null,
    players: {
      white: {
        name: whiteName?.trim() || 'White',
        rating: parseRating(whiteElo),
        deepmoveAccuracy: whiteAccuracy,
        deepmoveGameRating: whiteGameRating,
        deepmoveBadges: whiteStats?.counts ?? {},
      },
      black: {
        name: blackName?.trim() || 'Black',
        rating: parseRating(blackElo),
        deepmoveAccuracy: blackAccuracy,
        deepmoveGameRating: blackGameRating,
        deepmoveBadges: blackStats?.counts ?? {},
      },
    },
    chesscomReview: {
      whiteAccuracy: null,
      blackAccuracy: null,
      whiteGameRating: null,
      blackGameRating: null,
      whiteBadgeNotes: '',
      blackBadgeNotes: '',
      notableDifferences: '',
    },
  }
}

function SidePanel({ label, stats, isUser, accuracy, playerName, rating, opponentRating, result }: SidePanelProps & { result?: string | null }) {
  const displayName = playerName?.trim() || label
  const performanceRating = estimatePerformanceRating(
    accuracy,
    rating,
    opponentRating,
    getSideResult(result, label),
  )
  const sideClass = label === 'White' ? 'game-report-player-dot--white' : 'game-report-player-dot--black'

  return (
    <div className={`game-report-side${isUser ? ' game-report-side--user' : ''}`}>
      <div className="game-report-header">
        <div className="game-report-player">
          <span className={`game-report-player-dot ${sideClass}`} aria-hidden="true" />
          <span className="game-report-player-name">{displayName}</span>
        </div>
      </div>
      {stats && (
        <div className="game-report-metrics">
          {accuracy !== null && (
            <div className="game-report-metric">
              <span className="game-report-metric-label">Accuracy:</span>
              <span className={`game-report-accuracy ${accuracyToneClass(accuracy)}`}>{accuracy.toFixed(1)}%</span>
            </div>
          )}
          {performanceRating !== null && (
            <div className="game-report-metric">
              <span className="game-report-metric-label">Game Rating:</span>
              <span className="game-report-rating">{performanceRating}</span>
            </div>
          )}
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
  result,
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
        rating={whiteElo}
        opponentRating={blackElo}
        result={result}
      />
      <div className="game-report-divider" />
      <SidePanel
        label="Black"
        stats={black}
        isUser={userColor === 'black'}
        accuracy={black ? blackAccuracy : null}
        playerName={blackName}
        rating={blackElo}
        opponentRating={whiteElo}
        result={result}
      />
    </div>
  )
}
