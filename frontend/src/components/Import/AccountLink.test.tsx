import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AccountLink from './AccountLink'

const mocks = vi.hoisted(() => ({
  getRecentGames: vi.fn(),
  getUserGames: vi.fn(),
}))

vi.mock('../../api/chesscom', () => ({
  getRecentGames: mocks.getRecentGames,
  getNewGames: vi.fn(),
}))

vi.mock('../../api/lichess', () => ({
  getUserGames: mocks.getUserGames,
  getNewLichessGames: vi.fn(),
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
    mocks.getUserGames.mockReset()
  })

  it('restores the saved username for the same device/browser', () => {
    localStorage.setItem('deepmove_chesscom_username', 'moosetheman123')

    render(
      <AccountLink
        platform="chesscom"
        onGamesLoaded={() => {}}
      />
    )

    expect(screen.getByPlaceholderText('Chess.com username')).toHaveValue('moosetheman123')
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
})
