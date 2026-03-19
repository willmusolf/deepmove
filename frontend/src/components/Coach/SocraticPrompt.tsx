// SocraticPrompt.tsx — Think First mode blunder-check checklist
// MVP scope: only the blunder-check habit checklist for TACTICAL_01/02.
// Shows 3 questions before revealing the lesson to build the scanning habit.

interface SocraticPromptProps {
  principleId: string
  onReveal: () => void
}

const BLUNDER_CHECK_QUESTIONS = [
  "What was your opponent threatening after their last move?",
  "After your move, are any of your pieces undefended?",
  "What changed on the board?",
]

export default function SocraticPrompt({ principleId: _pid, onReveal }: SocraticPromptProps) {
  return (
    <div className="socratic-prompt">
      <div className="socratic-prompt__header">
        <span className="socratic-prompt__icon">🔍</span>
        <p className="socratic-prompt__intro">
          Before we look at what happened — run through this checklist:
        </p>
      </div>

      <ol className="socratic-prompt__questions">
        {BLUNDER_CHECK_QUESTIONS.map((q, i) => (
          <li key={i} className="socratic-prompt__question">{q}</li>
        ))}
      </ol>

      <button
        className="socratic-prompt__reveal-btn"
        onClick={onReveal}
        type="button"
      >
        Show me what happened →
      </button>
    </div>
  )
}
