import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { ITALIAN_GAME_COURSE } from './practice'

describe('ITALIAN_GAME_COURSE', () => {
  it('builds a usable pilot course with chapters, lines, and practice positions', () => {
    expect(ITALIAN_GAME_COURSE.name).toBe('Italian Game')
    expect(ITALIAN_GAME_COURSE.chapters.length).toBe(3)
    expect(ITALIAN_GAME_COURSE.totalLines).toBe(8)
    expect(ITALIAN_GAME_COURSE.totalPracticePositions).toBeGreaterThan(20)
  })

  it('keeps every target move legal from the stored practice position', () => {
    for (const chapter of ITALIAN_GAME_COURSE.chapters) {
      for (const line of chapter.lines) {
        for (const position of line.practicePositions) {
          const chess = new Chess(position.fen)
          const move = chess.move(position.targetMove.san)
          expect(move, `${line.id} failed on ${position.targetMove.san}`).not.toBeNull()
        }
      }
    }
  })

  it('starts the course with the Italian bishop coming to c4', () => {
    const firstLine = ITALIAN_GAME_COURSE.chapters[0].lines[0]
    const bishopDevelopment = firstLine.practicePositions.find((position) => position.targetMove.san === 'Bc4')

    expect(bishopDevelopment).toBeDefined()
    expect(bishopDevelopment?.historySan).toEqual(['e4', 'e5', 'Nf3', 'Nc6'])
  })
})
