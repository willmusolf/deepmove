// LessonCard.tsx — 5-step coaching lesson card
// Displays the LLM-generated lesson in the strict 5-step format:
//   1. Identify the moment
//   2. Ask or highlight
//   3. Name the principle
//   4. Give a concrete rule
//   5. Show what's better and why
//
// Think First mode OFF: shows all 5 steps immediately
// Think First mode ON: managed by SocraticPrompt, this renders after user engagement

interface LessonCardProps {
  moveNumber: number
  principle: string
  lesson: {
    step1: string
    step2: string
    step3: string
    step4: string
    step5: string
  }
}

export default function LessonCard({ moveNumber: _mn, principle: _p, lesson: _l }: LessonCardProps) {
  // TODO (Track C): Render 5-step lesson with proper formatting
  return <div className="lesson-card" />
}
