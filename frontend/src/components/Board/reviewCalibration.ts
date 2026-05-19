import type { SideResult } from './gameRatingModel'

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

export type ReviewBadgeCounts = Partial<Record<string, number>> | null | undefined

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function readCount(counts: ReviewBadgeCounts, grade: string): number {
  const value = counts?.[grade]
  return typeof value === 'number' ? value : 0
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
