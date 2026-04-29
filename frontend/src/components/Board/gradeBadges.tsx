import type { MoveGrade } from '../../engine/analysis'

export type KnownMoveGrade = NonNullable<MoveGrade>

type GradeBadgeMeta = {
  boardColor: string
  moveListClass: string
  reportClass: string
  symbol?: string
  icon?: 'thumb'
  ariaLabel: string
}

export const GRADE_BADGE_CONFIG: Record<KnownMoveGrade, GradeBadgeMeta> = {
  brilliant:  { symbol: '!!', boardColor: '#93c5fd', moveListClass: 'grade-brilliant',  reportClass: 'gr-brilliant',  ariaLabel: 'Brilliant move' },
  great:      { symbol: '!',  boardColor: '#3b82f6', moveListClass: 'grade-great',      reportClass: 'gr-great',      ariaLabel: 'Great move' },
  best:       { symbol: '★',  boardColor: '#22c55e', moveListClass: 'grade-best',       reportClass: 'gr-best',       ariaLabel: 'Best move' },
  excellent:  { symbol: '✓',  boardColor: '#4ade80', moveListClass: 'grade-excellent',  reportClass: 'gr-excellent',  ariaLabel: 'Excellent move' },
  good:       { icon: 'thumb', boardColor: '#22c55e', moveListClass: 'grade-good',      reportClass: 'gr-good',       ariaLabel: 'Good move' },
  inaccuracy: { symbol: '?!', boardColor: '#facc15', moveListClass: 'grade-inaccuracy', reportClass: 'gr-inaccuracy', ariaLabel: 'Inaccuracy' },
  mistake:    { symbol: '?',  boardColor: '#fb923c', moveListClass: 'grade-mistake',    reportClass: 'gr-mistake',    ariaLabel: 'Mistake' },
  blunder:    { symbol: '??', boardColor: '#ef4444', moveListClass: 'grade-blunder',    reportClass: 'gr-blunder',    ariaLabel: 'Blunder' },
  miss:       { symbol: '✗',  boardColor: '#a78bfa', moveListClass: 'grade-miss',       reportClass: 'gr-miss',       ariaLabel: 'Missed opportunity' },
  forced:     { symbol: '→',  boardColor: '#6b7280', moveListClass: 'grade-forced',     reportClass: 'gr-forced',     ariaLabel: 'Forced move' },
}

export function getGradeBadgeMeta(grade: MoveGrade | null | undefined): GradeBadgeMeta | null {
  if (!grade) return null
  return grade in GRADE_BADGE_CONFIG
    ? GRADE_BADGE_CONFIG[grade as KnownMoveGrade]
    : null
}

function ThumbsUpIcon({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M2.25 10.5A.75.75 0 0 1 3 9.75h2.25A.75.75 0 0 1 6 10.5v8.25a.75.75 0 0 1-.75.75H3a.75.75 0 0 1-.75-.75V10.5Zm5.25-.441V18A1.5 1.5 0 0 0 9 19.5h6.75a1.5 1.5 0 0 0 1.48-1.252l1.125-6.75A1.5 1.5 0 0 0 16.875 9H13.5V5.25a1.5 1.5 0 0 0-2.58-1.06L7.5 10.06Z" />
    </svg>
  )
}

export function renderGradeBadgeGlyph(
  grade: MoveGrade | null | undefined,
  variant: 'move-list' | 'board' | 'report' = 'move-list',
) {
  const meta = getGradeBadgeMeta(grade)
  if (!meta) return null
  if (meta.icon !== 'thumb') {
    const className =
      variant === 'board'
        ? 'board-grade-badge__glyph'
        : variant === 'report'
          ? 'game-report-pill__glyph'
          : 'move-grade__glyph'

    return (
      <span aria-hidden="true" className={className} data-grade={grade ?? ''}>
        {meta.symbol ?? null}
      </span>
    )
  }

  const className =
    variant === 'board'
      ? 'board-grade-badge__icon'
      : variant === 'report'
        ? 'game-report-pill__icon'
        : 'move-grade__icon'

  return <ThumbsUpIcon className={className} />
}
