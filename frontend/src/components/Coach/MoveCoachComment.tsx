// MoveCoachComment.tsx — Coach comment box shown in the Coach tab above the move list.
// Updates as the user steps through moves. Shows a short blurb for every move,
// and the full lesson card for critical moments.

import type { CoachingLesson, MoveComment } from '../../hooks/useCoaching'
import { gradeToComment } from '../../hooks/useCoaching'
import type { MoveGrade } from '../../engine/analysis'
import { CATEGORIES } from '../../chess/taxonomy'

interface MoveCoachCommentProps {
  moveComments: MoveComment[]
  lessons: CoachingLesson[]
  /** 1-based move index from the game review (0 = start position) */
  currentMoveIndex: number
  /** When set, the user is on a branch move — show a simple grade blurb instead of main-line coaching */
  branchComment?: { grade: MoveGrade; san: string } | null
}

export default function MoveCoachComment({ moveComments, lessons, currentMoveIndex, branchComment }: MoveCoachCommentProps) {
  if (branchComment) {
    return (
      <div className="move-coach-comment">
        <p className="move-coach-comment__text">{gradeToComment(branchComment.grade, branchComment.san)}</p>
      </div>
    )
  }

  if (currentMoveIndex === 0 || moveComments.length === 0) {
    return (
      <div className="move-coach-comment move-coach-comment--idle">
        <p className="move-coach-comment__idle-text">Step through the game to see coaching feedback.</p>
      </div>
    )
  }

  // moveComments is 0-based, currentMoveIndex is 1-based
  const mc = moveComments[currentMoveIndex - 1]
  if (!mc) return null

  const lesson = mc.lessonIdx !== null ? lessons[mc.lessonIdx] : null
  const categoryColor = lesson?.category ? CATEGORIES[lesson.category]?.color : undefined
  const hasLesson = lesson && (lesson.isLoading || lesson.lessonText || lesson.error)

  return (
    <div className={`move-coach-comment${hasLesson ? ' move-coach-comment--critical' : ''}`}>
      {/* Category badge for critical moves */}
      {lesson?.categoryName && (
        <span
          className="move-coach-comment__badge"
          style={categoryColor ? { color: categoryColor, borderColor: categoryColor } : undefined}
        >
          {lesson.categoryName}
        </span>
      )}

      {/* Short comment / description */}
      {mc.comment && (
        <p className="move-coach-comment__text">{mc.comment}</p>
      )}

      {/* Full lesson for critical moments */}
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
