import type { MoveGrade } from '../../engine/analysis'

export type KnownMoveGrade = NonNullable<MoveGrade>
type BadgeVariant = 'move-list' | 'board' | 'report'
type BadgeGlyph = 'double-bang' | 'bang' | 'star' | 'check' | 'thumb' | 'question-bang' | 'question' | 'double-question' | 'x' | 'arrow'

type GradeBadgeMeta = {
  boardColor: string
  moveListClass: string
  reportClass: string
  glyph: BadgeGlyph
  ariaLabel: string
}

export const GRADE_BADGE_CONFIG: Record<KnownMoveGrade, GradeBadgeMeta> = {
  brilliant:  { glyph: 'double-bang',    boardColor: '#93c5fd', moveListClass: 'grade-brilliant',  reportClass: 'gr-brilliant',  ariaLabel: 'Brilliant move' },
  great:      { glyph: 'bang',           boardColor: '#3b82f6', moveListClass: 'grade-great',      reportClass: 'gr-great',      ariaLabel: 'Great move' },
  best:       { glyph: 'star',           boardColor: '#22c55e', moveListClass: 'grade-best',       reportClass: 'gr-best',       ariaLabel: 'Best move' },
  excellent:  { glyph: 'check',          boardColor: '#4ade80', moveListClass: 'grade-excellent',  reportClass: 'gr-excellent',  ariaLabel: 'Excellent move' },
  good:       { glyph: 'thumb',          boardColor: '#22c55e', moveListClass: 'grade-good',       reportClass: 'gr-good',       ariaLabel: 'Good move' },
  inaccuracy: { glyph: 'question-bang',  boardColor: '#facc15', moveListClass: 'grade-inaccuracy', reportClass: 'gr-inaccuracy', ariaLabel: 'Inaccuracy' },
  mistake:    { glyph: 'question',       boardColor: '#fb923c', moveListClass: 'grade-mistake',    reportClass: 'gr-mistake',    ariaLabel: 'Mistake' },
  blunder:    { glyph: 'double-question', boardColor: '#ef4444', moveListClass: 'grade-blunder',   reportClass: 'gr-blunder',    ariaLabel: 'Blunder' },
  miss:       { glyph: 'x',              boardColor: '#a78bfa', moveListClass: 'grade-miss',       reportClass: 'gr-miss',       ariaLabel: 'Missed opportunity' },
  forced:     { glyph: 'arrow',          boardColor: '#6b7280', moveListClass: 'grade-forced',     reportClass: 'gr-forced',     ariaLabel: 'Forced move' },
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

function TextBadgeIcon({
  className,
  text,
  fontSize,
  letterSpacing,
}: {
  className: string
  text: string
  fontSize: number
  letterSpacing?: number
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
    >
      <text
        x="12"
        y="12.4"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="currentColor"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize={fontSize}
        fontWeight="900"
        letterSpacing={letterSpacing}
      >
        {text}
      </text>
    </svg>
  )
}

function StarIcon({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.75 14.78 8.38l6.22.9-4.5 4.38 1.06 6.19L12 16.9l-5.56 2.95 1.06-6.19-4.5-4.38 6.22-.9L12 2.75Z" />
    </svg>
  )
}

function CheckIcon({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
      <path
        d="M5.75 12.5 9.55 16.3 18.25 7.7"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function XIcon({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
      <path
        d="M7.25 7.25 16.75 16.75M16.75 7.25 7.25 16.75"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

function ArrowIcon({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
      <path
        d="M5.5 12h11m-4-4 4 4-4 4"
        stroke="currentColor"
        strokeWidth="2.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function BadgeSymbolIcon({ className, glyph }: { className: string; glyph: BadgeGlyph }) {
  switch (glyph) {
    case 'thumb':
      return <ThumbsUpIcon className={className} />
    case 'star':
      return <StarIcon className={className} />
    case 'check':
      return <CheckIcon className={className} />
    case 'x':
      return <XIcon className={className} />
    case 'arrow':
      return <ArrowIcon className={className} />
    case 'bang':
      return <TextBadgeIcon className={className} text="!" fontSize={17} />
    case 'double-bang':
      return <TextBadgeIcon className={className} text="!!" fontSize={13.5} letterSpacing={-0.5} />
    case 'question-bang':
      return <TextBadgeIcon className={className} text="?!" fontSize={13.5} letterSpacing={-0.4} />
    case 'question':
      return <TextBadgeIcon className={className} text="?" fontSize={17} />
    case 'double-question':
      return <TextBadgeIcon className={className} text="??" fontSize={13.5} letterSpacing={-0.5} />
  }
}

function getBadgeGlyphClassName(variant: BadgeVariant): string {
  if (variant === 'board') return 'board-grade-badge__icon'
  if (variant === 'report') return 'game-report-pill__icon'
  return 'move-grade__icon'
}

export function renderGradeBadgeGlyph(
  grade: MoveGrade | null | undefined,
  variant: BadgeVariant = 'move-list',
) {
  const meta = getGradeBadgeMeta(grade)
  if (!meta) return null
  return <BadgeSymbolIcon className={getBadgeGlyphClassName(variant)} glyph={meta.glyph} />
}
