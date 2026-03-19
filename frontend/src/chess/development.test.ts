import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { trackDevelopment } from './development'

describe('trackDevelopment', () => {
  it('returns the initial undeveloped opening state from the start position', () => {
    const chess = new Chess()

    expect(trackDevelopment(chess, 'white')).toEqual({
      developedMinorPieces: 0,
      undevelopedMinorPieces: 4,
      rooksConnected: false,
      castled: false,
      earlyQueenMove: false,
      sameMovedTwice: false,
    })
  })

  it('counts developed minor pieces and castling in a simple opening', () => {
    const chess = new Chess()
    chess.loadPgn('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O')

    expect(trackDevelopment(chess, 'white')).toEqual({
      developedMinorPieces: 2,
      undevelopedMinorPieces: 2,
      rooksConnected: false,
      castled: true,
      earlyQueenMove: false,
      sameMovedTwice: false,
    })
  })

  it('marks rooks connected when the home-rank squares between them are clear', () => {
    const chess = new Chess('r6r/6k1/8/8/8/8/6K1/R6R w - - 0 1')

    expect(trackDevelopment(chess, 'white').rooksConnected).toBe(true)
    expect(trackDevelopment(chess, 'black').rooksConnected).toBe(true)
  })

  it('flags an early non-capturing queen move before move seven', () => {
    const chess = new Chess()
    chess.loadPgn('1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6')

    expect(trackDevelopment(chess, 'white').earlyQueenMove).toBe(true)
    expect(trackDevelopment(chess, 'white').sameMovedTwice).toBe(false)
  })

  it('flags when the same piece is moved twice in the opening', () => {
    const chess = new Chess()
    chess.loadPgn('1. Nf3 Nf6 2. Ng1 Nc6')

    expect(trackDevelopment(chess, 'white').sameMovedTwice).toBe(true)
    expect(trackDevelopment(chess, 'white').earlyQueenMove).toBe(false)
  })

  it('keeps history-based flags false when a position is loaded directly from fen', () => {
    const chess = new Chess('r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 3 3')

    expect(trackDevelopment(chess, 'white')).toEqual({
      developedMinorPieces: 1,
      undevelopedMinorPieces: 3,
      rooksConnected: false,
      castled: false,
      earlyQueenMove: false,
      sameMovedTwice: false,
    })
  })
})
