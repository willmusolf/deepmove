import { Chess } from 'chess.js'
import type { ChessComGame } from '../api/chesscom'
import type { LichessGame } from '../api/lichess'
import { cleanPgn } from '../chess/pgn'
import { CATEGORIES } from '../chess/taxonomy'
import type { MistakeCategory } from '../chess/types'
import { detectOpening } from '../chess/openings'
import { enrichCriticalMoments } from '../chess/features'
import type { AnalyzedGameRecord } from '../services/gameDB'
import {
  normalizeChessCom,
  normalizeLichess,
  type NormalizedGame,
} from '../components/Import/normalizeGame'

export type AccountAnalysisPlatform = 'all' | 'chesscom' | 'lichess'

export interface ScannedAccountGame extends NormalizedGame {
  platform: 'chesscom' | 'lichess'
  opening: string
}

export interface OpeningStats {
  opening: string
  color: 'white' | 'black'
  games: number
  wins: number
  losses: number
  draws: number
  scorePct: number
}

export interface WeaknessStats {
  category: MistakeCategory
  name: string
  shortLabel: string
  color: string
  count: number
}

export interface AccountAnalysisSummary {
  scannedGames: ScannedAccountGame[]
  requestedGameCount: number
  analyzedGameCount: number
  dateRange: { start: number | null; end: number | null }
  openingsByColor: {
    white: OpeningStats[]
    black: OpeningStats[]
  }
  weaknesses: WeaknessStats[]
  takeaways: string[]
}

interface BuildAccountAnalysisInput {
  chesscomGames?: ChessComGame[]
  chesscomUsername?: string
  lichessGames?: LichessGame[]
  lichessUsername?: string
  analyzedGames?: AnalyzedGameRecord[]
  gameCount: number
  platform?: AccountAnalysisPlatform
}

const MIN_RECURRING_OPENING_SAMPLE = 2

function clampGameCount(count: number): number {
  if (!Number.isFinite(count)) return 50
  return Math.max(10, Math.min(200, Math.floor(count)))
}

export function getOpeningFromPgn(pgn: string): string {
  try {
    const chess = new Chess()
    chess.loadPgn(cleanPgn(pgn))
    return detectOpening(chess.history().slice(0, 8)) ?? 'Unknown Opening'
  } catch {
    return 'Unknown Opening'
  }
}

function normalizeInputGames(input: BuildAccountAnalysisInput): ScannedAccountGame[] {
  const games: ScannedAccountGame[] = []
  const platform = input.platform ?? 'all'

  if (platform !== 'lichess' && input.chesscomUsername) {
    for (const game of input.chesscomGames ?? []) {
      const normalized = normalizeChessCom(game, input.chesscomUsername)
      games.push({
        ...normalized,
        platform: 'chesscom',
        opening: getOpeningFromPgn(normalized.pgn),
      })
    }
  }

  if (platform !== 'chesscom' && input.lichessUsername) {
    for (const game of input.lichessGames ?? []) {
      const normalized = normalizeLichess(game, input.lichessUsername)
      games.push({
        ...normalized,
        platform: 'lichess',
        opening: getOpeningFromPgn(normalized.pgn),
      })
    }
  }

  return games.sort((a, b) => b.endTime - a.endTime)
}

function scorePct(stats: Pick<OpeningStats, 'wins' | 'draws' | 'games'>): number {
  if (stats.games === 0) return 0
  return Math.round(((stats.wins + stats.draws * 0.5) / stats.games) * 1000) / 10
}

function buildOpeningStats(scannedGames: ScannedAccountGame[]): AccountAnalysisSummary['openingsByColor'] {
  const byKey = new Map<string, OpeningStats>()

  for (const game of scannedGames) {
    const color = game.isWhite ? 'white' : 'black'
    const key = `${color}:${game.opening}`
    const stats = byKey.get(key) ?? {
      opening: game.opening,
      color,
      games: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      scorePct: 0,
    }

    stats.games++
    if (game.result === 'W') stats.wins++
    else if (game.result === 'L') stats.losses++
    else stats.draws++
    stats.scorePct = scorePct(stats)
    byKey.set(key, stats)
  }

  const sorted = Array.from(byKey.values())
    .sort((a, b) => b.games - a.games || b.scorePct - a.scorePct || a.opening.localeCompare(b.opening))

  return {
    white: sorted.filter(opening => opening.color === 'white'),
    black: sorted.filter(opening => opening.color === 'black'),
  }
}

function getMomentCategory(record: AnalyzedGameRecord): MistakeCategory[] {
  const categories: MistakeCategory[] = []

  for (const moment of record.criticalMoments ?? []) {
    const category = moment.analysisFacts?.category
    if (category && CATEGORIES[category]) categories.push(category)
  }

  if (categories.length > 0 || record.criticalMoments.length === 0 || record.moveEvals.length === 0) {
    return categories
  }

  try {
    const enriched = enrichCriticalMoments(
      record.criticalMoments,
      record.moveEvals,
      record.cleanedPgn || record.rawPgn,
      record.userElo,
    )
    for (const moment of enriched) {
      const category = moment.analysisFacts?.category
      if (category && CATEGORIES[category]) categories.push(category)
    }
  } catch {
    return categories
  }

  return categories
}

