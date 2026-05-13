import { useMemo, useState } from 'react'
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
  result?: string | null
  platform?: 'chesscom' | 'lichess' | 'pgn-paste' | null
  gameId?: string | null
  timeControl?: string | null
  endTime?: number | null
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
  rating?: string | null
}

function accuracyToneClass(accuracy: number): string {
  if (accuracy >= 80) return 'game-report-accuracy--green'
  if (accuracy >= 60) return 'game-report-accuracy--yellow'
  return 'game-report-accuracy--red'
}

function parseRating(rating: string | null | undefined): number | null {
  if (!rating) return null
  const parsed = parseInt(rating.replace(/[^\d]/g, ''), 10)
  return Number.isFinite(parsed) ? parsed : null
}

function expectedAccuracyForRating(rating: number): number {
  return 50 + 45 / (1 + Math.exp(-(rating - 1500) / 700))
}

function roundToNearest50(value: number): number {
  return Math.round(value / 50) * 50
}

function getSideResult(result: string | null | undefined, label: string): 'win' | 'loss' | 'draw' | null {
  if (!result) return null
  if (result === '1/2-1/2') return 'draw'
  if (result === '1-0') return label === 'White' ? 'win' : 'loss'
  if (result === '0-1') return label === 'Black' ? 'win' : 'loss'
  return null
}

export function estimatePerformanceRating(
  accuracy: number | null,
  rating: string | null | undefined,
  sideResult: 'win' | 'loss' | 'draw' | null,
): number | null {
  if (accuracy === null) return null
  const parsedRating = parseRating(rating)
  if (parsedRating === null) return null

  const expected = expectedAccuracyForRating(parsedRating)
  let estimate = parsedRating + (accuracy - expected) * 5

  if (sideResult === 'win') {
    estimate += 50
    if (accuracy < 70) estimate -= (70 - accuracy) * 3
  } else if (sideResult === 'loss') {
    estimate -= 175
    if (accuracy < 80) estimate -= (80 - accuracy) * 7
    estimate = Math.min(estimate, parsedRating - 25)
  } else if (sideResult === 'draw') {
    estimate = Math.max(parsedRating - 75, Math.min(parsedRating + 75, estimate))
  }

  return roundToNearest50(Math.max(100, Math.min(3200, estimate)))
}

function buildSourceUrl(platform: GameReportProps['platform'], gameId: string | null | undefined): string | null {
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
  platform: GameReportProps['platform']
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
  platform?: GameReportProps['platform']
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
  const whiteGameRating = estimatePerformanceRating(whiteAccuracy, whiteElo, getSideResult(result, 'White'))
  const blackGameRating = estimatePerformanceRating(blackAccuracy, blackElo, getSideResult(result, 'Black'))

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

async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fall through to the textarea fallback.
    }
  }

  if (typeof document === 'undefined') return false
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'
  document.body.appendChild(textarea)
  textarea.select()

  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(textarea)
  }
}

function SidePanel({ label, stats, isUser, accuracy, playerName, rating, result }: SidePanelProps & { result?: string | null }) {
  const displayName = playerName?.trim() || label
  const performanceRating = estimatePerformanceRating(accuracy, rating, getSideResult(result, label))
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
  platform = null,
  gameId = null,
  timeControl = null,
  endTime = null,
}: GameReportProps) {
  const white = useMemo(() => computeSideStats(moveEvals, 'white'), [moveEvals])
  const black = useMemo(() => computeSideStats(moveEvals, 'black'), [moveEvals])
  const whiteAccuracy = useMemo(() => computeAccuracy(moveEvals, 'white'), [moveEvals])
  const blackAccuracy = useMemo(() => computeAccuracy(moveEvals, 'black'), [moveEvals])
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')

  const calibrationSnapshot = useMemo(
    () => buildCalibrationSnapshot({
      platform,
      gameId,
      timeControl,
      endTime,
      result,
      whiteName,
      blackName,
      whiteElo,
      blackElo,
      whiteStats: white,
      blackStats: black,
      whiteAccuracy: white ? whiteAccuracy : null,
      blackAccuracy: black ? blackAccuracy : null,
    }),
    [
      platform,
      gameId,
      timeControl,
      endTime,
      result,
      whiteName,
      blackName,
      whiteElo,
      blackElo,
      white,
      black,
      whiteAccuracy,
      blackAccuracy,
    ],
  )

  if (!analysisComplete) return null
  if (!white && !black) return null

  async function handleCopyCalibrationSnapshot() {
    const ok = await copyText(JSON.stringify(calibrationSnapshot, null, 2))
    setCopyState(ok ? 'copied' : 'error')
    window.setTimeout(() => {
      setCopyState(prev => (prev === (ok ? 'copied' : 'error') ? 'idle' : prev))
    }, 2500)
  }

  return (
    <div className="game-report-wrap">
      <div className="game-report">
        <SidePanel
          label="White"
          stats={white}
          isUser={userColor === 'white'}
          accuracy={white ? whiteAccuracy : null}
          playerName={whiteName}
          rating={whiteElo}
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
          result={result}
        />
      </div>
      <div className="game-report-actions">
        <button
          type="button"
          className="btn btn-secondary game-report-copy-btn"
          onClick={handleCopyCalibrationSnapshot}
        >
          Copy DeepMove Stats
        </button>
        <span className="game-report-copy-status" aria-live="polite">
          {copyState === 'copied' ? 'Copied JSON snapshot for comparison.' : ''}
          {copyState === 'error' ? 'Copy failed. Try again.' : ''}
        </span>
      </div>
    </div>
  )
}
