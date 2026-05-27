import { describe, expect, it } from 'vitest'
import type { AnalyzedGameRecord } from '../services/gameDB'
import type { ScannedAccountGame } from './aggregate'
import { getMissingAnalysisGames, selectAnalysisBatch } from './queue'

function game(id: string, result: ScannedAccountGame['result'], endTime: number): ScannedAccountGame {
  return {
    gameId: id,
    pgn: '1. e4 e5',
    opponent: 'Opponent',
    opponentRating: 1200,
    userRating: 1200,
    result,
    timeControl: '10 min',
    date: 'Today',
    isWhite: true,
    endTime,
    isCachedOnly: false,
    platform: id.startsWith('lichess') ? 'lichess' : 'chesscom',
    opening: 'King\'s Pawn: Open Game',
  }
}

function analyzed(id: string, partial = false): AnalyzedGameRecord {
  return {
    id,
    username: 'me',
    platform: id.startsWith('lichess') ? 'lichess' : 'chesscom',
    rawPgn: '1. e4 e5',
    cleanedPgn: '1. e4 e5',
    userColor: 'white',
    userElo: 1200,
    moveEvals: [],
    criticalMoments: [],
    analyzedAt: Date.now(),
    opponent: 'Opponent',
    opponentRating: 1200,
    result: 'W',
    timeControl: '10 min',
    endTime: 1,
    backendGameId: null,
    partial,
  }
}

describe('account analysis queue', () => {
  it('skips complete analyzed games but keeps partial games resumable', () => {
    const missing = getMissingAnalysisGames(
      [game('done', 'W', 3), game('partial', 'W', 2), game('fresh', 'W', 1)],
      [analyzed('done'), analyzed('partial', true)],
    )

    expect(missing.map(g => g.gameId)).toEqual(['partial', 'fresh'])
  })

  it('prioritizes the most recent missing games', () => {
    const missing = getMissingAnalysisGames(
      [
        game('win-new', 'W', 40),
        game('loss-old', 'L', 10),
        game('draw', 'D', 30),
        game('loss-new', 'L', 20),
      ],
      [],
    )

    expect(missing.map(g => g.gameId)).toEqual(['win-new', 'draw', 'loss-new', 'loss-old'])
  })

  it('selects 25 games by default and can select all missing games', () => {
    const games = Array.from({ length: 30 }, (_, index) => game(`g${index}`, 'L', index))

    expect(selectAnalysisBatch(games, [])).toHaveLength(25)
    expect(selectAnalysisBatch(games, [], 25)).toHaveLength(25)
    expect(selectAnalysisBatch(games, [], 'all')).toHaveLength(30)
  })
})
