import { useEffect, useRef } from 'react'
import type { MoveGrade } from '../../engine/analysis'

interface MoveListProps {
  moves: string[]
  moveGrades: (MoveGrade | undefined)[]  // grade per move (undefined = not yet analyzed)
  currentMoveIndex: number
  onMoveClick: (index: number) => void
}

// Badge config: label, CSS class
const GRADE_CONFIG: Record<NonNullable<MoveGrade>, { label: string; cls: string }> = {
  brilliant:  { label: '!!', cls: 'grade-brilliant' },
  best:       { label: '★',  cls: 'grade-best' },
  excellent:  { label: '^^', cls: 'grade-excellent' },
  good:       { label: '✓',  cls: 'grade-good' },
  inaccuracy: { label: '?!', cls: 'grade-inaccuracy' },
  mistake:    { label: '?',  cls: 'grade-mistake' },
  blunder:    { label: '??', cls: 'grade-blunder' },
  forced:     { label: '→',  cls: 'grade-forced' },
}

function GradeBadge({ grade }: { grade: MoveGrade | undefined }) {
  if (!grade) return <span className="grade-placeholder" />
  const cfg = GRADE_CONFIG[grade]
  return <span className={`move-grade ${cfg.cls}`}>{cfg.label}</span>
}

export default function MoveList({
  moves,
  moveGrades,
  currentMoveIndex,
  onMoveClick
}: MoveListProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current.querySelector<HTMLElement>(
      `[data-move-index="${currentMoveIndex}"]`
    )
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [currentMoveIndex])

  const movePairs: Array<[string, string | null]> = []
  for (let i = 0; i < moves.length; i += 2) {
    movePairs.push([moves[i], moves[i + 1] ?? null])
  }

  return (
    <div className="move-list" ref={containerRef}>
      {movePairs.map(([white, black], pairIndex) => {
        const moveNumber = pairIndex + 1
        const whiteIndex = pairIndex * 2 + 1
        const blackIndex = pairIndex * 2 + 2

        return (
          <div key={moveNumber} className="move-pair">
            <span className="move-number">{moveNumber}.</span>
            <span
              className={`move-san${currentMoveIndex === whiteIndex ? ' move-active' : ''}`}
              data-move-index={whiteIndex}
              onClick={() => onMoveClick(whiteIndex)}
            >
              {white}
            </span>
            <GradeBadge grade={moveGrades[whiteIndex - 1]} />
            {black !== null ? (
              <>
                <span
                  className={`move-san${currentMoveIndex === blackIndex ? ' move-active' : ''}`}
                  data-move-index={blackIndex}
                  onClick={() => onMoveClick(blackIndex)}
                >
                  {black}
                </span>
                <GradeBadge grade={moveGrades[blackIndex - 1]} />
              </>
            ) : (
              <span className="move-san move-placeholder" />
            )}
          </div>
        )
      })}
    </div>
  )
}
