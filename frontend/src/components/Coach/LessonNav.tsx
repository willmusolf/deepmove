// LessonNav.tsx — Compact lesson dot row for the Coach tab.

import { useMemo } from 'react'
import type { CoachingLesson } from '../../hooks/useCoaching'
import { CATEGORIES } from '../../chess/taxonomy'

interface LessonNavProps {
  lessons: CoachingLesson[]
  currentMoveIndex: number
  onGoToLesson: (halfMoveIndex: number) => void
}

export default function LessonNav({ lessons, currentMoveIndex, onGoToLesson }: LessonNavProps) {
  // Convert each lesson's chess move number + color to a 1-based half-move index
  const lessonIndices = useMemo(
    () =>
      lessons.map(
        l => (l.moment.moveNumber - 1) * 2 + (l.moment.color === 'white' ? 1 : 2)
      ),
    [lessons]
  )

  // Active dot = the lesson whose half-move index exactly matches currentMoveIndex.
  // If no exact match, fall back to the last lesson before the current position.
  const activeDotIdx = useMemo(() => {
    const exact = lessonIndices.indexOf(currentMoveIndex)
    if (exact !== -1) return exact
    let active = -1
    for (let i = 0; i < lessonIndices.length; i++) {
      if (lessonIndices[i] <= currentMoveIndex) active = i
    }
    return active
  }, [lessonIndices, currentMoveIndex])

  return (
    <div className="lesson-nav">
      <span className="lesson-nav__label">Lessons:</span>
      <div className="lesson-dots">
        {lessons.map((lesson, i) => {
          const cat = CATEGORIES[lesson.category ?? 'unknown'] ?? CATEGORIES['unknown']
          const isActive = i === activeDotIdx
          return (
            <button
              key={`${lesson.moment.moveNumber}:${lesson.moment.color}`}
              className={`lesson-dot${isActive ? ' lesson-dot--active' : ''}${lesson.isLoading ? ' lesson-dot--loading' : ''}`}
              style={isActive ? { borderColor: cat.color, color: cat.color } as React.CSSProperties : undefined}
              onClick={() => onGoToLesson(lessonIndices[i])}
              title={`${cat.name} — Move ${lesson.moment.moveNumber}`}
            >
              {i + 1}
            </button>
          )
        })}
      </div>

    </div>
  )
}
