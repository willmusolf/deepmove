// CoachPanel.tsx — Coaching panel alongside the board
// Shows lessons immediately at critical moments — no button press required.
// For TACTICAL_01/02 moments, the blunder-check questions appear above the lesson
// as a habit reminder (not a gate).

import { useState } from 'react'
import type { CoachingLesson } from '../../hooks/useCoaching'
import { useAuthStore } from '../../stores/authStore'
import { api } from '../../api/client'
import { CATEGORIES } from '../../chess/taxonomy'
import LessonCard from './LessonCard'

const BLUNDER_CHECK_QUESTIONS = [
  "What was your opponent threatening after their last move?",
  "After your move, are any of your pieces undefended?",
  "What changed on the board?",
]

interface CoachPanelProps {
  lessons: CoachingLesson[]
  currentIndex: number
  onNavigate: (idx: number) => void
  onReveal?: (idx: number) => void
  isAnalyzing?: boolean
}

export default function CoachPanel({ lessons, currentIndex, onNavigate, onReveal: _onReveal, isAnalyzing }: CoachPanelProps) {
  const lesson = lessons[currentIndex]
  const total = lessons.length
  const user = useAuthStore(s => s.user)
  const isAdmin = user?.is_admin ?? false
  const [resetMsg, setResetMsg] = useState('')
  const [resetting, setResetting] = useState(false)

  async function handleResetLessons() {
    setResetting(true)
    setResetMsg('')
    try {
      await api.delete('/admin/games/lessons/all')
      await api.delete('/coaching/cache')
      setResetMsg('Lessons cleared — reload the game to regenerate.')
    } catch {
      setResetMsg('Reset failed — check console.')
    } finally {
      setResetting(false)
    }
  }

  if (total === 0) {
    return (
      <div className="coach-panel coach-panel--empty">
        {isAnalyzing ? (
          <div className="coach-panel__loading">
            <span className="coach-panel__spinner" />
            <p>Analyzing your game...</p>
          </div>
        ) : (
          <p className="coach-panel__empty-msg">
            No major mistakes found in this game. Nice play.
          </p>
        )}
        {isAdmin && (
          <div className="coach-panel__admin">
            <button
              className="coach-panel__reset-btn"
              onClick={handleResetLessons}
              disabled={resetting}
              type="button"
            >
              Reset All Lessons
            </button>
            {resetMsg && <p className="coach-panel__reset-msg">{resetMsg}</p>}
          </div>
        )}
      </div>
    )
  }

  const showChecklist = lesson?.requiresChecklistFirst

  return (
    <div className="coach-panel">
      {/* Navigation header — hidden when there's only 1 moment */}
      {total > 1 && (
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
            Moment {currentIndex + 1} of {total}
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
      )}

      {/* Lesson content */}
      <div className="coach-panel__content">
        {!lesson ? null
          : lesson.isLoading ? (
            <div className="coach-panel__loading">
              <span className="coach-panel__spinner" />
              <p>Loading lesson…</p>
            </div>
          )
          : lesson.error ? (
            <div className="coach-panel__error">
              <p>{lesson.error}</p>
            </div>
          )
          : (
            <>
              {/* Blunder-check habit reminder for tactical moments — shown above lesson, not as a gate */}
              {showChecklist && (
                <div className="coach-panel__checklist">
                  <p className="coach-panel__checklist-label">Before every move, check:</p>
                  <ol className="coach-panel__checklist-questions">
                    {BLUNDER_CHECK_QUESTIONS.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ol>
                </div>
              )}
              {lesson.lessonText ? (
                <LessonCard
                  moveNumber={lesson.moment.moveNumber}
                  categoryName={lesson.categoryName}
                  categoryColor={lesson.category ? CATEGORIES[lesson.category]?.color : undefined}
                  lessonText={lesson.lessonText}
                />
              ) : (
                <div className="coach-panel__loading">
                  <span className="coach-panel__spinner" />
                  <p>Loading lesson…</p>
                </div>
              )}
            </>
          )
        }
      </div>

      {/* Admin tools */}
      {isAdmin && (
        <div className="coach-panel__admin">
          <button
            className="coach-panel__reset-btn"
            onClick={handleResetLessons}
            disabled={resetting}
            type="button"
          >
            {resetting ? 'Resetting…' : 'Reset All Lessons'}
          </button>
          {resetMsg && <p className="coach-panel__reset-msg">{resetMsg}</p>}
        </div>
      )}
    </div>
  )
}
