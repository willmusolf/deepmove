import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UserMenu from './UserMenu'

const mockState = vi.hoisted(() => ({
  getPlayerProfile: vi.fn(),
  updateProfile: vi.fn(),
  user: {
    id: 1,
    email: 'google-user@deepmove.io',
    is_premium: false,
    subscription_status: 'none',
    is_admin: false,
    elo_estimate: null,
    chesscom_username: null,
    lichess_username: null,
    avatar_url: 'https://lh3.googleusercontent.com/google-avatar',
    lichess_oauth_linked: false,
    google_oauth_linked: true,
    preferences: {},
    created_at: '2026-05-19T00:00:00Z',
  },
}))

vi.mock('../../api/chesscom', () => ({
  getPlayerProfile: (...args: unknown[]) => mockState.getPlayerProfile(...args),
}))

vi.mock('../../services/identity', () => ({
  getIdentity: () => ({}),
}))

vi.mock('./AuthModal', () => ({
  default: () => null,
}))

vi.mock('../../stores/authStore', () => ({
  useAuthStore: (selector: (state: {
    user: typeof mockState.user
    isLoading: boolean
    updateProfile: typeof mockState.updateProfile
  }) => unknown) => selector({
    user: mockState.user,
    isLoading: false,
    updateProfile: mockState.updateProfile,
  }),
}))

describe('UserMenu avatar precedence', () => {
  beforeEach(() => {
    mockState.getPlayerProfile.mockReset()
    mockState.updateProfile.mockReset()
    mockState.user = {
      id: 1,
      email: 'google-user@deepmove.io',
      is_premium: false,
      subscription_status: 'none',
      is_admin: false,
      elo_estimate: null,
      chesscom_username: null,
      lichess_username: null,
      avatar_url: 'https://lh3.googleusercontent.com/google-avatar',
      lichess_oauth_linked: false,
      google_oauth_linked: true,
      preferences: {},
      created_at: '2026-05-19T00:00:00Z',
    }
  })

  it('uses the stored backend avatar when no chesscom avatar is available', async () => {
    render(<UserMenu currentPage="review" onNavigate={vi.fn()} />)

    const avatar = await screen.findByAltText('google-user')
    expect(avatar).toHaveAttribute('src', 'https://lh3.googleusercontent.com/google-avatar')
  })

  it('prefers the chesscom avatar over the stored backend avatar', async () => {
    mockState.user = {
      ...mockState.user,
      chesscom_username: 'moosetheman123',
    }
    mockState.getPlayerProfile.mockResolvedValue({
      avatar: 'https://images.chesscomfiles.com/chess-avatar.png',
    })

    render(<UserMenu currentPage="review" onNavigate={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByAltText('moosetheman123')).toHaveAttribute(
        'src',
        'https://images.chesscomfiles.com/chess-avatar.png',
      )
    })
  })
})
