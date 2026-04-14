import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ITALIAN_GAME_COURSE } from '../chess/practice'

function createStorageMock(): Storage {
  const store = new Map<string, string>()

  return {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key) {
      return store.get(key) ?? null
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null
    },
    removeItem(key) {
      store.delete(key)
    },
    setItem(key, value) {
      store.set(key, value)
    },
  }
}

describe('practiceStore', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: createStorageMock(),
      configurable: true,
      writable: true,
    })
    localStorage.clear()
    vi.resetModules()
  })

  it('hydrates persisted selection and clamps the current step', async () => {
    const chapter = ITALIAN_GAME_COURSE.chapters[0]
    const line = chapter.lines[0]

    localStorage.setItem('deepmove_practice', JSON.stringify({
      selectedCourseId: ITALIAN_GAME_COURSE.id,
      selectedChapterId: chapter.id,
      selectedLineId: line.id,
      currentStepIndex: 999,
      positionProgress: {},
    }))

    const { usePracticeStore } = await import('./practiceStore')
    const state = usePracticeStore.getState()

    expect(state.selectedCourseId).toBe(ITALIAN_GAME_COURSE.id)
    expect(state.selectedChapterId).toBe(chapter.id)
    expect(state.selectedLineId).toBe(line.id)
    expect(state.currentStepIndex).toBe(line.practicePositions.length - 1)
  })

  it('records progress updates and summarizes course state', async () => {
    const { summarizePracticeProgress, usePracticeStore } = await import('./practiceStore')
    const line = ITALIAN_GAME_COURSE.chapters[0].lines[0]
    const [firstPosition, secondPosition] = line.practicePositions

    usePracticeStore.getState().recordAttempt(firstPosition.id, false)
    usePracticeStore.getState().markPositionRevealed(secondPosition.id)
    usePracticeStore.getState().recordAttempt(firstPosition.id, true)

    const state = usePracticeStore.getState()
    const summary = summarizePracticeProgress(line.practicePositions, state.positionProgress)
    const saved = JSON.parse(localStorage.getItem('deepmove_practice') ?? '{}')

    expect(state.positionProgress[firstPosition.id]).toMatchObject({
      attempts: 2,
      completed: true,
      stage: 'mastered',
    })
    expect(state.positionProgress[secondPosition.id]).toMatchObject({
      attempts: 1,
      completed: false,
      stage: 'review',
    })
    expect(summary).toEqual({
      total: line.practicePositions.length,
      solved: 1,
      inProgress: 1,
      remaining: line.practicePositions.length - 2,
    })
    expect(saved.positionProgress[firstPosition.id].completed).toBe(true)
    expect(saved.positionProgress[secondPosition.id].stage).toBe('review')
  })

  it('resets line and step when changing chapters', async () => {
    const { usePracticeStore } = await import('./practiceStore')
    const targetChapter = ITALIAN_GAME_COURSE.chapters[1]

    usePracticeStore.getState().setCurrentStepIndex(2)
    usePracticeStore.getState().selectChapter(targetChapter.id)

    const state = usePracticeStore.getState()

    expect(state.selectedChapterId).toBe(targetChapter.id)
    expect(state.selectedLineId).toBe(targetChapter.lines[0].id)
    expect(state.currentStepIndex).toBe(0)
  })
})
