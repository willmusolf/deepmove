import { create } from 'zustand'
import {
  OPENING_PRACTICE_COURSES,
  type OpeningChapter,
  type OpeningCourse,
  type OpeningLine,
  type PracticePosition,
  type PracticeStage,
} from '../chess/practice'

export const PRACTICE_STORAGE_KEY = 'deepmove_practice'

export interface PracticePositionProgress {
  attempts: number
  completed: boolean
  stage: PracticeStage
  lastPracticedAt: number | null
}

export type PracticePositionProgressMap = Record<string, PracticePositionProgress>

export interface PracticeProgressSummary {
  total: number
  solved: number
  inProgress: number
  remaining: number
}

interface PracticePersistedState {
  selectedCourseId: string
  selectedChapterId: string
  selectedLineId: string
  currentStepIndex: number
  positionProgress: PracticePositionProgressMap
}

interface PracticeState extends PracticePersistedState {
  selectCourse: (courseId: string) => void
  selectChapter: (chapterId: string) => void
  selectLine: (lineId: string) => void
  setCurrentStepIndex: (stepIndex: number) => void
  recordAttempt: (positionId: string, isCorrect: boolean) => void
  markPositionRevealed: (positionId: string) => void
}

function isPracticeStage(value: unknown): value is PracticeStage {
  return value === 'new' || value === 'learning' || value === 'review' || value === 'mastered'
}

function getDefaultCourse(): OpeningCourse | null {
  return OPENING_PRACTICE_COURSES[0] ?? null
}

function getDefaultPracticeState(): PracticePersistedState {
  const course = getDefaultCourse()
  const chapter = course?.chapters[0] ?? null
  const line = chapter?.lines[0] ?? null

  return {
    selectedCourseId: course?.id ?? '',
    selectedChapterId: chapter?.id ?? '',
    selectedLineId: line?.id ?? '',
    currentStepIndex: 0,
    positionProgress: {},
  }
}

function findCourse(courseId: string): OpeningCourse | null {
  return OPENING_PRACTICE_COURSES.find((course) => course.id === courseId) ?? getDefaultCourse()
}

function findChapter(course: OpeningCourse | null, chapterId: string): OpeningChapter | null {
  if (!course) return null
  return course.chapters.find((chapter) => chapter.id === chapterId) ?? course.chapters[0] ?? null
}

function findLine(chapter: OpeningChapter | null, lineId: string): OpeningLine | null {
  if (!chapter) return null
  return chapter.lines.find((line) => line.id === lineId) ?? chapter.lines[0] ?? null
}

function clampStepIndex(stepIndex: number, line: OpeningLine | null): number {
  if (!line || line.practicePositions.length === 0) return 0
  const safeStepIndex = Number.isFinite(stepIndex) ? Math.trunc(stepIndex) : 0
  return Math.min(Math.max(safeStepIndex, 0), line.practicePositions.length - 1)
}

function sanitizePositionProgressMap(value: unknown): PracticePositionProgressMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  return Object.fromEntries(
    Object.entries(value).flatMap(([positionId, rawEntry]) => {
      if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) return []

      const entry = rawEntry as Partial<PracticePositionProgress>
      const attempts = typeof entry.attempts === 'number' && entry.attempts > 0 ? Math.trunc(entry.attempts) : 0
      const completed = entry.completed === true
      const stage = isPracticeStage(entry.stage)
        ? entry.stage
        : completed
          ? 'mastered'
          : attempts > 0
            ? 'learning'
            : 'new'
      const lastPracticedAt = typeof entry.lastPracticedAt === 'number' ? entry.lastPracticedAt : null

      return [[positionId, {
        attempts,
        completed,
        stage,
        lastPracticedAt,
      }]]
    }),
  )
}

function resolvePracticeState(state: PracticePersistedState): PracticePersistedState {
  const course = findCourse(state.selectedCourseId)
  const chapter = findChapter(course, state.selectedChapterId)
  const line = findLine(chapter, state.selectedLineId)

  return {
    selectedCourseId: course?.id ?? '',
    selectedChapterId: chapter?.id ?? '',
    selectedLineId: line?.id ?? '',
    currentStepIndex: clampStepIndex(state.currentStepIndex, line),
    positionProgress: state.positionProgress,
  }
}

