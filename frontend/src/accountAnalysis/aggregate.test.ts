import { describe, expect, it } from 'vitest'
import type { ChessComGame } from '../api/chesscom'
import type { LichessGame } from '../api/lichess'
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
  category: 'hung_piece' | 'ignored_threat',
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
      moveNumber: 4,
      color: 'white',
      fen: '',
      fenAfter: '',
      movePlayed: 'Bc4',
      engineBest: [],
      evalBefore: 0,
      evalAfter: -200,
      evalSwing: 200,
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
})
