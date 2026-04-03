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

  // Active dot = the last lesson whose half-move index is <= currentMoveIndex.
  // Before any lesson move, no dot is active (-1).
  const activeDotIdx = useMemo(() => {
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
              key={i}
              className={`lesson-dot${isActive ? ' lesson-dot--active' : ''}`}
              style={isActive ? { borderColor: cat.color, color: cat.color } as React.CSSProperties : undefined}
              onClick={() => onGoToLesson(lessonIndices[i])}
              title={`${cat.name} — Move ${lesson.moment.moveNumber}`}
            >
              {lesson.isLoading ? '·' : i + 1}
            </button>
          )
        })}
      </div>

    </div>
  )
}
