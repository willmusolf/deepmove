import type { AnalyzedGameRecord } from '../services/gameDB'
import type { ScannedAccountGame } from './aggregate'

export function getCompleteAnalyzedGameIds(analyzedGames: AnalyzedGameRecord[]): Set<string> {
  return new Set(
    analyzedGames
      .filter(game => !game.partial)
      .map(game => game.id),
  )
}

export function getMissingAnalysisGames(
  scannedGames: ScannedAccountGame[],
  analyzedGames: AnalyzedGameRecord[],
): ScannedAccountGame[] {
  const completeIds = getCompleteAnalyzedGameIds(analyzedGames)
  return scannedGames
    .filter(game => !completeIds.has(game.gameId))
    .sort((a, b) => b.endTime - a.endTime)
}

export function selectAnalysisBatch(
  scannedGames: ScannedAccountGame[],
  analyzedGames: AnalyzedGameRecord[],
  limit: number | 'all' = 25,
): ScannedAccountGame[] {
  const missing = getMissingAnalysisGames(scannedGames, analyzedGames)
  if (limit === 'all') return missing
  return missing.slice(0, Math.max(0, Math.floor(limit)))
}
