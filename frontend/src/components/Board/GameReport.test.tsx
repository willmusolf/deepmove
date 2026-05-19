import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { MoveEval } from '../../engine/analysis'
import GameReport from './GameReport'
import calibrationData from './gameRatingCalibrationData.json'
import { buildCalibrationSnapshot, computeSideStats, estimatePerformanceRating } from './GameReport'
import { estimatePerformanceRatingFromInputs, type SideResult } from './gameRatingModel'

function makeEval(
  moveNumber: number,
  color: 'white' | 'black',
  score: number,
  grade: MoveEval['grade'] = null,
): MoveEval {
  return {
    moveNumber,
    color,
    san: 'e4',
    fen: 'stub-fen',
    eval: {
      score,
      depth: 18,
      fen: 'stub-fen',
      isMate: false,
      mateIn: null,
      bestMove: '',
      pv: [],
    },
    grade,
  }
}

function legacyEstimatePerformanceRating(
  accuracy: number | null,
  rating: number | null,
  sideResult: SideResult,
): number | null {
  if (accuracy === null || rating === null) return null

  const expected = 50 + 45 / (1 + Math.exp(-(rating - 1500) / 700))
  let estimate = rating + (accuracy - expected) * 5

  if (sideResult === 'win') {
    estimate += 50
    if (accuracy < 70) estimate -= (70 - accuracy) * 3
  } else if (sideResult === 'loss') {
    estimate -= 175
    if (accuracy < 80) estimate -= (80 - accuracy) * 7
    estimate = Math.min(estimate, rating - 25)
  } else if (sideResult === 'draw') {
    estimate = Math.max(rating - 75, Math.min(rating + 75, estimate))
  }

  return Math.round(Math.max(100, Math.min(3200, estimate)) / 50) * 50
}

function getSideResult(result: string, color: 'white' | 'black'): SideResult {
  if (result === '1-0') return color === 'white' ? 'win' : 'loss'
  if (result === '0-1') return color === 'black' ? 'win' : 'loss'
  return 'draw'
}

describe('computeSideStats', () => {
  it('returns null for empty evals', () => {
    expect(computeSideStats([], 'white')).toBeNull()
  })

  it('returns null when a side has no analyzed moves yet', () => {
    const evals: MoveEval[] = [makeEval(1, 'white', 30, 'best')]
    expect(computeSideStats(evals, 'black')).toBeNull()
  })

  it('returns a summary when a side has moves', () => {
    const evals: MoveEval[] = [
      makeEval(1, 'white', 30000, 'best'),
      makeEval(1, 'black', 0, 'mistake'),
      makeEval(2, 'white', 0, 'blunder'),
    ]

    const stats = computeSideStats(evals, 'white')
    expect(stats).not.toBeNull()
    expect(stats!.counts.best).toBe(1)
    expect(stats!.counts.blunder).toBe(1)
  })

  it('counts rendered grade buckets correctly', () => {
    const evals: MoveEval[] = [
      makeEval(1, 'white', 0, 'good'),
      makeEval(1, 'black', 0, 'blunder'),
      makeEval(2, 'white', 0, 'good'),
      makeEval(2, 'black', 0),
      makeEval(3, 'white', 0, 'excellent'),
    ]

    const stats = computeSideStats(evals, 'white')
    expect(stats?.counts.good).toBe(2)
    expect(stats?.counts.excellent).toBe(1)
  })
})

describe('GameReport rendering', () => {
  it('hides the report while analysis is incomplete', () => {
    const { container } = render(
      <GameReport
        moveEvals={[makeEval(1, 'white', 40, 'best')]}
        userColor="white"
        analysisComplete={false}
      />
    )

    expect(container.firstChild).toBeNull()
  })
  it('renders the compact stat strip after analysis completes', () => {
    const { container } = render(
      <GameReport
        moveEvals={[
          makeEval(1, 'white', 30, 'best'),
          makeEval(1, 'black', 20, 'mistake'),
        ]}
        userColor="white"
        analysisComplete={true}
        whiteElo="1500"
        blackElo="1400"
      />
    )

    expect(container.querySelectorAll('.game-report-side')).toHaveLength(2)
    expect(container.querySelector('.game-report-highlights')).toBeNull()
    expect(container.textContent).toContain('White')
    expect(container.textContent).toContain('Black')
    expect(container.textContent).toContain('Accuracy:')
    expect(container.textContent).toContain('Game Rating:')
    expect(container.textContent).toMatch(/\d+(\.\d)?%/)
    expect(container.textContent).not.toContain('~')
  })

  it('renders player names and uses ratings as an internal input, not as display text', () => {
    const { container } = render(
      <GameReport
        moveEvals={[
          makeEval(1, 'white', 30, 'best'),
          makeEval(1, 'black', 20, 'mistake'),
        ]}
        userColor="white"
        analysisComplete={true}
        whiteName="Alice"
        blackName="Bob"
        whiteElo="1500"
        blackElo="1400"
      />
    )

    expect(container.textContent).toContain('Alice')
    expect(container.textContent).toContain('Bob')
    expect(container.textContent).toContain('Game Rating:')
    expect(container.textContent).not.toContain('(1500)')
    expect(container.textContent).not.toContain('(1400)')
  })
})

