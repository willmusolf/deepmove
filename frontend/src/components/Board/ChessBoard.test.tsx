import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ChessBoard, { getLegalDests, getTurnColor } from './ChessBoard'

describe('ChessBoard component', () => {
  it('renders the board container', () => {
    render(<ChessBoard />)
    const board = screen.getByRole('region')
    expect(board).toBeInTheDocument()
  })
})

describe('chess helpers', () => {
  it('returns the correct turn color from FEN', () => {
    expect(getTurnColor('8/8/8/8/8/8/8/K6k w - - 0 1')).toBe('white')
    expect(getTurnColor('8/8/8/8/8/8/8/K6k b - - 0 1')).toBe('black')
  })

  it('computes legal destinations for starting position', () => {
    const dests = getLegalDests('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
    // Pawn moves from the initial position should include forward one and two squares.
    expect(dests.get('e2')).toEqual(expect.arrayContaining(['e3', 'e4']))
  })
})
