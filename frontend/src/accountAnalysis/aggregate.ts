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

export interface AccountInsight {
  kind: 'building' | 'weakness' | 'opening' | 'color' | 'watchlist' | 'strength'
  title: string
  evidence: string
  action: string
}

export interface AccountAnalysisEvidenceMoment {
  category: MistakeCategory
  gameId: string
  platform: 'chesscom' | 'lichess'
  opponent: string
  opponentRating: number
  result: 'W' | 'L' | 'D'
  color: 'white' | 'black'
  opening: string
  moveNumber: number
  movePlayed: string
  evalSwing: number
  timeControl: string
  endTime: number
}

export interface AccountCoachBrief {
  kind: AccountInsight['kind']
  title: string
  finding: string
  evidence: string
  whyItMatters: string
  nextAction: string
  confidenceLabel: string
  primaryCategory: MistakeCategory | null
  exampleMoments: AccountAnalysisEvidenceMoment[]
}

export interface AccountAnalysisSummary {
  scannedGames: ScannedAccountGame[]
  requestedGameCount: number
  analyzedGameCount: number
  weaknessCoveragePct: number
  weaknessConfidence: 'none' | 'low' | 'medium' | 'high'
  dateRange: { start: number | null; end: number | null }
  openingsByColor: {
    white: OpeningStats[]
    black: OpeningStats[]
  }
  weaknesses: WeaknessStats[]
  takeaways: string[]
  topInsights: AccountInsight[]
  coachBrief: AccountCoachBrief
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

const MIN_RECURRING_OPENING_SAMPLE = 5
const MIN_WATCHLIST_OPENING_SAMPLE = 2
const OPENING_TAKEAWAY_VISIBLE_LIMIT = 6
const MIN_STRONG_INSIGHT_GAMES = 10
const OPENING_TROUBLE_SCORE_MAX = 45
const OPENING_STRENGTH_SCORE_MIN = 65
const CATEGORY_PRIORITY: Record<MistakeCategory, number> = {
  missed_tactic: 6,
  hung_piece: 5,
  ignored_threat: 4,
  didnt_develop: 3,
  didnt_castle: 3,
  aimless_move: 2,
  unknown: 0,
}

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

function getCategorizedMoments(record: AnalyzedGameRecord): { category: MistakeCategory; moment: AnalyzedGameRecord['criticalMoments'][number] }[] {
  const categorized: { category: MistakeCategory; moment: AnalyzedGameRecord['criticalMoments'][number] }[] = []

  for (const moment of record.criticalMoments ?? []) {
    const category = moment.analysisFacts?.category
    if (category && CATEGORIES[category]) categorized.push({ category, moment })
  }

  if (categorized.length > 0 || record.criticalMoments.length === 0 || record.moveEvals.length === 0) {
    return categorized
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
      if (category && CATEGORIES[category]) categorized.push({ category, moment })
    }
  } catch {
    return categorized
  }

  return categorized
}

