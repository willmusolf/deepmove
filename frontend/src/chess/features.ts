// features.ts — Master feature extraction orchestrator
// Takes ExtractionInput, runs all extractors, returns PositionFeatures
// Build order (see docs/feature-extraction.md):
//   1. material.ts
//   2. gamePhase.ts (inline here)
//   3. threats.ts   ← HIGHEST PRIORITY for sub-1400 coaching
//   4. pawnStructure.ts
//   5. kingSafety.ts
//   6. pieceActivity.ts
//   7. development.ts
//   8. moveImpact.ts
//   9. tactics.ts

import type { ExtractionInput, PositionFeatures } from './types'

export function extractFeatures(_input: ExtractionInput): PositionFeatures {
  // TODO (Track B, Session 5+): Implement all extractors
  // Each extractor lives in its own file and is imported here
  throw new Error('extractFeatures not yet implemented')
}
