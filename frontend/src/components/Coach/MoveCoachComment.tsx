// MoveCoachComment.tsx — Coach comment box shown in the Coach tab above the move list.

import type { CoachingLesson, MoveComment } from '../../hooks/useCoaching'
import { gradeToComment } from '../../hooks/useCoaching'
import type { MoveGrade } from '../../engine/analysis'
import { CATEGORIES } from '../../chess/taxonomy'
import LessonNav from './LessonNav'

interface MoveCoachCommentProps {
  moveComments: MoveComment[]
  lessons: CoachingLesson[]
  currentMoveIndex: number
  branchComment?: { grade: MoveGrade; san: string } | null
  inBranch?: boolean
  onGoToMove?: (index: number) => void
  isAnalyzing?: boolean
  analyzedCount?: number
  totalMovesCount?: number
}

export default function MoveCoachComment({
  moveComments,
  lessons,
  currentMoveIndex,
  branchComment,
  inBranch,
  onGoToMove,
  isAnalyzing,
  analyzedCount,
  totalMovesCount,
}: MoveCoachCommentProps) {
  const showNav = lessons.length > 0 && !!onGoToMove

  function nav() {
    if (!showNav) return null
    return <LessonNav lessons={lessons} currentMoveIndex={currentMoveIndex} onGoToLesson={onGoToMove!} />
  }

  if (inBranch) {
    if (branchComment) {
      return (
        <div className="move-coach-comment">
          <div className="move-coach-comment__header">
            <span className="move-coach-comment__header-text">
              {gradeToComment(branchComment.grade, branchComment.san)}
            </span>
            {nav()}
          </div>
        </div>
      )
    }
    return (
      <div className="move-coach-comment move-coach-comment--idle">
        <div className="move-coach-comment__header">
          <span className="move-coach-comment__header-text">Evaluating move…</span>
          {nav()}
        </div>
      </div>
    )
  }

  const analyzingProgress = totalMovesCount && totalMovesCount > 0
    ? ` ${analyzedCount ?? 0} / ${totalMovesCount} moves`
    : ''

  if (currentMoveIndex === 0 || moveComments.length === 0) {
    const idleText = isAnalyzing
      ? `Analyzing your game…${analyzingProgress}`
      : 'Step through the game to see coaching feedback.'
    return (
      <div className="move-coach-comment move-coach-comment--idle">
        <div className="move-coach-comment__header">
          <span className="move-coach-comment__header-text">
            {isAnalyzing && <span className="move-coach-comment__analyzing-dot" />}
            {idleText}
          </span>
          {nav()}
        </div>
      </div>
    )
  }

  const mc = moveComments[currentMoveIndex - 1]
  if (!mc) {
    // Index out of bounds — show idle rather than blank
    return (
      <div className="move-coach-comment move-coach-comment--idle">
        <div className="move-coach-comment__header">
          <span className="move-coach-comment__header-text">Step through the game to see coaching feedback.</span>
          {nav()}
        </div>
      </div>
    )
  }

  const lesson = mc.lessonIdx != null ? lessons[mc.lessonIdx] : null
  const categoryColor = lesson?.category ? CATEGORIES[lesson.category]?.color : undefined
  const hasLesson = lesson && (lesson.isLoading || lesson.lessonText || lesson.error)

  return (
    <div className={`move-coach-comment${hasLesson ? ' move-coach-comment--critical' : ''}`}>
      <div className="move-coach-comment__header">
        <span className="move-coach-comment__header-text">
          {lesson?.categoryName && (
            <span
              className="move-coach-comment__badge"
              style={categoryColor ? { color: categoryColor, borderColor: categoryColor } : undefined}
            >
              {lesson.categoryName}
            </span>
          )}
          {mc.comment}
        </span>
        {nav()}
      </div>

      {hasLesson && (
        <div className="move-coach-comment__lesson">
          {lesson.isLoading ? (
            <p className="move-coach-comment__loading">Loading lesson…</p>
          ) : lesson.error ? (
            <p className="move-coach-comment__error">{lesson.error}</p>
          ) : lesson.lessonText ? (
            <p className="move-coach-comment__lesson-text">{lesson.lessonText}</p>
          ) : null}
        </div>
      )}
    </div>
  )
}
