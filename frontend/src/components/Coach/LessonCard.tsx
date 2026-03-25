// LessonCard.tsx — Coaching lesson display
// Renders the LLM lesson as clean prose — no step labels, no emojis.

interface LessonCardProps {
  moveNumber: number
  principleName: string | null
  confidence: number
  lessonText: string
}

export default function LessonCard({ moveNumber, principleName, lessonText }: LessonCardProps) {
  // Split on double-newlines or sentence boundaries to create readable paragraphs,
  // but keep it simple — just show the text as-is in a clean container.
  const paragraphs = lessonText
    .split(/\n{2,}/)
    .map(p => p.replace(/\n/g, ' ').trim())
    .filter(Boolean)

  return (
    <div className="lesson-card">
      <div className="lesson-card__header">
        <span className="lesson-card__move">Move {moveNumber}</span>
        {principleName && (
          <span className="lesson-card__principle">{principleName}</span>
        )}
      </div>
      <div className="lesson-card__body">
        {paragraphs.map((para, i) => (
          <p key={i} className="lesson-card__para">{para}</p>
        ))}
      </div>
    </div>
  )
}
