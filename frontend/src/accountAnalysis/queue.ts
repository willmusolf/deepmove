import type { AnalyzedGameRecord } from '../services/gameDB'
import type { ScannedAccountGame } from './aggregate'

export function getCompleteAnalyzedGameIds(analyzedGames: AnalyzedGameRecord[]): Set<string> {
  return new Set(
    analyzedGames
      .filter(game => !game.partial)
      .map(game => game.id),
  )
}

function resultPriority(result: ScannedAccountGame['result']): number {
  if (result === 'L') return 0
  if (result === 'D') return 1
  return 2
}

export function getMissingAnalysisGames(
  scannedGames: ScannedAccountGame[],
  analyzedGames: AnalyzedGameRecord[],
): ScannedAccountGame[] {
  const completeIds = getCompleteAnalyzedGameIds(analyzedGames)
  return scannedGames
    .filter(game => !completeIds.has(game.gameId))
    .sort((a, b) => resultPriority(a.result) - resultPriority(b.result) || b.endTime - a.endTime)
}

export function selectAnalysisBatch(
  scannedGames: ScannedAccountGame[],
  analyzedGames: AnalyzedGameRecord[],
  limit: number | 'all' = 10,
): ScannedAccountGame[] {
  const missing = getMissingAnalysisGames(scannedGames, analyzedGames)
  if (limit === 'all') return missing
  return missing.slice(0, Math.max(0, Math.floor(limit)))
}
