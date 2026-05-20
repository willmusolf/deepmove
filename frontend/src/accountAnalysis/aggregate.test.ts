import { describe, expect, it } from 'vitest'
import type { ChessComGame } from '../api/chesscom'
import type { LichessGame } from '../api/lichess'
import type { MistakeCategory } from '../chess/types'
import type { AnalyzedGameRecord } from '../services/gameDB'
import { buildAccountAnalysis, getOpeningFromPgn } from './aggregate'

const ITALIAN_PGN = '[White "me"][Black "them"][Result "1-0"] 1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 1-0'
const SICILIAN_PGN = '[White "them"][Black "me"][Result "0-1"] 1. e4 c5 2. Nf3 d6 3. d4 cxd4 0-1'
const FRENCH_PGN = '[White "me"][Black "them"][Result "0-1"] 1. e4 e6 2. d4 d5 3. Nc3 Nf6 0-1'
const LONDON_PGN = '[White "lichessMe"][Black "rival"][Result "1/2-1/2"] 1. d4 d5 2. Nf3 Nf6 3. Bf4 e6 1/2-1/2'

function chesscomGame(
  id: string,
  pgn: string,
  endTime: number,
  white: string,
  black: string,
  whiteResult: string,
  blackResult: string,
): ChessComGame {
  return {
    url: `https://www.chess.com/game/live/${id}`,
    pgn,
    time_control: '600',
    end_time: endTime,
    rated: true,
    white: { username: white, rating: 1200, result: whiteResult },
    black: { username: black, rating: 1210, result: blackResult },
  }
}

function lichessGame(
  id: string,
  pgn: string,
  createdAt: number,
  winner: 'white' | 'black' | null,
): LichessGame {
  return {
    id,
    rated: true,
    variant: 'standard',
    speed: 'rapid',
    perf: 'rapid',
    createdAt,
    lastMoveAt: createdAt,
    status: winner ? 'mate' : 'draw',
    players: {
      white: { user: { name: 'lichessMe' }, rating: 1400 },
      black: { user: { name: 'rival' }, rating: 1410 },
    },
    pgn,
    clock: { initial: 600, increment: 0 },
    winner,
  } as LichessGame
}

function analyzedRecord(
  id: string,
  category: MistakeCategory,
  partial = false,
  options: { moveNumber?: number; movePlayed?: string; evalSwing?: number } = {},
): AnalyzedGameRecord {
  return {
    id,
    username: id.startsWith('lichess:') ? 'lichessme' : 'me',
    platform: id.startsWith('lichess:') ? 'lichess' : 'chesscom',
    rawPgn: ITALIAN_PGN,
    cleanedPgn: ITALIAN_PGN,
    userColor: 'white',
    userElo: 1200,
    moveEvals: [],
    criticalMoments: [{
      moveNumber: options.moveNumber ?? 4,
      color: 'white',
      fen: '',
      fenAfter: '',
      movePlayed: options.movePlayed ?? 'Bc4',
      engineBest: [],
      evalBefore: 0,
      evalAfter: -200,
      evalSwing: options.evalSwing ?? 200,
      features: {} as AnalyzedGameRecord['criticalMoments'][number]['features'],
      classification: null,
      analysisFacts: {
        category,
        categoryName: category,
        mistakeType: 'tactical',
        primaryIssue: '',
        moveEffect: '',
        missedResponsibility: '',
        betterIdea: '',
        consequence: '',
        factList: [],
      },
    }],
    analyzedAt: 1,
    opponent: 'them',
    opponentRating: 1200,
    result: 'L',
    timeControl: '10 min',
    endTime: 1,
    backendGameId: null,
    partial,
  }
}

function analyzedRecordWithoutMoments(id: string): AnalyzedGameRecord {
  return {
    ...analyzedRecord(id, 'unknown'),
    criticalMoments: [],
  }
}

