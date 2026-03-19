// LessonCard.tsx — 5-step coaching lesson card
// Displays the LLM-generated lesson text.
// The LLM is instructed to format with "Step N:" labels — we parse and render them.

interface LessonCardProps {
  moveNumber: number
  principleName: string | null
  confidence: number
  lessonText: string
}

/** Split "Step 1: ...\nStep 2: ..." into labeled sections */
function parseSteps(text: string): { label: string; content: string }[] {
  const stepRegex = /Step\s+(\d+)\s*:/gi
  const parts: { label: string; content: string }[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  const matches: Array<{ index: number; num: string }> = []
  // Reset lastIndex since we use exec in a loop
  stepRegex.lastIndex = 0
  while ((match = stepRegex.exec(text)) !== null) {
    matches.push({ index: match.index, num: match[1] })
  }

  if (matches.length === 0) {
    // No step markers — just show raw text
    return [{ label: '', content: text.trim() }]
  }

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length
    const fullChunk = text.slice(start, end)
    const colonIdx = fullChunk.indexOf(':')
    const content = colonIdx >= 0 ? fullChunk.slice(colonIdx + 1).trim() : fullChunk.trim()
    parts.push({ label: `Step ${matches[i].num}`, content })
  }

  void lastIndex
  return parts
}

const STEP_ICONS = ['🎯', '⚠️', '📖', '📌', '✅']

export default function LessonCard({ moveNumber, principleName, confidence, lessonText }: LessonCardProps) {
  const steps = parseSteps(lessonText)
  const showStepIcons = steps.length > 1

  return (
    <div className="lesson-card">
      <div className="lesson-card__header">
        <span className="lesson-card__move">Move {moveNumber}</span>
        {principleName && (
          <span className="lesson-card__principle">{principleName}</span>
        )}
        {confidence >= 70 && (
          <span className="lesson-card__confidence" title={`Classifier confidence: ${confidence}%`}>
            {confidence >= 90 ? '●●●' : confidence >= 80 ? '●●○' : '●○○'}
          </span>
        )}
      </div>

      <div className="lesson-card__steps">
        {steps.map((step, i) => (
          <div key={i} className="lesson-card__step">
            {showStepIcons && (
              <span className="lesson-card__step-icon" aria-hidden="true">
                {STEP_ICONS[i] ?? '•'}
              </span>
            )}
            <p className="lesson-card__step-text">{step.content}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
