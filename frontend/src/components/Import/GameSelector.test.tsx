import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import GameSelector from './GameSelector'
import type { ChessComGame } from '../../api/chesscom'
import type { LichessGame } from '../../api/lichess'

const loadMoreGamesMock = vi.fn()
const onGamesAppendedMock = vi.fn()

vi.mock('../../api/chesscom', () => ({
  loadMoreGames: (...args: unknown[]) => loadMoreGamesMock(...args),
}))

vi.mock('../../api/lichess', () => ({
  loadMoreLichessGames: vi.fn(),
}))

vi.mock('../../services/gameDB', () => ({
  getGameId: vi.fn((game: ChessComGame) => game.url),
  getAnalyzedGame: vi.fn(async () => null),
  getAnalyzedGameIds: vi.fn(async () => new Set()),
  getCachedGamesForUser: vi.fn(async () => []),
  saveAnalyzedGame: vi.fn(async () => {}),
}))

vi.mock('../../stores/gameStore', () => {
  const store = {
    setPgn: vi.fn(),
    setRawPgn: vi.fn(),
    setLoadedPgn: vi.fn(),
    loadedPgn: '',
    setUserColor: vi.fn(),
    setUserElo: vi.fn(),
    setPlatform: vi.fn(),
    setMoveEvals: vi.fn(),
    setCriticalMoments: vi.fn(),
    setCurrentGameId: vi.fn(),
    setBackendGameId: vi.fn(),
    setCurrentGameMeta: vi.fn(),
    setSkipNextAnalysis: vi.fn(),
    setResumeFromIndex: vi.fn(),
    reset: vi.fn(),
    moveEvals: [],
    isAnalyzing: false,
  }

  return {
    useGameStore: (selector: (state: typeof store) => unknown) => selector(store),
  }
})

function makeChessComGame(): ChessComGame {
  return {
    url: 'https://www.chess.com/game/live/123',
    pgn: '[Event "?"]\n\n1. e4 e5 2. Nf3 Nc6',
    time_control: '600',
    end_time: 1_717_000_000,
    rated: true,
    white: { username: 'Alice', rating: 1500, result: 'win' },
    black: { username: 'Bob', rating: 1480, result: 'checkmated' },
  }
}

function makeLichessGame(): LichessGame {
  return {
    id: 'lichess-123',
    rated: true,
    variant: 'standard',
    createdAt: 1_717_000_000_000,
    lastMoveAt: 1_717_000_100_000,
    speed: 'rapid',
    perf: 'rapid',
    status: 'mate',
    players: {
      white: { user: { name: 'Alice' }, rating: 1500 },
      black: { user: { name: 'BobTheBuilder' }, rating: 1480 },
    },
    pgn: '[Event "?"]\n\n1. e4 e5 2. Nf3 Nc6',
    clock: { initial: 600, increment: 0 },
  }
}

describe('GameSelector Chess.com opponent hint', () => {
  beforeEach(() => {
    loadMoreGamesMock.mockReset()
    onGamesAppendedMock.mockReset()
  })

  it('shows the local-only hint only while archive backfill is actively running', async () => {
    loadMoreGamesMock.mockImplementation(() => new Promise(() => {}))

    render(
      <GameSelector
        games={[makeChessComGame()]}
        username="Alice"
        platform="chesscom"
        onGameLoaded={() => {}}
        pagination={{
          platform: 'chesscom',
          fetchedArchives: ['2026/05'],
          allArchives: ['2026/04', '2026/05'],
          hasMore: true,
        }}
        onGamesAppended={onGamesAppendedMock}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText('vs opponent…'), { target: { value: 'Bob' } })

    await waitFor(() => {
      expect(screen.getByText('Searching loaded games only — loading all now…')).toBeInTheDocument()
    })
  })

  it('does not show the hint after archive backfill has already finished', async () => {
    loadMoreGamesMock.mockResolvedValue({
      games: [],
      fetchedArchives: ['2026/04', '2026/05'],
      allArchives: ['2026/04', '2026/05'],
      hasMore: false,
    })

    render(
      <GameSelector
        games={[makeChessComGame()]}
        username="Alice"
        platform="chesscom"
        onGameLoaded={() => {}}
        pagination={{
          platform: 'chesscom',
          fetchedArchives: ['2026/05'],
          allArchives: ['2026/04', '2026/05'],
          hasMore: true,
        }}
        onGamesAppended={onGamesAppendedMock}
      />,
    )

    await waitFor(() => {
      expect(onGamesAppendedMock).toHaveBeenCalled()
    })

    fireEvent.change(screen.getByPlaceholderText('vs opponent…'), { target: { value: 'Bob' } })

    expect(screen.queryByText('Searching loaded games only — loading all now…')).not.toBeInTheDocument()
  })
})

describe('GameSelector Lichess opponent filtering', () => {
  it('filters locally as you type without showing a search-all button', async () => {
    render(
      <GameSelector
        games={[makeLichessGame()]}
        username="Alice"
        platform="lichess"
        onGameLoaded={() => {}}
        pagination={{ platform: 'lichess', hasMore: true }}
        onGamesAppended={onGamesAppendedMock}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText('vs opponent…'), { target: { value: 'builder' } })

    await waitFor(() => {
      expect(screen.getByText(/1 of 1/)).toBeInTheDocument()
    })
    expect(screen.queryByText('Search all')).not.toBeInTheDocument()
  })
})