function loadPracticeState(): PracticePersistedState {
  const defaults = getDefaultPracticeState()

  try {
    const saved = localStorage.getItem(PRACTICE_STORAGE_KEY)
    if (!saved) return defaults

    const parsed = JSON.parse(saved) as Partial<PracticePersistedState>
    return resolvePracticeState({
      selectedCourseId: typeof parsed.selectedCourseId === 'string' ? parsed.selectedCourseId : defaults.selectedCourseId,
      selectedChapterId: typeof parsed.selectedChapterId === 'string' ? parsed.selectedChapterId : defaults.selectedChapterId,
      selectedLineId: typeof parsed.selectedLineId === 'string' ? parsed.selectedLineId : defaults.selectedLineId,
      currentStepIndex: typeof parsed.currentStepIndex === 'number' ? parsed.currentStepIndex : defaults.currentStepIndex,
      positionProgress: sanitizePositionProgressMap(parsed.positionProgress),
    })
  } catch {
    return defaults
  }
}

function toPersistedState(state: PracticeState): PracticePersistedState {
  return {
    selectedCourseId: state.selectedCourseId,
    selectedChapterId: state.selectedChapterId,
    selectedLineId: state.selectedLineId,
    currentStepIndex: state.currentStepIndex,
    positionProgress: state.positionProgress,
  }
}

function persistPracticeState(state: PracticePersistedState) {
  localStorage.setItem(PRACTICE_STORAGE_KEY, JSON.stringify(state))
}

function buildProgressUpdate(
  progress: PracticePositionProgress | undefined,
  updateType: 'correct' | 'incorrect' | 'revealed',
): PracticePositionProgress {
  const attempts = (progress?.attempts ?? 0) + 1
  const completed = updateType === 'correct' ? true : progress?.completed === true

  let stage: PracticeStage = 'new'
  if (updateType === 'correct') {
    stage = 'mastered'
  } else if (updateType === 'revealed') {
    stage = 'review'
  } else {
    stage = progress?.completed ? 'review' : 'learning'
  }

  return {
    attempts,
    completed,
    stage,
    lastPracticedAt: Date.now(),
  }
}

export function summarizePracticeProgress(
  positions: PracticePosition[],
  progress: PracticePositionProgressMap,
): PracticeProgressSummary {
  const summary = positions.reduce((counts, position) => {
    const entry = progress[position.id]

    if (entry?.completed) {
      counts.solved += 1
      return counts
    }

    if (entry && entry.stage !== 'new') {
      counts.inProgress += 1
      return counts
    }

    counts.remaining += 1
    return counts
  }, { solved: 0, inProgress: 0, remaining: 0 })

  return {
    total: positions.length,
    solved: summary.solved,
    inProgress: summary.inProgress,
    remaining: summary.remaining,
  }
}

const initialState = loadPracticeState()

export const usePracticeStore = create<PracticeState>((set, get) => ({
  ...initialState,

  selectCourse: (courseId) => {
    const nextState = resolvePracticeState({
      ...toPersistedState(get()),
      selectedCourseId: courseId,
      selectedChapterId: '',
      selectedLineId: '',
      currentStepIndex: 0,
    })
    set(nextState)
    persistPracticeState(nextState)
  },

  selectChapter: (chapterId) => {
    const nextState = resolvePracticeState({
      ...toPersistedState(get()),
      selectedChapterId: chapterId,
      selectedLineId: '',
      currentStepIndex: 0,
    })
    set(nextState)
    persistPracticeState(nextState)
  },

  selectLine: (lineId) => {
    const nextState = resolvePracticeState({
      ...toPersistedState(get()),
      selectedLineId: lineId,
      currentStepIndex: 0,
    })
    set(nextState)
    persistPracticeState(nextState)
  },

  setCurrentStepIndex: (currentStepIndex) => {
    const nextState = resolvePracticeState({
      ...toPersistedState(get()),
      currentStepIndex,
    })
    set(nextState)
    persistPracticeState(nextState)
  },

  recordAttempt: (positionId, isCorrect) => {
    const currentState = toPersistedState(get())
    const positionProgress = {
      ...currentState.positionProgress,
      [positionId]: buildProgressUpdate(currentState.positionProgress[positionId], isCorrect ? 'correct' : 'incorrect'),
    }

    set({ positionProgress })
    persistPracticeState({ ...currentState, positionProgress })
  },

  markPositionRevealed: (positionId) => {
    const currentState = toPersistedState(get())
    const positionProgress = {
      ...currentState.positionProgress,
      [positionId]: buildProgressUpdate(currentState.positionProgress[positionId], 'revealed'),
    }

    set({ positionProgress })
    persistPracticeState({ ...currentState, positionProgress })
  },
}))
