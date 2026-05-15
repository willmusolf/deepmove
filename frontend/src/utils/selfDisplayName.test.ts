import { beforeEach, describe, expect, it } from 'vitest'
import { getSelfDisplayName } from './selfDisplayName'

describe('getSelfDisplayName', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('prefers linked account usernames from the authenticated user', () => {
    expect(getSelfDisplayName({
      chesscom_username: 'KnightRider',
      lichess_username: 'lichess-alt',
    })).toBe('KnightRider')
  })

  it('falls back to stored review usernames before using the generic label', () => {
    localStorage.setItem('deepmove_lichess_username', 'StoredLichess')

    expect(getSelfDisplayName(null)).toBe('StoredLichess')
    localStorage.clear()
    expect(getSelfDisplayName(null)).toBe('You')
  })
})
