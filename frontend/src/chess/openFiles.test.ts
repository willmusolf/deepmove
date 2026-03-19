import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { getHalfOpenFiles, getOpenFiles } from './openFiles'

describe('getOpenFiles', () => {
  it('returns no open files in the starting position', () => {
    const chess = new Chess()

    expect(getOpenFiles(chess)).toEqual([])
  })

  it('returns a file as open when both pawns are gone', () => {
    const chess = new Chess()
    chess.remove('d2')
    chess.remove('d7')

    expect(getOpenFiles(chess)).toEqual(['d'])
  })

  it('returns multiple open files in board order', () => {
    const chess = new Chess('rnbqkbnr/pp1p1ppp/8/8/8/8/PP1P1PPP/RNBQKBNR w KQkq - 0 1')

    expect(getOpenFiles(chess)).toEqual(['c', 'e'])
  })
})

describe('getHalfOpenFiles', () => {
  it('returns no half-open files in the starting position', () => {
    const chess = new Chess()

    expect(getHalfOpenFiles(chess, 'white')).toEqual([])
    expect(getHalfOpenFiles(chess, 'black')).toEqual([])
  })

  it('returns a file for the side missing its pawn while the opponent pawn remains', () => {
    const chess = new Chess()
    chess.remove('e2')

    expect(getHalfOpenFiles(chess, 'white')).toEqual(['e'])
    expect(getHalfOpenFiles(chess, 'black')).toEqual([])
  })

  it('returns sorted deterministic arrays across multiple half-open files', () => {
    const chess = new Chess('rnbqkbnr/pp1pp1pp/8/8/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1')

    expect(getHalfOpenFiles(chess, 'white')).toEqual(['e'])
    expect(getHalfOpenFiles(chess, 'black')).toEqual(['c', 'f'])
  })
})