function buildWeaknessStats(
  scannedGames: ScannedAccountGame[],
  analyzedGames: AnalyzedGameRecord[],
): { weaknesses: WeaknessStats[]; analyzedGameCount: number } {
  const scannedIds = new Set(scannedGames.map(game => game.gameId))
  const analyzedInScan = analyzedGames.filter(game => scannedIds.has(game.id) && !game.partial)
  const counts = new Map<MistakeCategory, number>()

  for (const record of analyzedInScan) {
    for (const category of getMomentCategory(record)) {
      counts.set(category, (counts.get(category) ?? 0) + 1)
    }
  }

  const weaknesses = Array.from(counts.entries())
    .map(([category, count]) => ({
      category,
      name: CATEGORIES[category].name,
      shortLabel: CATEGORIES[category].shortLabel,
      color: CATEGORIES[category].color,
      count,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

  return { weaknesses, analyzedGameCount: analyzedInScan.length }
}

function formatScore(stats: OpeningStats): string {
  return `${stats.wins}-${stats.losses}-${stats.draws}, ${stats.scorePct}% score`
}

function lowestRecurringOpening(openings: OpeningStats[]): OpeningStats | null {
  const recurring = openings.filter(opening => opening.games >= MIN_RECURRING_OPENING_SAMPLE)
  if (recurring.length === 0) return null
  return [...recurring].sort((a, b) => a.scorePct - b.scorePct || b.games - a.games)[0]
}

export function buildAccountTakeaways(
  summary: Pick<AccountAnalysisSummary, 'openingsByColor' | 'weaknesses' | 'analyzedGameCount' | 'scannedGames'>,
): string[] {
  const takeaways: string[] = []
  const weakestWhite = lowestRecurringOpening(summary.openingsByColor.white)
  const weakestBlack = lowestRecurringOpening(summary.openingsByColor.black)

  if (weakestWhite) {
    takeaways.push(`As White, your lowest-scoring repeated opening is ${weakestWhite.opening} (${formatScore(weakestWhite)}). Review the first middlegame plan you usually reach from it.`)
  }
  if (weakestBlack) {
    takeaways.push(`As Black, ${weakestBlack.opening} is the repeated line giving you the most trouble (${formatScore(weakestBlack)}). Look for one simple setup improvement instead of memorizing a full tree.`)
  }

  const topWeakness = summary.weaknesses[0]
  if (topWeakness) {
    takeaways.push(`Your most common reviewed mistake category is ${topWeakness.name}. Before moving, add one quick check for that theme in every critical position.`)
  } else if (summary.scannedGames.length > 0) {
    takeaways.push('Opening stats are ready, but weakness takeaways need more DeepMove-reviewed games in this recent set.')
  }

  const whiteGames = summary.scannedGames.filter(game => game.isWhite)
  const blackGames = summary.scannedGames.filter(game => !game.isWhite)
  const whiteScore = scorePct({
    games: whiteGames.length,
    wins: whiteGames.filter(game => game.result === 'W').length,
    draws: whiteGames.filter(game => game.result === 'D').length,
  })
  const blackScore = scorePct({
    games: blackGames.length,
    wins: blackGames.filter(game => game.result === 'W').length,
    draws: blackGames.filter(game => game.result === 'D').length,
  })

  if (whiteGames.length >= 5 && blackGames.length >= 5 && Math.abs(whiteScore - blackScore) >= 15) {
    const stronger = whiteScore > blackScore ? 'White' : 'Black'
    const weaker = whiteScore > blackScore ? 'Black' : 'White'
    takeaways.push(`${stronger} is scoring much better than ${weaker} in this sample. Give your ${weaker} repertoire one focused review session first.`)
  }

  if (takeaways.length === 0) {
    takeaways.push('Load recent games from Chess.com or Lichess to generate opening stats and improvement takeaways.')
  }

  return takeaways.slice(0, 4)
}

export function buildAccountAnalysis(input: BuildAccountAnalysisInput): AccountAnalysisSummary {
  const requestedGameCount = clampGameCount(input.gameCount)
  const scannedGames = normalizeInputGames(input).slice(0, requestedGameCount)
  const openingsByColor = buildOpeningStats(scannedGames)
  const { weaknesses, analyzedGameCount } = buildWeaknessStats(scannedGames, input.analyzedGames ?? [])
  const times = scannedGames.map(game => game.endTime).filter(time => time > 0)
  const withoutTakeaways = {
    scannedGames,
    requestedGameCount,
    analyzedGameCount,
    dateRange: {
      start: times.length > 0 ? Math.min(...times) : null,
      end: times.length > 0 ? Math.max(...times) : null,
    },
    openingsByColor,
    weaknesses,
  }

  return {
    ...withoutTakeaways,
    takeaways: buildAccountTakeaways(withoutTakeaways),
  }
}
