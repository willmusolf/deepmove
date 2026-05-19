import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { computeAccuracy, type MoveEval } from '../../engine/analysis'
import GameReport from './GameReport'
import calibrationData from './gameRatingCalibrationData.json'
import { buildCalibrationSnapshot, computeSideStats, estimatePerformanceRating } from './GameReport'
import { estimatePerformanceRatingFromInputs, type SideResult } from './gameRatingModel'
import {
  computeReviewAccuracyPenalty,
  computeReviewCalibratedAccuracy,
  REVIEW_CALIBRATION_COEFFICIENTS,
  type ReviewCalibrationCoefficients,
} from './reviewCalibration'

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

interface ReviewCalibrationFixture {
  label: string
  rawAccuracy: number
  rating: number
  opponentRating: number
  result: Exclude<SideResult, null>
  counts: Partial<Record<string, number>>
  chesscomAccuracy: number
  chesscomGameRating: number
}

const ROUGH_GAME_FIXTURES: ReviewCalibrationFixture[] = [
  {
    label: '168944079042 white',
    rawAccuracy: 85.0,
    rating: 1292,
    opponentRating: 1269,
    result: 'win',
    counts: { inaccuracy: 1, mistake: 3, miss: 1 },
    chesscomAccuracy: 72.8,
    chesscomGameRating: 1250,
  },
  {
    label: '168944079042 black',
    rawAccuracy: 78.8,
    rating: 1269,
    opponentRating: 1292,
    result: 'loss',
    counts: { inaccuracy: 4, mistake: 5, miss: 1 },
    chesscomAccuracy: 64.5,
    chesscomGameRating: 800,
  },
  {
    label: '168908632128 white',
    rawAccuracy: 79.0,
    rating: 1284,
    opponentRating: 1348,
    result: 'loss',
    counts: { inaccuracy: 5, mistake: 4, blunder: 2, miss: 1 },
    chesscomAccuracy: 69.9,
    chesscomGameRating: 1100,
  },
  {
    label: '168908632128 black',
    rawAccuracy: 82.1,
    rating: 1348,
    opponentRating: 1284,
    result: 'win',
    counts: { inaccuracy: 5, mistake: 1, miss: 3 },
    chesscomAccuracy: 75.4,
    chesscomGameRating: 1450,
  },
  {
    label: '168897408928 white',
    rawAccuracy: 53.9,
    rating: 1309,
    opponentRating: 1291,
    result: 'draw',
    counts: { inaccuracy: 2, mistake: 2, blunder: 3, miss: 3 },
    chesscomAccuracy: 51.4,
    chesscomGameRating: 550,
  },
  {
    label: '168897408928 black',
    rawAccuracy: 59.3,
    rating: 1291,
    opponentRating: 1309,
    result: 'draw',
    counts: { inaccuracy: 2, mistake: 2, blunder: 3, miss: 4 },
    chesscomAccuracy: 43.2,
    chesscomGameRating: 500,
  },
  {
    label: '168896908938 white',
    rawAccuracy: 76.8,
    rating: 1291,
    opponentRating: 1325,
    result: 'loss',
    counts: { inaccuracy: 4, mistake: 2, blunder: 1, miss: 2 },
    chesscomAccuracy: 60.7,
    chesscomGameRating: 750,
  },
  {
    label: '168896908938 black',
    rawAccuracy: 84.8,
    rating: 1325,
    opponentRating: 1291,
    result: 'win',
    counts: { inaccuracy: 2, mistake: 2, blunder: 1 },
    chesscomAccuracy: 73.6,
    chesscomGameRating: 1350,
  },
  {
    label: '168894861710 white',
    rawAccuracy: 70.2,
    rating: 1276,
    opponentRating: 1299,
    result: 'loss',
    counts: { inaccuracy: 5, mistake: 5, blunder: 2, miss: 2 },
    chesscomAccuracy: 48.7,
    chesscomGameRating: 550,
  },
  {
    label: '168894861710 black',
    rawAccuracy: 74.1,
    rating: 1299,
    opponentRating: 1276,
    result: 'win',
    counts: { inaccuracy: 5, mistake: 1, blunder: 2, miss: 3 },
    chesscomAccuracy: 59.0,
    chesscomGameRating: 700,
  },
  {
    label: '168773587574 white',
    rawAccuracy: 80.3,
    rating: 1295,
    opponentRating: 1291,
    result: 'loss',
    counts: { inaccuracy: 1, blunder: 2, miss: 1 },
    chesscomAccuracy: 69.1,
    chesscomGameRating: 750,
  },
  {
    label: '168773587574 black',
    rawAccuracy: 89.3,
    rating: 1291,
    opponentRating: 1295,
    result: 'win',
    counts: { inaccuracy: 1, mistake: 2, miss: 1 },
    chesscomAccuracy: 76.9,
    chesscomGameRating: 1500,
  },
]

