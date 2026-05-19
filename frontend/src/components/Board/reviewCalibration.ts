import {
  clampGameRating,
  estimatePerformanceRatingFromInputs,
  roundToNearest50,
  type SideResult,
} from './gameRatingModel'

export interface ReviewCalibrationCoefficients {
  inaccuracy: number
  mistake: number
  blunder: number
  miss: number
  nonWin: number
}

export const REVIEW_CALIBRATION_COEFFICIENTS: ReviewCalibrationCoefficients = {
  inaccuracy: 0,
  mistake: 0.5,
  blunder: 2,
  miss: 2,
  nonWin: 0,
}

export const MAX_REVIEW_ACCURACY_PENALTY = 20
export const REVIEW_GAME_RATING_ROUGHNESS_THRESHOLD = 6

export type ReviewBadgeCounts = Partial<Record<string, number>> | null | undefined

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function readCount(counts: ReviewBadgeCounts, grade: string): number {
  const value = counts?.[grade]
  return typeof value === 'number' ? value : 0
}

export function computeReviewRoughness(counts: ReviewBadgeCounts): number {
  return readCount(counts, 'mistake') + readCount(counts, 'miss') + 2 * readCount(counts, 'blunder')
}

export function computeReviewAccuracyPenalty(
  counts: ReviewBadgeCounts,
  sideResult: SideResult,
  coefficients: ReviewCalibrationCoefficients = REVIEW_CALIBRATION_COEFFICIENTS,
): number {
  const nonWin = sideResult === 'win' ? 0 : 1
  const rawPenalty =
    coefficients.inaccuracy * readCount(counts, 'inaccuracy')
    + coefficients.mistake * readCount(counts, 'mistake')
    + coefficients.blunder * readCount(counts, 'blunder')
    + coefficients.miss * readCount(counts, 'miss')
    + coefficients.nonWin * nonWin

  return clamp(rawPenalty, 0, MAX_REVIEW_ACCURACY_PENALTY)
}

export function computeReviewCalibratedAccuracy(
  rawAccuracy: number | null,
  counts: ReviewBadgeCounts,
  sideResult: SideResult,
  coefficients: ReviewCalibrationCoefficients = REVIEW_CALIBRATION_COEFFICIENTS,
): number | null {
  if (rawAccuracy === null) return null

  const penalty = computeReviewAccuracyPenalty(counts, sideResult, coefficients)
  const calibrated = clamp(rawAccuracy - penalty, 0, 100)
  return Math.round(calibrated * 10) / 10
}

export function computeReviewGameRatingAdjustment(
  accuracy: number | null,
  counts: ReviewBadgeCounts,
): number {
  if (accuracy === null) return 0

  const roughness = computeReviewRoughness(counts)
  if (roughness < REVIEW_GAME_RATING_ROUGHNESS_THRESHOLD) return 0
  if (accuracy >= 40 && accuracy < 70) return -200
  if (accuracy >= 70 && accuracy < 80) return -100
  return 0
}

export function computeReviewCalibratedGameRating(
  accuracy: number | null,
  counts: ReviewBadgeCounts,
  playerRating: number | null,
  opponentRating: number | null,
  sideResult: SideResult,
): number | null {
  const baseRating = estimatePerformanceRatingFromInputs(
    accuracy,
    playerRating,
    opponentRating,
    sideResult,
  )
  if (baseRating === null) return null

  const adjustedRating = baseRating + computeReviewGameRatingAdjustment(accuracy, counts)
  return roundToNearest50(clampGameRating(adjustedRating))
}
