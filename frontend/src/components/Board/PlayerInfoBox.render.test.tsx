import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PlayerInfoBox from './PlayerInfoBox'

describe('PlayerInfoBox avatar fallback', () => {
  it('uses the first letter of the username when no avatar is available', () => {
    render(
      <PlayerInfoBox
        username="Analysis Board"
        elo={null}
        isWhite
        isToMove={false}
        currentFen="4k3/8/8/8/8/8/8/4K3 w - - 0 1"
      />
    )

    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('falls back to P when the username is missing', () => {
    render(
      <PlayerInfoBox
        username=""
        elo={null}
        isWhite
        isToMove={false}
        currentFen="4k3/8/8/8/8/8/8/4K3 w - - 0 1"
      />
    )

    expect(screen.getByText('P')).toBeInTheDocument()
  })
})
