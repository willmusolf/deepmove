import { Chess } from 'chess.js'
import type {
  AcceptedAlternative,
  AuthoredCourseMove,
  OpeningChapter,
  OpeningCourse,
  OpeningCourseDraft,
  OpeningLine,
  PracticePosition,
} from './types'
import type { Color } from '../types'

function colorFromTurn(turn: 'w' | 'b'): Color {
  return turn === 'w' ? 'white' : 'black'
}

function validateAcceptedAlternative(alternative: AcceptedAlternative, fen: string, context: string) {
  const chess = new Chess(fen)
  const move = chess.move(alternative.san)
  if (!move) {
    throw new Error(`Invalid accepted alternative "${alternative.san}" in ${context}`)
  }
}

function buildPracticePositions(
  courseId: string,
  chapterId: string,
  lineId: string,
  lineTitle: string,
  studyAs: Color,
  moves: AuthoredCourseMove[],
): PracticePosition[] {
  const chess = new Chess()
  const historySan: string[] = []
  const positions: PracticePosition[] = []

  moves.forEach((authoredMove, plyIndex) => {
    const fenBeforeMove = chess.fen()
    const sideToMove = colorFromTurn(chess.turn())
    const context = `${courseId}/${chapterId}/${lineId}/ply-${plyIndex + 1}`

    authoredMove.acceptedAlternatives?.forEach((alternative) => {
      validateAcceptedAlternative(alternative, fenBeforeMove, context)
    })

    const applied = chess.move(authoredMove.san)
    if (!applied) {
      throw new Error(`Invalid SAN "${authoredMove.san}" in ${context}`)
    }

    if (sideToMove === studyAs) {
      positions.push({
        id: `${lineId}:${plyIndex}`,
        courseId,
        chapterId,
        lineId,
        lineTitle,
        plyIndex,
        moveNumber: Math.floor(plyIndex / 2) + 1,
        sideToMove,
        fen: fenBeforeMove,
        historySan: [...historySan],
        targetMove: authoredMove,
      })
    }

    historySan.push(authoredMove.san)
  })

  return positions
}

function buildLine(courseId: string, chapterId: string, studyAs: Color, line: OpeningLine): OpeningLine {
  return {
    ...line,
    practicePositions: buildPracticePositions(courseId, chapterId, line.id, line.title, studyAs, line.moves),
  }
}

export function buildOpeningCourse(draft: OpeningCourseDraft): OpeningCourse {
  const chapters: OpeningChapter[] = draft.chapters.map((chapter) => ({
    ...chapter,
    lines: chapter.lines.map((line) => buildLine(draft.id, chapter.id, draft.studyAs, line as OpeningLine)),
  }))

  const totalLines = chapters.reduce((sum, chapter) => sum + chapter.lines.length, 0)
  const totalPracticePositions = chapters.reduce(
    (sum, chapter) => sum + chapter.lines.reduce((lineSum, line) => lineSum + line.practicePositions.length, 0),
    0,
  )

  return {
    ...draft,
    chapters,
    totalLines,
    totalPracticePositions,
  }
}
