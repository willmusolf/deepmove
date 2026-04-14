import type { Color } from '../types'

export type PracticeStage = 'new' | 'learning' | 'review' | 'mastered'
export type CourseCategory = 'opening' | 'gambit' | 'defense'

export interface AcceptedAlternative {
  san: string
  message: string
}

export interface AuthoredCourseMove {
  san: string
  explanation: string
  acceptedAlternatives?: AcceptedAlternative[]
}

export interface AuthoredOpeningLine {
  id: string
  title: string
  summary: string
  moves: AuthoredCourseMove[]
}

export interface OpeningChapterDraft {
  id: string
  title: string
  summary: string
  lines: AuthoredOpeningLine[]
}

export interface OpeningCourseDraft {
  id: string
  slug: string
  name: string
  subtitle: string
  description: string
  studyAs: Color
  category: CourseCategory
  family: string
  tags: string[]
  chapters: OpeningChapterDraft[]
}

export interface PracticePosition {
  id: string
  courseId: string
  chapterId: string
  lineId: string
  lineTitle: string
  plyIndex: number
  moveNumber: number
  sideToMove: Color
  fen: string
  historySan: string[]
  targetMove: AuthoredCourseMove
}

export interface OpeningLine extends AuthoredOpeningLine {
  practicePositions: PracticePosition[]
}

export interface OpeningChapter extends Omit<OpeningChapterDraft, 'lines'> {
  lines: OpeningLine[]
}

export interface OpeningCourse extends Omit<OpeningCourseDraft, 'chapters'> {
  chapters: OpeningChapter[]
  totalLines: number
  totalPracticePositions: number
}