const CLEAN_ANCHOR_FIXTURES: ReviewCalibrationFixture[] = [
  {
    label: 'Ace_S_04 white',
    rawAccuracy: 94.8,
    rating: 1278,
    opponentRating: 1304,
    result: 'loss',
    counts: {},
    chesscomAccuracy: 97.2,
    chesscomGameRating: 2100,
  },
  {
    label: 'Ace_S_04 black',
    rawAccuracy: 97.0,
    rating: 1304,
    opponentRating: 1278,
    result: 'win',
    counts: {},
    chesscomAccuracy: 99.0,
    chesscomGameRating: 2150,
  },
  {
    label: 'KingWald black',
    rawAccuracy: 98.0,
    rating: 1310,
    opponentRating: 1272,
    result: 'win',
    counts: {},
    chesscomAccuracy: 98.5,
    chesscomGameRating: 2100,
  },
  {
    label: 'Kevalan white',
    rawAccuracy: 96.1,
    rating: 903,
    opponentRating: 885,
    result: 'win',
    counts: { inaccuracy: 1 },
    chesscomAccuracy: 95.3,
    chesscomGameRating: 1700,
  },
]

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function evaluateCalibrationFixture(
  fixture: ReviewCalibrationFixture,
  coefficients: ReviewCalibrationCoefficients,
) {
  const calibratedAccuracy = computeReviewCalibratedAccuracy(
    fixture.rawAccuracy,
    fixture.counts,
    fixture.result,
    coefficients,
  )
  const calibratedGameRating = estimatePerformanceRatingFromInputs(
    calibratedAccuracy,
    fixture.rating,
    fixture.opponentRating,
    fixture.result,
  )
  const baselineGameRating = estimatePerformanceRatingFromInputs(
    fixture.rawAccuracy,
    fixture.rating,
    fixture.opponentRating,
    fixture.result,
  )

  return {
    ...fixture,
    calibratedAccuracy: calibratedAccuracy ?? 0,
    calibratedGameRating: calibratedGameRating ?? 0,
    baselineGameRating: baselineGameRating ?? 0,
    accuracyError: Math.abs((calibratedAccuracy ?? 0) - fixture.chesscomAccuracy),
    gameRatingError: Math.abs((calibratedGameRating ?? 0) - fixture.chesscomGameRating),
    accuracyDelta:
      Math.abs((calibratedAccuracy ?? 0) - fixture.chesscomAccuracy)
      - Math.abs(fixture.rawAccuracy - fixture.chesscomAccuracy),
    gameRatingDelta:
      Math.abs((calibratedGameRating ?? 0) - fixture.chesscomGameRating)
      - Math.abs((baselineGameRating ?? 0) - fixture.chesscomGameRating),
  }
}

