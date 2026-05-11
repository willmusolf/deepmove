export type PerformanceTier = 'normal' | 'low-memory'

export interface EngineProfile {
  backgroundHashMB: number
  interactiveHashMB: number
  branchHashMB: number
}

export function detectPerformanceTier(): PerformanceTier {
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory
  if (mem !== undefined && mem <= 4) return 'low-memory'
  if (typeof window !== 'undefined' && window.innerWidth <= 768) return 'low-memory'
  return 'normal'
}

export function getEngineProfile(tier: PerformanceTier): EngineProfile {
  if (tier === 'low-memory') {
    return { backgroundHashMB: 32, interactiveHashMB: 16, branchHashMB: 8 }
  }
  return { backgroundHashMB: 64, interactiveHashMB: 24, branchHashMB: 16 }
}
