export type SideResult = 'win' | 'loss' | 'draw' | null

export interface GameRatingCoefficients {
  intercept: number
  playerRating: number
  opponentRating: number
  accuracy: number
  result: number
}

export const GAME_RATING_COEFFICIENTS: GameRatingCoefficients = {
  intercept: -882.5723237191321,
  playerRating: 0.24745005723602778,
  opponentRating: 0.5182541146289803,
  accuracy: 16.323688434433915,
  result: 185.62111279428248,
}

export function roundToNearest50(value: number): number {
  return Math.round(value / 50) * 50
}

export function clampGameRating(value: number): number {
  return Math.max(100, Math.min(3200, value))
}

export function resultToFeatureValue(sideResult: SideResult): number {
  if (sideResult === 'win') return 1
  if (sideResult === 'loss') return -1
  return 0
}

export function parseRating(rating: string | null | undefined): number | null {
  if (!rating) return null
  const parsed = parseInt(rating.replace(/[^\d]/g, ''), 10)
  return Number.isFinite(parsed) ? parsed : null
}

export function estimatePerformanceRatingFromInputs(
  accuracy: number | null,
  playerRating: number | null,
  opponentRating: number | null,
  sideResult: SideResult,
  coefficients: GameRatingCoefficients = GAME_RATING_COEFFICIENTS,
): number | null {
  if (accuracy === null || playerRating === null || opponentRating === null) return null

  const rawEstimate =
    coefficients.intercept
    + coefficients.playerRating * playerRating
    + coefficients.opponentRating * opponentRating
    + coefficients.accuracy * accuracy
    + coefficients.result * resultToFeatureValue(sideResult)

  return roundToNearest50(clampGameRating(rawEstimate))
}
