import { describe, it, expect } from 'vitest'
import { cleanPgn, extractClockTimes } from './pgn'

describe('extractClockTimes', () => {
  it('extracts clock times in move order', () => {
    const pgn = '1. e4 { [%clk 0:09:57] } e5 { [%clk 0:09:55] } 2. Nf3 { [%clk 0:09:50] } Nc6 { [%clk 0:09:48] }'
    const times = extractClockTimes(pgn)
    expect(times).toEqual(['0:09:57', '0:09:55', '0:09:50', '0:09:48'])
  })

  it('returns empty array when no clock comments', () => {
    const pgn = '1. e4 e5 2. Nf3 Nc6'
    expect(extractClockTimes(pgn)).toEqual([])
  })

  it('handles decimal seconds in clock', () => {
    const pgn = '1. e4 { [%clk 0:09:57.2] } e5 { [%clk 0:09:55.8] }'
    const times = extractClockTimes(pgn)
    expect(times).toEqual(['0:09:57.2', '0:09:55.8'])
  })

  it('handles mixed clock and non-clock comments', () => {
    const pgn = '1. e4 { some note } { [%clk 0:09:57] } e5 { [%clk 0:09:55] }'
    const times = extractClockTimes(pgn)
    expect(times).toEqual(['0:09:57', '0:09:55'])
  })
})

describe('cleanPgn', () => {
  it('strips clock comments', () => {
    const pgn = '1. e4 { [%clk 0:09:57] } e5'
    expect(cleanPgn(pgn)).toBe('1. e4 e5')
  })

  it('strips NAG annotations', () => {
    expect(cleanPgn('1. e4 $1 e5 $2')).toBe('1. e4 e5')
  })

  it('strips simple variation', () => {
    expect(cleanPgn('1. e4 (1. d4 d5) e5')).toBe('1. e4 e5')
  })

  it('strips nested variations', () => {
    expect(cleanPgn('1. e4 (1. d4 (1. c4 e5) d5) e5')).toBe('1. e4 e5')
  })

  it('strips combined comments, NAGs, and variations', () => {
    expect(cleanPgn('1. e4 {book} $3 (1. d4) e5 {[%clk 0:09:55]}')).toBe('1. e4 e5')
  })

  it('returns empty string for empty input', () => {
    expect(cleanPgn('')).toBe('')
  })

  it('returns empty string for whitespace-only input', () => {
    expect(cleanPgn('   ')).toBe('')
  })

  it('handles malformed PGN with unclosed paren without looping', () => {
    const result = cleanPgn('1. e4 (1. d4 e5')
    expect(typeof result).toBe('string')  // just verify it terminates
  })

  it('strips multiple adjacent comments', () => {
    expect(cleanPgn('1. e4 {a} {b} {c} e5')).toBe('1. e4 e5')
  })
})
