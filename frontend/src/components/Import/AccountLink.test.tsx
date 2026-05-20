import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AccountLink from './AccountLink'
import type { LichessGame } from '../../api/lichess'

const mocks = vi.hoisted(() => ({
  getRecentGames: vi.fn(),
  getNewGames: vi.fn(),
  resolveChessComUsername: vi.fn((username: string) => username),
  getUserGames: vi.fn(),
  getNewLichessGames: vi.fn(),
}))

vi.mock('../../api/chesscom', () => ({
  getRecentGames: mocks.getRecentGames,
  getNewGames: mocks.getNewGames,
  resolveChessComUsername: mocks.resolveChessComUsername,
}))

vi.mock('../../api/lichess', () => ({
  getUserGames: mocks.getUserGames,
  getNewLichessGames: mocks.getNewLichessGames,
}))

vi.mock('../../services/identity', () => ({
  getMyUsername: vi.fn(() => null),
  setIdentity: vi.fn(),
  isMe: vi.fn(() => false),
  isDismissed: vi.fn(() => false),
  dismiss: vi.fn(),
}))

describe('AccountLink', () => {
  beforeEach(() => {
    localStorage.clear()
    mocks.getRecentGames.mockReset()
    mocks.getNewGames.mockReset()
    mocks.resolveChessComUsername.mockClear()
    mocks.getUserGames.mockReset()
    mocks.getNewLichessGames.mockReset()
  })

  it('restores the saved username for the same device/browser', async () => {
    mocks.getRecentGames.mockResolvedValue({
      games: [],
      fetchedArchives: [],
      allArchives: [],
      hasMore: false,
    })
    localStorage.setItem('deepmove_chesscom_username', 'moosetheman123')

    render(
      <AccountLink
        platform="chesscom"
        onGamesLoaded={() => {}}
      />
    )

    await waitFor(() => {
      expect(mocks.getRecentGames).toHaveBeenCalledWith('moosetheman123')
    })
    expect(screen.getByPlaceholderText('Chess.com username')).toHaveValue('moosetheman123')
  })

  it('automatically loads saved chess.com games on mount', async () => {
    mocks.getRecentGames.mockResolvedValue({
      games: [],
      fetchedArchives: [],
      allArchives: [],
      hasMore: false,
    })
    localStorage.setItem('deepmove_chesscom_username', 'moosetheman123')

    render(
      <AccountLink
        platform="chesscom"
        onGamesLoaded={() => {}}
      />
    )

    await waitFor(() => {
      expect(mocks.getRecentGames).toHaveBeenCalledWith('moosetheman123')
    })
  })

  it('uses delta reload after restoring cached chess.com games', async () => {
    const cachedGames = [{
      url: 'https://www.chess.com/game/live/1',
      pgn: '1. e4 e5',
      time_control: '600',
      end_time: 1700000000,
      rated: true,
      white: { username: 'moosetheman123', rating: 1500, result: 'win' },
      black: { username: 'opponent', rating: 1490, result: 'resigned' },
    }]

    localStorage.setItem('deepmove_chesscom_username', 'moosetheman123')
    localStorage.setItem('deepmove_gamelist_chesscom_moosetheman123', JSON.stringify({
      games: cachedGames,
      pagination: {
        platform: 'chesscom',
        fetchedArchives: ['archive-1'],
        allArchives: ['archive-1', 'archive-2'],
        hasMore: true,
      },
      fetchedAt: Date.now(),
    }))

    mocks.getNewGames.mockResolvedValue([])

    render(
      <AccountLink
        platform="chesscom"
        onGamesLoaded={() => {}}
        onGamesAppended={() => {}}
        newestEndTime={1700000000}
      />
    )

    await waitFor(() => {
      expect(mocks.getNewGames).toHaveBeenCalledWith('moosetheman123', 1700000000)
    })

    expect(mocks.getRecentGames).not.toHaveBeenCalled()
  })

  it('starts read-only to discourage Safari autofill and unlocks on focus', async () => {
    mocks.getRecentGames.mockResolvedValue({
      games: [],
      fetchedArchives: [],
      allArchives: [],
      hasMore: false,
    })
    localStorage.setItem('deepmove_chesscom_username', 'moosetheman123')

    render(
      <AccountLink
        platform="chesscom"
        onGamesLoaded={() => {}}
      />
    )

    await waitFor(() => {
      expect(mocks.getRecentGames).toHaveBeenCalledWith('moosetheman123')
    })
    const input = screen.getByPlaceholderText('Chess.com username')
    expect(input).toHaveAttribute('readonly')

    fireEvent.focus(input)

    expect(input).not.toHaveAttribute('readonly')
    expect(input).toHaveValue('moosetheman123')
  })

  it('can keep the mobile loader blank even when a saved username exists', async () => {
    mocks.getRecentGames.mockResolvedValue({
      games: [],
      fetchedArchives: [],
      allArchives: [],
      hasMore: false,
    })
    localStorage.setItem('deepmove_chesscom_username', 'moosetheman123')

    render(
      <AccountLink
        platform="chesscom"
        onGamesLoaded={() => {}}
        restoreSavedUsername={false}
      />
    )

    await waitFor(() => {
      expect(mocks.getRecentGames).toHaveBeenCalledWith('moosetheman123')
    })
    expect(screen.getByPlaceholderText('Chess.com username')).toHaveValue('')
  })

  it('persists the searched username immediately after a successful fetch', async () => {
    mocks.getRecentGames.mockResolvedValue({
      games: [],
      fetchedArchives: [],
      allArchives: [],
      hasMore: false,
    })

    render(
      <AccountLink
        platform="chesscom"
        onGamesLoaded={() => {}}
      />
    )

    fireEvent.change(screen.getByPlaceholderText('Chess.com username'), {
      target: { value: 'mobileuser' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Load' }))

    await waitFor(() => {
      expect(localStorage.getItem('deepmove_chesscom_username')).toBe('mobileuser')
    })
  })

  it('ignores stale Lichess cache entries that are missing clock annotations', () => {
    const staleLichessGame: LichessGame = {
      id: 'abc123',
      rated: true,
      variant: 'standard',
      speed: 'rapid',
      perf: 'rapid',
      createdAt: 1700000000000,
      lastMoveAt: 1700001000000,
      status: 'mate',
      players: {
        white: { user: { name: 'alice' }, rating: 1600 },
        black: { user: { name: 'bob' }, rating: 1550 },
      },
      pgn: '1. e4 e5 2. Nf3 Nc6',
      clock: { initial: 600, increment: 0 },
    }

    localStorage.setItem('deepmove_lichess_username', 'alice')
    localStorage.setItem('deepmove_gamelist_lichess_alice', JSON.stringify({
      games: [staleLichessGame],
      pagination: { platform: 'lichess', hasMore: false },
      fetchedAt: Date.now(),
    }))

    const onGamesLoaded = vi.fn()
    render(
      <AccountLink
        platform="lichess"
        onGamesLoaded={onGamesLoaded}
      />
    )

    expect(onGamesLoaded).not.toHaveBeenCalled()
  })

  it('can skip cached auto-restore for a blank mobile load shell', () => {
    localStorage.setItem('deepmove_lichess_username', 'alice')
    localStorage.setItem('deepmove_gamelist_lichess_alice', JSON.stringify({
      games: [],
      pagination: { platform: 'lichess', hasMore: false },
      fetchedAt: Date.now(),
    }))

    const onGamesLoaded = vi.fn()
    render(
      <AccountLink
        platform="lichess"
        onGamesLoaded={onGamesLoaded}
        restoreSavedUsername={false}
        restoreCachedGames={false}
      />
    )

    expect(screen.getByPlaceholderText('Lichess username')).toHaveValue('')
    expect(onGamesLoaded).not.toHaveBeenCalled()
  })
})