function findFirstMatchingReviewCalibrationCoefficients() {
  const coefficientGrid = {
    inaccuracy: [0, 0.5, 1],
    mistake: [0.5, 1, 1.5, 2],
    blunder: [2, 3, 4],
    miss: [2, 3, 4],
    nonWin: [0, 1, 2],
  } as const

  const roughBaselineAccuracyError = average(
    ROUGH_GAME_FIXTURES.map(fixture => Math.abs(fixture.rawAccuracy - fixture.chesscomAccuracy)),
  )
  const roughBaselineGameRatingError = average(
    ROUGH_GAME_FIXTURES.map(fixture => {
      const baselineRating = estimatePerformanceRatingFromInputs(
        fixture.rawAccuracy,
        fixture.rating,
        fixture.opponentRating,
        fixture.result,
      )
      return Math.abs((baselineRating ?? 0) - fixture.chesscomGameRating)
    }),
  )

  for (const inaccuracy of coefficientGrid.inaccuracy) {
    for (const mistake of coefficientGrid.mistake) {
      for (const blunder of coefficientGrid.blunder) {
        for (const miss of coefficientGrid.miss) {
          for (const nonWin of coefficientGrid.nonWin) {
            const candidate: ReviewCalibrationCoefficients = {
              inaccuracy,
              mistake,
              blunder,
              miss,
              nonWin,
            }
            const roughEvaluation = ROUGH_GAME_FIXTURES.map(fixture => evaluateCalibrationFixture(fixture, candidate))
            const cleanEvaluation = CLEAN_ANCHOR_FIXTURES.map(fixture => evaluateCalibrationFixture(fixture, candidate))
            const roughAccuracyImprovement = roughBaselineAccuracyError - average(roughEvaluation.map(fixture => fixture.accuracyError))
            const roughGameRatingImprovement = roughBaselineGameRatingError - average(roughEvaluation.map(fixture => fixture.gameRatingError))
            const cleanAnchorsOk = cleanEvaluation.every(
              fixture => fixture.accuracyDelta <= 3 && fixture.gameRatingDelta <= 150,
            )

            if (roughAccuracyImprovement >= 5 && roughGameRatingImprovement >= 100 && cleanAnchorsOk) {
              return {
                coefficients: candidate,
                roughAccuracyImprovement,
                roughGameRatingImprovement,
                roughEvaluation,
                cleanEvaluation,
              }
            }
          }
        }
      }
    }
  }

  return null
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

  it('renders review-calibrated accuracy instead of raw engine accuracy', () => {
    const moveEvals: MoveEval[] = [
      makeEval(1, 'white', 40, 'mistake'),
      makeEval(2, 'white', -120, 'blunder'),
    ]
    const rawWhiteAccuracy = computeAccuracy(moveEvals, 'white')
    const whiteStats = computeSideStats(moveEvals, 'white')
    const calibratedWhiteAccuracy = computeReviewCalibratedAccuracy(rawWhiteAccuracy, whiteStats?.counts, 'loss')

    const { container } = render(
      <GameReport
        moveEvals={moveEvals}
        userColor="white"
        analysisComplete={true}
        whiteName="Alice"
        result="0-1"
        whiteElo="1500"
        blackElo="1400"
      />
    )

    expect(calibratedWhiteAccuracy).not.toBeNull()
    expect(calibratedWhiteAccuracy).toBeLessThan(rawWhiteAccuracy)
    expect(container.textContent).toContain(`${calibratedWhiteAccuracy?.toFixed(1)}%`)
  })
})

describe('review accuracy calibration', () => {
  it('keeps clean games unchanged or lightly adjusted', () => {
    expect(computeReviewAccuracyPenalty({}, 'win')).toBe(0)
    expect(computeReviewAccuracyPenalty({ inaccuracy: 1 }, 'win')).toBe(1)
    expect(computeReviewCalibratedAccuracy(96.1, { inaccuracy: 1 }, 'win')).toBe(95.1)
  })

  it('penalizes rough games with multiple misses and blunders', () => {
    const counts = { inaccuracy: 5, mistake: 5, blunder: 2, miss: 2 }
    expect(computeReviewAccuracyPenalty(counts, 'loss')).toBe(20)
    expect(computeReviewCalibratedAccuracy(70.2, counts, 'loss')).toBe(50.2)
  })

  it('caps the penalty at 20 and clamps calibrated accuracy into range', () => {
    const counts = { inaccuracy: 12, mistake: 8, blunder: 4, miss: 6 }
    expect(computeReviewAccuracyPenalty(counts, 'draw')).toBe(20)
    expect(computeReviewCalibratedAccuracy(15, counts, 'draw')).toBe(0)
    expect(computeReviewCalibratedAccuracy(105, {}, 'win')).toBe(100)
  })

  it('uses the first coefficient tuple that satisfies the regression thresholds', () => {
    const selection = findFirstMatchingReviewCalibrationCoefficients()

    expect(selection).not.toBeNull()
    expect(selection?.coefficients).toEqual(REVIEW_CALIBRATION_COEFFICIENTS)
    expect(selection?.roughAccuracyImprovement ?? 0).toBeGreaterThanOrEqual(5)
    expect(selection?.roughGameRatingImprovement ?? 0).toBeGreaterThanOrEqual(100)
    expect(selection?.cleanEvaluation.every(fixture => fixture.accuracyDelta <= 3)).toBe(true)
    expect(selection?.cleanEvaluation.every(fixture => fixture.gameRatingDelta <= 150)).toBe(true)
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
    const expectedWhiteAccuracy = computeReviewCalibratedAccuracy(91.2, whiteStats?.counts, 'win')
    const expectedBlackAccuracy = computeReviewCalibratedAccuracy(62.5, blackStats?.counts, 'loss')

    expect(snapshot.sourceUrl).toBe('https://www.chess.com/game/live/123')
    expect(snapshot.players.white.deepmoveAccuracy).toBe(expectedWhiteAccuracy)
    expect(snapshot.players.black.deepmoveAccuracy).toBe(expectedBlackAccuracy)
    expect(snapshot.players.white.deepmoveGameRating).toBe(
      estimatePerformanceRating(expectedWhiteAccuracy, '1500', '1400', 'win'),
    )
    expect(snapshot.players.black.deepmoveGameRating).toBe(
      estimatePerformanceRating(expectedBlackAccuracy, '1400', '1500', 'loss'),
    )
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
