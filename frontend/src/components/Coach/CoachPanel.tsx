// CoachPanel.tsx — Coaching panel alongside the board
// Shows the current lesson (or blunder-check checklist) for the active critical moment.
// Sits on the right side of the board on desktop, below on mobile.

import type { CoachingLesson } from '../../hooks/useCoaching'
import LessonCard from './LessonCard'
import SocraticPrompt from './SocraticPrompt'

interface CoachPanelProps {
  lessons: CoachingLesson[]
  currentIndex: number
  onNavigate: (idx: number) => void
  onReveal: (idx: number) => void
}

export default function CoachPanel({ lessons, currentIndex, onNavigate, onReveal }: CoachPanelProps) {
  const lesson = lessons[currentIndex]
  const total = lessons.length

  if (total === 0) {
    return (
      <div className="coach-panel coach-panel--empty">
        <p className="coach-panel__empty-msg">
          Complete the analysis to see coaching insights.
        </p>
      </div>
    )
  }

  return (
    <div className="coach-panel">
      {/* Navigation header */}
      <div className="coach-panel__nav">
        <button
          className="coach-panel__nav-btn"
          onClick={() => onNavigate(Math.max(0, currentIndex - 1))}
          disabled={currentIndex === 0}
          type="button"
          aria-label="Previous moment"
        >
          ←
        </button>
        <span className="coach-panel__nav-label">
          Critical moment {currentIndex + 1} of {total}
        </span>
        <button
          className="coach-panel__nav-btn"
          onClick={() => onNavigate(Math.min(total - 1, currentIndex + 1))}
          disabled={currentIndex === total - 1}
          type="button"
          aria-label="Next moment"
        >
          →
        </button>
      </div>

      {/* Lesson content */}
      <div className="coach-panel__content">
        {!lesson ? null
          : lesson.isLoading ? (
            <div className="coach-panel__loading">
              <span className="coach-panel__spinner" />
              <p>Coach is thinking…</p>
            </div>
          )
          : lesson.error ? (
            <div className="coach-panel__error">
              <p>Couldn't load lesson. Check your connection and API key.</p>
            </div>
          )
          : !lesson.principleId ? (
            <div className="coach-panel__no-lesson">
              <p className="coach-panel__no-lesson-msg">
                No major coaching moment here — this was a normal position.
              </p>
            </div>
          )
          : lesson.requiresChecklistFirst && !lesson.checklistRevealed ? (
            <SocraticPrompt
              principleId={lesson.principleId}
              onReveal={() => onReveal(currentIndex)}
            />
          )
          : lesson.lessonText ? (
            <LessonCard
              moveNumber={lesson.moment.moveNumber}
              principleName={lesson.principleName}
              confidence={lesson.confidence}
              lessonText={lesson.lessonText}
            />
          )
          : (
            <div className="coach-panel__loading">
              <span className="coach-panel__spinner" />
              <p>Loading lesson…</p>
            </div>
          )
        }
      </div>
    </div>
  )
}
