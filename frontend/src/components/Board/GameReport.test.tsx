import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { MoveEval } from '../../engine/analysis'
import GameReport from './GameReport'
import { buildCalibrationSnapshot, computeSideStats } from './GameReport'

function makeEval(
  moveNumber: number,
  color: 'white' | 'black',
  score: number,
  grade: MoveEval['grade'] = null,
): MoveEval {
  return {
    moveNumber,
    color,
    san: 'e4',
    fen: 'stub-fen',
    eval: {
      score,
      depth: 18,
      fen: 'stub-fen',
      isMate: false,
      mateIn: null,
      bestMove: '',
      pv: [],
    },
    grade,
  }
}

describe('computeSideStats', () => {
  it('returns null for empty evals', () => {
    expect(computeSideStats([], 'white')).toBeNull()
  })

  it('returns null when a side has no analyzed moves yet', () => {
    const evals: MoveEval[] = [makeEval(1, 'white', 30, 'best')]
    expect(computeSideStats(evals, 'black')).toBeNull()
  })

  it('returns a summary when a side has moves', () => {
    const evals: MoveEval[] = [
      makeEval(1, 'white', 30000, 'best'),
      makeEval(1, 'black', 0, 'mistake'),
      makeEval(2, 'white', 0, 'blunder'),
    ]

    const stats = computeSideStats(evals, 'white')
    expect(stats).not.toBeNull()
    expect(stats!.counts.best).toBe(1)
    expect(stats!.counts.blunder).toBe(1)
  })

  it('counts rendered grade buckets correctly', () => {
    const evals: MoveEval[] = [
      makeEval(1, 'white', 0, 'good'),
      makeEval(1, 'black', 0, 'blunder'),
      makeEval(2, 'white', 0, 'good'),
      makeEval(2, 'black', 0),
      makeEval(3, 'white', 0, 'excellent'),
    ]

    const stats = computeSideStats(evals, 'white')
    expect(stats?.counts.good).toBe(2)
    expect(stats?.counts.excellent).toBe(1)
  })
})

describe('GameReport rendering', () => {
  it('hides the report while analysis is incomplete', () => {
    const { container } = render(
      <GameReport
        moveEvals={[makeEval(1, 'white', 40, 'best')]}
        userColor="white"
        analysisComplete={false}
      />
    )

    expect(container.firstChild).toBeNull()
  })
  it('renders the compact stat strip after analysis completes', () => {
    const { container } = render(
      <GameReport
        moveEvals={[
          makeEval(1, 'white', 30, 'best'),
          makeEval(1, 'black', 20, 'mistake'),
        ]}
        userColor="white"
        analysisComplete={true}
        whiteElo="1500"
        blackElo="1400"
      />
    )

    expect(container.querySelectorAll('.game-report-side')).toHaveLength(2)
    expect(container.querySelector('.game-report-highlights')).toBeNull()
    expect(container.textContent).toContain('White')
    expect(container.textContent).toContain('Black')
    expect(container.textContent).toContain('Accuracy:')
    expect(container.textContent).toContain('Game Rating:')
    expect(container.textContent).toMatch(/\d+(\.\d)?%/)
    expect(container.textContent).not.toContain('~')
  })

  it('renders player names and uses ratings as an internal input, not as display text', () => {
    const { container } = render(
      <GameReport
        moveEvals={[
          makeEval(1, 'white', 30, 'best'),
          makeEval(1, 'black', 20, 'mistake'),
        ]}
        userColor="white"
        analysisComplete={true}
        whiteName="Alice"
        blackName="Bob"
        whiteElo="1500"
        blackElo="1400"
      />
    )

    expect(container.textContent).toContain('Alice')
    expect(container.textContent).toContain('Bob')
    expect(container.textContent).toContain('Game Rating:')
    expect(container.textContent).not.toContain('(1500)')
    expect(container.textContent).not.toContain('(1400)')
  })
})

describe('buildCalibrationSnapshot', () => {
  it('builds a copyable comparison snapshot with source URL, stats, and blank Chess.com placeholders', () => {
    const moveEvals: MoveEval[] = [
      makeEval(1, 'white', 30, 'best'),
      makeEval(1, 'black', 20, 'mistake'),
      makeEval(2, 'white', 40, 'good'),
      makeEval(2, 'black', 10, 'blunder'),
    ]

    const whiteStats = computeSideStats(moveEvals, 'white')
    const blackStats = computeSideStats(moveEvals, 'black')

    const snapshot = buildCalibrationSnapshot({
      platform: 'chesscom',
      gameId: 'https://www.chess.com/game/live/123',
      timeControl: '10 min',
      endTime: Date.UTC(2026, 4, 13, 16, 0, 0),
      result: '1-0',
      whiteName: 'Alice',
      blackName: 'Bob',
      whiteElo: '1500',
      blackElo: '1400',
      whiteStats,
      blackStats,
      whiteAccuracy: 91.2,
      blackAccuracy: 62.5,
    })

    expect(snapshot.sourceUrl).toBe('https://www.chess.com/game/live/123')
    expect(snapshot.players.white.deepmoveAccuracy).toBe(91.2)
    expect(snapshot.players.white.deepmoveGameRating).toBeGreaterThan(1500)
    expect(snapshot.players.white.deepmoveBadges.best).toBe(1)
    expect(snapshot.players.white.deepmoveBadges.good).toBe(1)
    expect(snapshot.players.black.deepmoveBadges.mistake).toBe(1)
    expect(snapshot.players.black.deepmoveBadges.blunder).toBe(1)
    expect(snapshot.chesscomReview.whiteAccuracy).toBeNull()
    expect(snapshot.chesscomReview.notableDifferences).toBe('')
  })
})
