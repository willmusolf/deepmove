// eloConfig.ts — Elo-specific thresholds, priorities, and language tuning

export const ELO_BANDS = {
  BEGINNER:      { min: 0,    max: 800  },
  NOVICE:        { min: 800,  max: 1200 },
  INTERMEDIATE:  { min: 1200, max: 1400 },
  CLUB:          { min: 1400, max: 1600 },
  ADVANCED:      { min: 1600, max: 1800 },
  EXPERT:        { min: 1800, max: 9999 },
} as const

// Minimum eval swing (centipawns) to flag as a critical moment
export function getCriticalMomentThreshold(elo: number): number {
  if (elo < 1200) return 150  // Only big blunders — below 1200: >1.5 pawns
  if (elo < 1600) return 100  // 1200-1600: >1.0 pawns
  return 60                   // 1600+: >0.6 pawns (subtler errors matter)
}

export function getEloBand(elo: number): keyof typeof ELO_BANDS {
  if (elo < 800)  return 'BEGINNER'
  if (elo < 1200) return 'NOVICE'
  if (elo < 1400) return 'INTERMEDIATE'
  if (elo < 1600) return 'CLUB'
  if (elo < 1800) return 'ADVANCED'
  return 'EXPERT'
}

// Cache key band labels (for LLM response caching)
export function getCacheBand(elo: number): string {
  if (elo < 800)  return '0-800'
  if (elo < 1200) return '800-1200'
  if (elo < 1400) return '1200-1400'
  if (elo < 1600) return '1400-1600'
  if (elo < 1800) return '1600-1800'
  return '1800+'
}

// Time control classification
export function classifyTimeControl(seconds: number): 'bullet' | 'blitz' | 'rapid' | 'classical' {
  if (seconds < 180)  return 'bullet'
  if (seconds < 600)  return 'blitz'
  if (seconds < 1800) return 'rapid'
  return 'classical'
}