describe('buildCalibrationSnapshot', () => {
  it('builds a copyable snapshot with source URL and DeepMove review metrics', () => {
    const moveEvals: MoveEval[] = [
      makeEval(1, 'white', 30, 'best'),
      makeEval(1, 'black', 20, 'mistake'),
      makeEval(2, 'white', 40, 'good'),
      makeEval(2, 'black', 10, 'blunder'),
    ]

    const whiteStats = computeSideStats(moveEvals, 'white')
    const blackStats = computeSideStats(moveEvals, 'black')

    const snapshot = buildCalibrationSnapshot({
      platform: 'chesscom',
      gameId: 'https://www.chess.com/game/live/123',
      timeControl: '10 min',
      endTime: Date.UTC(2026, 4, 13, 16, 0, 0),
      result: '1-0',
      whiteName: 'Alice',
      blackName: 'Bob',
      whiteElo: '1500',
      blackElo: '1400',
      whiteStats,
      blackStats,
      whiteAccuracy: 91.2,
      blackAccuracy: 62.5,
    })

    expect(snapshot.sourceUrl).toBe('https://www.chess.com/game/live/123')
    expect(snapshot.players.white.deepmoveAccuracy).toBe(91.2)
    expect(snapshot.players.white.deepmoveGameRating).toBeGreaterThan(1500)
    expect(snapshot.players.white.deepmoveBadges.best).toBe(1)
    expect(snapshot.players.white.deepmoveBadges.good).toBe(1)
    expect(snapshot.players.black.deepmoveBadges.mistake).toBe(1)
    expect(snapshot.players.black.deepmoveBadges.blunder).toBe(1)
    expect(snapshot).not.toHaveProperty('chesscomReview')
  })

  it('fills snapshot accuracy and rating even when analysis inputs are sparse', () => {
    const snapshot = buildCalibrationSnapshot({
      platform: 'pgn-paste',
      gameId: null,
      result: null,
      whiteName: 'Alice',
      blackName: 'Bob',
      whiteElo: null,
      blackElo: null,
      whiteStats: null,
      blackStats: { counts: { best: 1 } },
      whiteAccuracy: null,
      blackAccuracy: 83.4,
    })

    expect(snapshot.players.white.deepmoveAccuracy).toBe(100)
    expect(snapshot.players.white.deepmoveGameRating).toBe(1650)
    expect(snapshot.players.black.deepmoveAccuracy).toBe(83.4)
    expect(snapshot.players.black.deepmoveGameRating).toBe(1400)
  })
})

describe('game rating calibration', () => {
  it('falls back to a usable estimate when one or both ratings are missing', () => {
    expect(estimatePerformanceRatingFromInputs(83.4, null, null, null)).toBe(1400)
    expect(estimatePerformanceRatingFromInputs(72.8, 1292, null, 'win')).toBe(1500)
    expect(estimatePerformanceRatingFromInputs(64.5, null, 1269, 'loss')).toBe(950)
  })

  it('raises compressed high-end performances closer to the Chess.com sample set', () => {
    const sampleCases = [
      { gameId: '168331799352', color: 'white' as const },
      { gameId: '168331799352', color: 'black' as const },
      { gameId: '168559744704', color: 'white' as const },
      { gameId: '167814796476', color: 'white' as const },
      { gameId: '167144755286', color: 'black' as const },
    ]

    for (const sampleCase of sampleCases) {
      const game = calibrationData.find(entry => entry.gameId === sampleCase.gameId)
      expect(game).toBeTruthy()

      const side = game!.players[sampleCase.color]
      const opponent = sampleCase.color === 'white' ? game!.players.black : game!.players.white
      const sideResult = getSideResult(game!.result, sampleCase.color)

      const calibrated = estimatePerformanceRatingFromInputs(
        side.deepmoveAccuracy,
        side.rating,
        opponent.rating,
        sideResult,
      )
      const legacy = legacyEstimatePerformanceRating(side.deepmoveAccuracy, side.rating, sideResult)

      expect(calibrated).not.toBeNull()
      expect(legacy).not.toBeNull()
      expect(Math.abs((calibrated ?? 0) - side.chesscomGameRating)).toBeLessThanOrEqual(
        Math.abs((legacy ?? 0) - side.chesscomGameRating),
      )
    }
  })

  it('improves aggregate fit across the calibration dataset without inflating low-quality losses', () => {
    let calibratedError = 0
    let legacyError = 0
    let lowQualityLossCount = 0

    for (const game of calibrationData) {
      for (const color of ['white', 'black'] as const) {
        const side = game.players[color]
        const opponent = color === 'white' ? game.players.black : game.players.white
        const sideResult = getSideResult(game.result, color)
        const calibrated = estimatePerformanceRatingFromInputs(
          side.deepmoveAccuracy,
          side.rating,
          opponent.rating,
          sideResult,
        )
        const legacy = legacyEstimatePerformanceRating(side.deepmoveAccuracy, side.rating, sideResult)

        calibratedError += Math.abs((calibrated ?? 0) - side.chesscomGameRating)
        legacyError += Math.abs((legacy ?? 0) - side.chesscomGameRating)

        if (sideResult === 'loss' && side.deepmoveAccuracy <= 70) {
          lowQualityLossCount += 1
          expect(calibrated).not.toBeNull()
          expect(calibrated).toBeLessThanOrEqual(opponent.rating + 100)
        }
      }
    }

    expect(lowQualityLossCount).toBeGreaterThan(0)
    expect(calibratedError).toBeLessThan(legacyError)
  })

  it('uses both player and opponent ratings when estimating a side performance', () => {
    expect(estimatePerformanceRating(91.8, '1312', '1709', 'win')).toBe(
      estimatePerformanceRatingFromInputs(91.8, 1312, 1709, 'win'),
    )
  })
})