function buildWeaknessStats(
  scannedGames: ScannedAccountGame[],
  analyzedGames: AnalyzedGameRecord[],
): { weaknesses: WeaknessStats[]; analyzedGameCount: number; evidenceMoments: AccountAnalysisEvidenceMoment[] } {
  const scannedIds = new Set(scannedGames.map(game => game.gameId))
  const scannedById = new Map(scannedGames.map(game => [game.gameId, game]))
  const analyzedInScan = analyzedGames.filter(game => scannedIds.has(game.id) && !game.partial)
  const counts = new Map<MistakeCategory, number>()
  const evidenceMoments: AccountAnalysisEvidenceMoment[] = []

  for (const record of analyzedInScan) {
    const scanned = scannedById.get(record.id)
    for (const { category, moment } of getCategorizedMoments(record)) {
      counts.set(category, (counts.get(category) ?? 0) + 1)
      evidenceMoments.push({
        category,
        gameId: record.id,
        platform: record.platform === 'lichess' ? 'lichess' : 'chesscom',
        opponent: record.opponent,
        opponentRating: record.opponentRating,
        result: record.result,
        color: record.userColor ?? (scanned?.isWhite ? 'white' : 'black'),
        opening: scanned?.opening ?? getOpeningFromPgn(record.cleanedPgn || record.rawPgn),
        moveNumber: moment.moveNumber,
        movePlayed: moment.movePlayed,
        evalSwing: Math.round(Math.abs(moment.evalSwing)),
        timeControl: record.timeControl,
        endTime: record.endTime,
      })
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

  evidenceMoments.sort((a, b) => b.evalSwing - a.evalSwing || b.endTime - a.endTime)
  return { weaknesses, analyzedGameCount: analyzedInScan.length, evidenceMoments }
}

function getWeaknessConfidence(analyzedGameCount: number, scannedGameCount: number): AccountAnalysisSummary['weaknessConfidence'] {
  if (scannedGameCount === 0 || analyzedGameCount === 0) return 'none'
  const pct = analyzedGameCount / scannedGameCount
  if (pct < 0.25) return 'low'
  if (pct < 0.65) return 'medium'
  return 'high'
}

function formatScore(stats: OpeningStats): string {
  return `${stats.wins}-${stats.losses}-${stats.draws}, ${stats.scorePct}% score`
}

function preferredWeakness(weaknesses: WeaknessStats[]): WeaknessStats | undefined {
  const specific = weaknesses.filter(weakness => weakness.category !== 'unknown')
  if (specific.length === 0) return weaknesses[0]

  return [...specific].sort((a, b) => {
    const countGap = b.count - a.count
    if (Math.abs(countGap) > 2) return countGap
    return CATEGORY_PRIORITY[b.category] - CATEGORY_PRIORITY[a.category] || countGap || a.name.localeCompare(b.name)
  })[0]
}

function lowestRecurringOpening(openings: OpeningStats[]): OpeningStats | null {
  const recurring = openings.filter(opening =>
    opening.games >= MIN_RECURRING_OPENING_SAMPLE && opening.scorePct <= OPENING_TROUBLE_SCORE_MAX
  )
  if (recurring.length === 0) return null
  return [...recurring].sort((a, b) => a.scorePct - b.scorePct || b.games - a.games)[0]
}

function lowestWatchlistOpening(openings: OpeningStats[]): OpeningStats | null {
  const watchlist = openings.filter(opening =>
    opening.games >= MIN_WATCHLIST_OPENING_SAMPLE &&
    opening.games < MIN_RECURRING_OPENING_SAMPLE &&
    opening.scorePct <= 55
  )
  if (watchlist.length === 0) return null
  return [...watchlist].sort((a, b) => a.scorePct - b.scorePct || b.games - a.games)[0]
}

export function buildAccountTakeaways(
  summary: Pick<AccountAnalysisSummary, 'openingsByColor' | 'weaknesses' | 'analyzedGameCount' | 'scannedGames'>,
): string[] {
  const takeaways: string[] = []
  const visibleWhite = summary.openingsByColor.white.slice(0, OPENING_TAKEAWAY_VISIBLE_LIMIT)
  const visibleBlack = summary.openingsByColor.black.slice(0, OPENING_TAKEAWAY_VISIBLE_LIMIT)
  const weakestWhite = lowestRecurringOpening(visibleWhite)
  const weakestBlack = lowestRecurringOpening(visibleBlack)

  if (weakestWhite) {
    takeaways.push(`Among your most-played White openings, ${weakestWhite.opening} is the repeated line scoring lowest (${formatScore(weakestWhite)}). Review the first middlegame plan you usually reach from it.`)
  }
  if (weakestBlack) {
    takeaways.push(`Among your most-played Black openings, ${weakestBlack.opening} is the repeated line scoring lowest (${formatScore(weakestBlack)}). Look for one simple setup improvement instead of memorizing a full tree.`)
  }

  if (!weakestWhite) {
    const watchlistWhite = lowestWatchlistOpening(visibleWhite)
    if (watchlistWhite) {
      takeaways.push(`White watchlist: ${watchlistWhite.opening} is only ${watchlistWhite.games} games, so treat the ${watchlistWhite.scorePct}% score as a signal to monitor, not a conclusion yet.`)
    }
  }
  if (!weakestBlack) {
    const watchlistBlack = lowestWatchlistOpening(visibleBlack)
    if (watchlistBlack) {
      takeaways.push(`Black watchlist: ${watchlistBlack.opening} is only ${watchlistBlack.games} games, so treat the ${watchlistBlack.scorePct}% score as a signal to monitor, not a conclusion yet.`)
    }
  }

  const topWeakness = preferredWeakness(summary.weaknesses)
  if (topWeakness) {
    if (topWeakness.category === 'unknown') {
      takeaways.push('Your reviewed mistakes are still too mixed to name one precise theme. Analyze more games so DeepMove can separate tactical, opening, and planning patterns.')
    } else {
      takeaways.push(`Your most common reviewed mistake category is ${topWeakness.name}. Before moving, add one quick check for that theme in every critical position.`)
    }
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

function buildTopInsights(
  summary: Pick<AccountAnalysisSummary, 'openingsByColor' | 'weaknesses' | 'analyzedGameCount' | 'scannedGames'>,
): AccountInsight[] {
  if (summary.scannedGames.length === 0) {
    return [{
      kind: 'building',
      title: 'Connect an account to build Insights',
      evidence: 'No recent games have been loaded yet.',
      action: 'Link Chess.com or Lichess, then analyze recent games.',
    }]
  }

  if (summary.analyzedGameCount < MIN_STRONG_INSIGHT_GAMES) {
    return [{
      kind: 'building',
      title: 'Still building confidence',
      evidence: `${summary.analyzedGameCount} games analyzed. DeepMove needs at least ${MIN_STRONG_INSIGHT_GAMES} reviewed games before making strong claims.`,
      action: 'Analyze the selected games to unlock reliable weakness and opening patterns.',
    }]
  }

  const insights: AccountInsight[] = []
  const topWeakness = preferredWeakness(summary.weaknesses)
  if (topWeakness) {
    if (topWeakness.category === 'unknown') {
      insights.push({
        kind: 'weakness',
        title: 'The mistakes are still mixed',
        evidence: `${topWeakness.count} general critical moment${topWeakness.count === 1 ? '' : 's'} across ${summary.analyzedGameCount} analyzed games.`,
        action: 'Analyze more games or review the largest evaluation swings first; DeepMove will get more specific as patterns repeat.',
      })
    } else {
      insights.push({
        kind: 'weakness',
        title: `${topWeakness.name} keeps showing up`,
        evidence: `${topWeakness.count} critical moment${topWeakness.count === 1 ? '' : 's'} across ${summary.analyzedGameCount} analyzed games.`,
        action: `Before committing to a move, pause for one ${topWeakness.shortLabel.toLowerCase()} check.`,
      })
    }
  }

  const visibleOpenings = [
    ...summary.openingsByColor.white.slice(0, OPENING_TAKEAWAY_VISIBLE_LIMIT),
    ...summary.openingsByColor.black.slice(0, OPENING_TAKEAWAY_VISIBLE_LIMIT),
  ]
  const troubleOpening = visibleOpenings
    .filter(opening => opening.games >= MIN_RECURRING_OPENING_SAMPLE && opening.scorePct <= OPENING_TROUBLE_SCORE_MAX)
    .sort((a, b) => a.scorePct - b.scorePct || b.games - a.games)[0]
  if (troubleOpening) {
    insights.push({
      kind: 'opening',
      title: `${troubleOpening.opening} needs attention as ${troubleOpening.color}`,
      evidence: `${formatScore(troubleOpening)} over ${troubleOpening.games} games.`,
      action: 'Review one simple setup and the first middlegame plan from this opening.',
    })
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
  if (whiteGames.length >= 10 && blackGames.length >= 10 && Math.abs(whiteScore - blackScore) >= 15) {
    const weaker = whiteScore < blackScore ? 'White' : 'Black'
    const weakerScore = Math.min(whiteScore, blackScore)
    const strongerScore = Math.max(whiteScore, blackScore)
    insights.push({
      kind: 'color',
      title: `${weaker} is lagging behind`,
      evidence: `${weaker} is scoring ${weakerScore}% vs ${strongerScore}% with the other color in this sample.`,
      action: `Give your ${weaker} repertoire the next focused review session.`,
    })
  }

  if (insights.length < 3) {
    const strength = visibleOpenings
      .filter(opening => opening.games >= MIN_RECURRING_OPENING_SAMPLE && opening.scorePct >= OPENING_STRENGTH_SCORE_MIN)
      .sort((a, b) => b.scorePct - a.scorePct || b.games - a.games)[0]
    if (strength) {
      insights.push({
        kind: 'strength',
        title: `${strength.opening} is working`,
        evidence: `${formatScore(strength)} over ${strength.games} games as ${strength.color}.`,
        action: 'Keep this setup stable and spend study time on weaker repeated lines first.',
      })
    }
  }

  if (insights.length < 3) {
    const watchlist = visibleOpenings
      .filter(opening => opening.games >= MIN_WATCHLIST_OPENING_SAMPLE && opening.games < MIN_RECURRING_OPENING_SAMPLE)
      .sort((a, b) => a.scorePct - b.scorePct || b.games - a.games)[0]
    if (watchlist) {
      insights.push({
        kind: 'watchlist',
        title: `${watchlist.opening} is a watchlist line`,
        evidence: `${watchlist.games} games is not enough for a verdict yet.`,
        action: 'Keep an eye on this line, but do not overreact until it reaches 5+ games.',
      })
    }
  }

  if (insights.length === 0) {
    insights.push({
      kind: 'building',
      title: 'No sharp pattern yet',
      evidence: `${summary.analyzedGameCount} games analyzed without one dominant recurring issue.`,
      action: 'Analyze another batch to improve the signal.',
    })
  }

  return insights.slice(0, 3)
}

function sampleConfidenceLabel(analyzedGameCount: number, scannedGameCount: number): string {
  if (scannedGameCount === 0 || analyzedGameCount === 0) return 'No engine-reviewed games yet'
  if (analyzedGameCount < MIN_STRONG_INSIGHT_GAMES) return 'Building sample'
  if (analyzedGameCount < 50) return 'Recent sample'
  return 'Broader sample'
}

function categoryCoachCopy(category: MistakeCategory): Pick<AccountCoachBrief, 'finding' | 'whyItMatters' | 'nextAction'> {
  switch (category) {
    case 'missed_tactic':
      return {
        finding: 'Forcing moves are getting missed in critical positions.',
        whyItMatters: 'These are the swings where a check, capture, or threat changes the whole position. Missing them makes good positions feel random.',
        nextAction: 'Open the evidence games and pause before the marked move. List checks, captures, and threats for both sides before looking at the engine line.',
      }
    case 'hung_piece':
      return {
        finding: 'Loose pieces are turning normal positions into costly moments.',
        whyItMatters: 'A single undefended piece can erase several good moves. This is one of the fastest patterns to improve because the habit is simple and repeatable.',
        nextAction: 'Open each evidence game and ask: what became undefended after my move, and what was that piece protecting before it moved?',
      }
    case 'ignored_threat':
      return {
        finding: "Opponent threats are slipping through before your plan is ready.",
        whyItMatters: "Most plans fail because the opponent's last move had a concrete point. Catching that one threat often prevents the whole position from collapsing.",
        nextAction: "Open the evidence games and name the opponent's threat before checking DeepMove's best line.",
      }
    case 'aimless_move':
      return {
        finding: 'Quiet moves are showing up without a clear job.',
        whyItMatters: 'When a move does not improve a piece, stop a threat, or create pressure, the opponent gets a free tempo to take over the position.',
        nextAction: 'Open the evidence games and write one sentence for what the move was trying to do. If that sentence is vague, find the worst-placed piece instead.',
      }
    case 'didnt_develop':
      return {
        finding: 'Development is being delayed in games where the position opens up.',
        whyItMatters: 'Undeveloped pieces make tactics harder to see and defenses harder to coordinate. The opening does not need memorization as much as piece activity.',
        nextAction: 'Open the evidence games and count undeveloped minor pieces before the marked move. Look for the simplest developing move that also meets a threat.',
      }
    case 'didnt_castle':
      return {
        finding: 'King safety is waiting too long in some openings.',
        whyItMatters: 'An uncastled king turns normal central tension into tactics for your opponent. Castling often removes several problems at once.',
        nextAction: 'Open the evidence games and check whether castling was still possible before the position became tactical.',
      }
    default:
      return {
        finding: 'DeepMove found critical moments, but not a clean theme yet.',
        whyItMatters: 'A coachable pattern needs repeated specific mistakes, not just a pile of engine swings. This usually clears up as more games are reviewed.',
        nextAction: 'Open the largest swings first and look for what the move missed: a loose piece, a threat, or a forcing move.',
      }
  }
}

function buildCoachBrief(
  summary: Pick<AccountAnalysisSummary, 'openingsByColor' | 'weaknesses' | 'analyzedGameCount' | 'scannedGames'>,
  evidenceMoments: AccountAnalysisEvidenceMoment[],
): AccountCoachBrief {
  const confidenceLabel = sampleConfidenceLabel(summary.analyzedGameCount, summary.scannedGames.length)

  if (summary.scannedGames.length === 0) {
    return {
      kind: 'building',
      title: 'Connect an account to build Insights',
      finding: 'DeepMove needs recent Chess.com or Lichess games before it can spot patterns.',
      evidence: 'No recent games have been loaded yet.',
      whyItMatters: 'The useful report comes from your real games, not generic advice.',
      nextAction: 'Link an account, then analyze your selected recent games.',
      confidenceLabel,
      primaryCategory: null,
      exampleMoments: [],
    }
  }

  if (summary.analyzedGameCount < MIN_STRONG_INSIGHT_GAMES) {
    return {
      kind: 'building',
      title: 'Still building the first coach brief',
      finding: 'There are not enough engine-reviewed games yet to call a pattern.',
      evidence: `${summary.analyzedGameCount} of ${summary.scannedGames.length} selected games have completed analysis.`,
      whyItMatters: 'A few games can be noisy. Ten reviewed games is the minimum before DeepMove makes a strong claim.',
      nextAction: 'Finish analyzing the selected games, then review the first repeated theme here.',
      confidenceLabel,
      primaryCategory: null,
      exampleMoments: [],
    }
  }

  const topWeakness = preferredWeakness(summary.weaknesses)
  if (topWeakness) {
    const copy = categoryCoachCopy(topWeakness.category)
    const exampleMoments = evidenceMoments
      .filter(moment => moment.category === topWeakness.category)
      .slice(0, 3)
    const isSpecific = topWeakness.category !== 'unknown'
    return {
      kind: 'weakness',
      title: isSpecific ? `${topWeakness.name} is the review focus` : 'Critical moments need a clearer label',
      finding: copy.finding,
      evidence: isSpecific
        ? `${topWeakness.count} ${topWeakness.name.toLowerCase()} moment${topWeakness.count === 1 ? '' : 's'} across ${summary.analyzedGameCount} analyzed games.`
        : `${topWeakness.count} uncategorized critical moment${topWeakness.count === 1 ? '' : 's'} across ${summary.analyzedGameCount} analyzed games.`,
      whyItMatters: copy.whyItMatters,
      nextAction: copy.nextAction,
      confidenceLabel,
      primaryCategory: topWeakness.category,
      exampleMoments,
    }
  }

  const visibleOpenings = [
    ...summary.openingsByColor.white.slice(0, OPENING_TAKEAWAY_VISIBLE_LIMIT),
    ...summary.openingsByColor.black.slice(0, OPENING_TAKEAWAY_VISIBLE_LIMIT),
  ]
  const troubleOpening = visibleOpenings
    .filter(opening => opening.games >= MIN_RECURRING_OPENING_SAMPLE && opening.scorePct <= OPENING_TROUBLE_SCORE_MAX)
    .sort((a, b) => a.scorePct - b.scorePct || b.games - a.games)[0]

  if (troubleOpening) {
    return {
      kind: 'opening',
      title: `${troubleOpening.opening} is the line to review`,
      finding: `Your results in this repeated ${troubleOpening.color} opening are lagging behind the rest of the sample.`,
      evidence: `${formatScore(troubleOpening)} over ${troubleOpening.games} games.`,
      whyItMatters: 'Opening results are not engine-reviewed mistakes, but they can point to positions where you keep reaching uncomfortable middlegames.',
      nextAction: 'Review the first middlegame plan from this opening. Keep it to one setup improvement, not a full repertoire rebuild.',
      confidenceLabel,
      primaryCategory: null,
      exampleMoments: [],
    }
  }

  return {
    kind: 'building',
    title: 'No sharp pattern yet',
    finding: 'The selected games do not have one repeated mistake theme strong enough to lead with.',
    evidence: `${summary.analyzedGameCount} games analyzed without one dominant engine-reviewed issue.`,
    whyItMatters: 'That is useful too: it means the next batch may matter more than overreacting to a small cluster.',
    nextAction: 'Analyze another recent batch or open the largest individual swings in Review.',
    confidenceLabel,
    primaryCategory: null,
    exampleMoments: [],
  }
}

export function buildAccountAnalysis(input: BuildAccountAnalysisInput): AccountAnalysisSummary {
  const requestedGameCount = clampGameCount(input.gameCount)
  const scannedGames = normalizeInputGames(input).slice(0, requestedGameCount)
  const openingsByColor = buildOpeningStats(scannedGames)
  const { weaknesses, analyzedGameCount, evidenceMoments } = buildWeaknessStats(scannedGames, input.analyzedGames ?? [])
  const weaknessCoveragePct = scannedGames.length === 0
    ? 0
    : Math.round((analyzedGameCount / scannedGames.length) * 1000) / 10
  const times = scannedGames.map(game => game.endTime).filter(time => time > 0)
  const withoutTakeaways = {
    scannedGames,
    requestedGameCount,
    analyzedGameCount,
    weaknessCoveragePct,
    weaknessConfidence: getWeaknessConfidence(analyzedGameCount, scannedGames.length),
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
    topInsights: buildTopInsights(withoutTakeaways),
    coachBrief: buildCoachBrief(withoutTakeaways, evidenceMoments),
  }
}