describe('account analysis aggregation', () => {
  it('detects openings from PGN using the shared opening table', () => {
    expect(getOpeningFromPgn(ITALIAN_PGN)).toBe('Italian Game: Giuoco Piano')
  })

  it('sorts by recency, respects requested N, and combines platforms', () => {
    const olderChessComGames = Array.from({ length: 10 }, (_, index) =>
      chesscomGame(`old-${index}`, FRENCH_PGN, 10 + index, 'me', 'them', 'resigned', 'win')
    )
    const summary = buildAccountAnalysis({
      chesscomUsername: 'me',
      chesscomGames: [
        ...olderChessComGames,
        chesscomGame('new', ITALIAN_PGN, 300, 'me', 'them', 'win', 'resigned'),
      ],
      lichessUsername: 'lichessMe',
      lichessGames: [
        lichessGame('middle', LONDON_PGN, 200_000, null),
      ],
      gameCount: 10,
    })

    expect(summary.scannedGames).toHaveLength(10)
    expect(summary.scannedGames.map(game => game.gameId).slice(0, 2)).toEqual([
      'https://www.chess.com/game/live/new',
      'lichess:middle',
    ])
    expect(summary.scannedGames.some(game => game.gameId === 'https://www.chess.com/game/live/old-0')).toBe(false)
  })

  it('groups openings separately by color and computes W/L/D score', () => {
    const summary = buildAccountAnalysis({
      chesscomUsername: 'me',
      chesscomGames: [
        chesscomGame('white-win', ITALIAN_PGN, 300, 'me', 'them', 'win', 'resigned'),
        chesscomGame('white-loss', ITALIAN_PGN, 200, 'me', 'them', 'resigned', 'win'),
        chesscomGame('black-win', SICILIAN_PGN, 100, 'them', 'me', 'resigned', 'win'),
      ],
      gameCount: 10,
    })

    expect(summary.openingsByColor.white[0]).toMatchObject({
      opening: 'Italian Game: Giuoco Piano',
      games: 2,
      wins: 1,
      losses: 1,
      draws: 0,
      scorePct: 50,
    })
    expect(summary.openingsByColor.black[0]).toMatchObject({
      opening: 'Sicilian Defense: Najdorf',
      games: 1,
      wins: 1,
      losses: 0,
      draws: 0,
      scorePct: 100,
    })
  })

  it('counts recurring mistake categories from matching analyzed games', () => {
    const matchingId = 'https://www.chess.com/game/live/white-win'
    const summary = buildAccountAnalysis({
      chesscomUsername: 'me',
      chesscomGames: [
        chesscomGame('white-win', ITALIAN_PGN, 300, 'me', 'them', 'win', 'resigned'),
      ],
      analyzedGames: [
        analyzedRecord(matchingId, 'hung_piece'),
        analyzedRecord('https://www.chess.com/game/live/not-in-scan', 'ignored_threat'),
      ],
      gameCount: 10,
    })

    expect(summary.analyzedGameCount).toBe(1)
    expect(summary.weaknessCoveragePct).toBe(100)
    expect(summary.weaknessConfidence).toBe('high')
    expect(summary.weaknesses).toHaveLength(1)
    expect(summary.weaknesses[0]).toMatchObject({
      category: 'hung_piece',
      count: 1,
    })
  })

  it('produces a fallback takeaway when no analyzed games exist', () => {
    const summary = buildAccountAnalysis({
      chesscomUsername: 'me',
      chesscomGames: [
        chesscomGame('white-win', ITALIAN_PGN, 300, 'me', 'them', 'win', 'resigned'),
      ],
      gameCount: 10,
    })

    expect(summary.takeaways.some(takeaway => takeaway.includes('weakness takeaways need more DeepMove-reviewed games'))).toBe(true)
  })

  it('reports low weakness confidence when few scanned games have completed analysis', () => {
    const summary = buildAccountAnalysis({
      chesscomUsername: 'me',
      chesscomGames: Array.from({ length: 10 }, (_, index) =>
        chesscomGame(`g${index}`, ITALIAN_PGN, 300 - index, 'me', 'them', 'win', 'resigned')
      ),
      analyzedGames: [analyzedRecord('https://www.chess.com/game/live/g0', 'hung_piece')],
      gameCount: 10,
    })

    expect(summary.analyzedGameCount).toBe(1)
    expect(summary.weaknessCoveragePct).toBe(10)
    expect(summary.weaknessConfidence).toBe('low')
  })

  it('uses watchlist language instead of recurring weakness for openings below 5 games', () => {
    const summary = buildAccountAnalysis({
      chesscomUsername: 'me',
      chesscomGames: [
        chesscomGame('a', FRENCH_PGN, 300, 'me', 'them', 'resigned', 'win'),
        chesscomGame('b', FRENCH_PGN, 299, 'me', 'them', 'resigned', 'win'),
        chesscomGame('c', FRENCH_PGN, 298, 'me', 'them', 'win', 'resigned'),
      ],
      gameCount: 10,
    })

    expect(summary.takeaways.some(takeaway => takeaway.includes('White watchlist'))).toBe(true)
    expect(summary.takeaways.some(takeaway => takeaway.includes('lowest-scoring repeated opening'))).toBe(false)
  })

  it('does not reference openings outside the visible top-six table rows in takeaways', () => {
    const pgns = [
      ITALIAN_PGN,
      SICILIAN_PGN,
      FRENCH_PGN,
      LONDON_PGN,
      '[White "me"][Black "them"][Result "1-0"] 1. c4 e5 2. Nc3 Nc6 1-0',
      '[White "me"][Black "them"][Result "1-0"] 1. Nf3 d5 2. g3 Nf6 1-0',
      '[White "me"][Black "them"][Result "0-1"] 1. b3 e5 2. Bb2 Nc6 0-1',
    ]
    const chesscomGames = pgns.flatMap((pgn, pgnIndex) =>
      Array.from({ length: 5 }, (_, copyIndex) =>
        chesscomGame(
          `o${pgnIndex}-${copyIndex}`,
          pgn,
          1000 - (pgnIndex * 10 + copyIndex),
          'me',
          'them',
          pgnIndex === 6 ? 'resigned' : 'win',
          pgnIndex === 6 ? 'win' : 'resigned',
        )
      )
    )

    const summary = buildAccountAnalysis({
      chesscomUsername: 'me',
      chesscomGames,
      gameCount: 35,
    })
    const hiddenOpening = summary.openingsByColor.white[6]?.opening

    expect(hiddenOpening).toBeTruthy()
    expect(summary.takeaways.some(takeaway => hiddenOpening && takeaway.includes(hiddenOpening))).toBe(false)
  })

  it('avoids strong insights until at least 10 games are analyzed', () => {
    const summary = buildAccountAnalysis({
      chesscomUsername: 'me',
      chesscomGames: Array.from({ length: 10 }, (_, index) =>
        chesscomGame(`g${index}`, ITALIAN_PGN, 300 - index, 'me', 'them', 'win', 'resigned')
      ),
      analyzedGames: [analyzedRecord('https://www.chess.com/game/live/g0', 'hung_piece')],
      gameCount: 10,
    })

    expect(summary.topInsights).toHaveLength(1)
    expect(summary.topInsights[0]).toMatchObject({
      kind: 'building',
      title: 'Still building confidence',
    })
  })

  it('does not call a well-scoring opening a weakness', () => {
    const games = Array.from({ length: 10 }, (_, index) =>
      chesscomGame(`good-${index}`, ITALIAN_PGN, 500 - index, 'me', 'them', index < 8 ? 'win' : 'resigned', index < 8 ? 'resigned' : 'win')
    )
    const analyzedGames = games.map(game => analyzedRecord(game.url, 'hung_piece'))
    const summary = buildAccountAnalysis({
      chesscomUsername: 'me',
      chesscomGames: games,
      analyzedGames,
      gameCount: 10,
    })

    expect(summary.topInsights.some(insight =>
      insight.kind === 'opening' && insight.title.includes('Italian Game')
    )).toBe(false)
  })

  it('builds compact top insights from analyzed weaknesses and poor repeated openings', () => {
    const poorOpeningGames = Array.from({ length: 6 }, (_, index) =>
      chesscomGame(`poor-${index}`, FRENCH_PGN, 600 - index, 'me', 'them', index === 0 ? 'win' : 'resigned', index === 0 ? 'resigned' : 'win')
    )
    const otherGames = Array.from({ length: 6 }, (_, index) =>
      chesscomGame(`other-${index}`, ITALIAN_PGN, 500 - index, 'me', 'them', 'win', 'resigned')
    )
    const games = [...poorOpeningGames, ...otherGames]
    const analyzedGames = games.map((game, index) =>
      analyzedRecord(game.url, index < 7 ? 'hung_piece' : 'ignored_threat')
    )

    const summary = buildAccountAnalysis({
      chesscomUsername: 'me',
      chesscomGames: games,
      analyzedGames,
      gameCount: 12,
    })

    expect(summary.topInsights.length).toBeLessThanOrEqual(3)
    expect(summary.topInsights[0].kind).toBe('weakness')
    expect(summary.topInsights.some(insight => insight.kind === 'opening' && insight.title.includes('French'))).toBe(true)
  })

  it('does not present unknown/general mistakes as a precise weakness theme', () => {
    const games = Array.from({ length: 10 }, (_, index) =>
      chesscomGame(`mixed-${index}`, ITALIAN_PGN, 700 - index, 'me', 'them', 'win', 'resigned')
    )
    const summary = buildAccountAnalysis({
      chesscomUsername: 'me',
      chesscomGames: games,
      analyzedGames: games.map(game => analyzedRecord(game.url, 'unknown')),
      gameCount: 10,
    })

    expect(summary.topInsights[0]).toMatchObject({
      kind: 'weakness',
      title: 'The mistakes are still mixed',
    })
    expect(summary.topInsights[0].action).not.toContain('general check')
  })

  it('uses a specific coach brief theme even when general mistakes have the highest count', () => {
    const games = Array.from({ length: 15 }, (_, index) =>
      chesscomGame(`theme-${index}`, ITALIAN_PGN, 900 - index, 'me', 'them', 'win', 'resigned')
    )
    const analyzedGames = [
      ...games.slice(0, 12).map(game => analyzedRecord(game.url, 'unknown')),
      ...games.slice(12).map((game, index) =>
        analyzedRecord(game.url, 'missed_tactic', false, {
          moveNumber: 12 + index,
          movePlayed: index === 0 ? 'Qd2' : 'Re1',
          evalSwing: 420 - index * 30,
        })
      ),
    ]

    const summary = buildAccountAnalysis({
      chesscomUsername: 'me',
      chesscomGames: games,
      analyzedGames,
      gameCount: 15,
    })

    expect(summary.weaknesses[0]).toMatchObject({ category: 'unknown', count: 12 })
    expect(summary.coachBrief).toMatchObject({
      primaryCategory: 'missed_tactic',
      title: 'Missed Tactic is the review focus',
    })
    expect(summary.coachBrief.evidence).toContain('3 missed tactic moments')
  })

  it('frames only-general coach briefs as unclear classifier signal', () => {
    const games = Array.from({ length: 10 }, (_, index) =>
      chesscomGame(`general-${index}`, ITALIAN_PGN, 800 - index, 'me', 'them', 'win', 'resigned')
    )

    const summary = buildAccountAnalysis({
      chesscomUsername: 'me',
      chesscomGames: games,
      analyzedGames: games.map(game => analyzedRecord(game.url, 'unknown')),
      gameCount: 10,
    })

    expect(summary.coachBrief).toMatchObject({
      primaryCategory: 'unknown',
      title: 'Critical moments need a clearer label',
      finding: 'DeepMove found critical moments, but not a clean theme yet.',
    })
    expect(summary.coachBrief.evidence).toContain('uncategorized critical moments')
  })

  it('includes the strongest evidence moments for the selected coach theme', () => {
    const games = Array.from({ length: 10 }, (_, index) =>
      chesscomGame(`evidence-${index}`, ITALIAN_PGN, 1000 - index, 'me', 'them', 'win', 'resigned')
    )
    const analyzedGames = games.map((game, index) =>
      analyzedRecord(game.url, index < 3 ? 'hung_piece' : 'ignored_threat', false, {
        moveNumber: 8 + index,
        movePlayed: index < 3 ? 'Nd5' : 'h3',
        evalSwing: 180 + index * 50,
      })
    )

    const summary = buildAccountAnalysis({
      chesscomUsername: 'me',
      chesscomGames: games,
      analyzedGames,
      gameCount: 10,
    })

    expect(summary.coachBrief.primaryCategory).toBe('ignored_threat')
    expect(summary.coachBrief.exampleMoments).toHaveLength(3)
    expect(summary.coachBrief.exampleMoments.map(moment => moment.category)).toEqual([
      'ignored_threat',
      'ignored_threat',
      'ignored_threat',
    ])
    expect(summary.coachBrief.exampleMoments[0]).toMatchObject({
      gameId: 'https://www.chess.com/game/live/evidence-9',
      moveNumber: 17,
      movePlayed: 'h3',
      evalSwing: 630,
      opening: 'Italian Game: Giuoco Piano',
    })
  })

  it('uses cautious coach confidence language for a 25-game sample', () => {
    const games = Array.from({ length: 25 }, (_, index) =>
      chesscomGame(`sample-${index}`, ITALIAN_PGN, 1100 - index, 'me', 'them', 'win', 'resigned')
    )

    const summary = buildAccountAnalysis({
      chesscomUsername: 'me',
      chesscomGames: games,
      analyzedGames: games.map(game => analyzedRecord(game.url, 'missed_tactic')),
      gameCount: 25,
    })

    expect(summary.coachBrief.confidenceLabel).toBe('Recent sample')
    expect(summary.coachBrief.nextAction).toContain('Open the evidence games')
  })

  it('does not make a poor opening the coach focus before five games', () => {
    const poorOpeningGames = Array.from({ length: 4 }, (_, index) =>
      chesscomGame(`short-french-${index}`, FRENCH_PGN, 700 - index, 'me', 'them', 'resigned', 'win')
    )
    const otherGames = Array.from({ length: 6 }, (_, index) =>
      chesscomGame(`short-other-${index}`, ITALIAN_PGN, 600 - index, 'me', 'them', 'win', 'resigned')
    )
    const games = [...poorOpeningGames, ...otherGames]

    const summary = buildAccountAnalysis({
      chesscomUsername: 'me',
      chesscomGames: games,
      analyzedGames: games.map(game => analyzedRecordWithoutMoments(game.url)),
      gameCount: 10,
    })

    expect(summary.coachBrief.kind).not.toBe('opening')
    expect(summary.coachBrief.title).not.toContain('French')
  })

  it('allows an opening coach focus once the poor line is recurring', () => {
    const poorOpeningGames = Array.from({ length: 5 }, (_, index) =>
      chesscomGame(`recurring-french-${index}`, FRENCH_PGN, 700 - index, 'me', 'them', 'resigned', 'win')
    )
    const otherGames = Array.from({ length: 5 }, (_, index) =>
      chesscomGame(`recurring-other-${index}`, ITALIAN_PGN, 600 - index, 'me', 'them', 'win', 'resigned')
    )
    const games = [...poorOpeningGames, ...otherGames]

    const summary = buildAccountAnalysis({
      chesscomUsername: 'me',
      chesscomGames: games,
      analyzedGames: games.map(game => analyzedRecordWithoutMoments(game.url)),
      gameCount: 10,
    })

    expect(summary.coachBrief).toMatchObject({
      kind: 'opening',
      title: 'French Defense: Classical Variation is the line to review',
    })
    expect(summary.coachBrief.whyItMatters).toContain('Opening results are not engine-reviewed mistakes')
  })
})
