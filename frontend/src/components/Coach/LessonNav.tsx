// LessonNav.tsx — Small lesson indicator dots in the corner of the coach box.
// Compact: just numbered dots that show which lessons exist and let you jump to them.

import { useMemo } from 'react'
import type { CoachingLesson } from '../../hooks/useCoaching'
import { CATEGORIES } from '../../chess/taxonomy'

interface LessonNavProps {
  lessons: CoachingLesson[]
  currentMoveIndex: number
  onGoToLesson: (halfMoveIndex: number) => void
}

export default function LessonNav({ lessons, currentMoveIndex, onGoToLesson }: LessonNavProps) {
  const lessonIndices = useMemo(
    () => lessons.map(l => (l.moment.moveNumber - 1) * 2 + (l.moment.color === 'white' ? 1 : 2)),
    [lessons]
  )

  const activePillIdx = useMemo(() => {
    if (lessonIndices.length === 0) return -1
    return lessonIndices.reduce(
      (best, idx, i) =>
        Math.abs(idx - currentMoveIndex) < Math.abs(lessonIndices[best] - currentMoveIndex) ? i : best,
      0
    )
  }, [lessonIndices, currentMoveIndex])

  return (
    <div className="lesson-dots">
      {lessons.map((lesson, i) => {
        const cat = CATEGORIES[lesson.category ?? 'unknown'] ?? CATEGORIES['unknown']
        const isActive = i === activePillIdx && currentMoveIndex > 0
        return (
          <button
            key={i}
            className={`lesson-dot${isActive ? ' lesson-dot--active' : ''}`}
            style={{ '--dot-color': cat.color } as React.CSSProperties}
            onClick={() => onGoToLesson(lessonIndices[i])}
            title={`Lesson ${i + 1}: ${cat.name} (move ${lesson.moment.moveNumber})`}
          >
            {lesson.isLoading ? (
              <span className="lesson-dot__spinner" />
            ) : (
              <span className="lesson-dot__num">{i + 1}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
