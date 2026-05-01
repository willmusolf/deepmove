export default function AboutPage() {
  return (
    <div className="about-page">
      <div className="about-page__content">
        <div className="about-page__hero">
          <h1>DeepMove</h1>
          <p className="about-page__tagline">AI chess coaching, free for everyone.</p>
        </div>

        <section className="about-page__section">
          <h2>Our Goal</h2>
          <p>
            Most chess tools are either expensive, locked behind subscriptions, or just not that useful.
            DeepMove is built to be the exception — a genuinely powerful improvement tool that's free to use.
            Import your games, understand your mistakes, and actually get better.
          </p>
        </section>

        <section className="about-page__section">
          <h2>How It Works</h2>
          <ol className="about-page__steps">
            <li>
              <span className="about-page__step-num">1</span>
              <div>
                <strong>Import your games</strong>
                <p>Connect your Chess.com or Lichess account and pull in your recent games in seconds.</p>
              </div>
            </li>
            <li>
              <span className="about-page__step-num">2</span>
              <div>
                <strong>Deep analysis</strong>
                <p>Stockfish 18 analyzes every position to depth 25, grading each move and finding the best alternatives.</p>
              </div>
            </li>
            <li>
              <span className="about-page__step-num">3</span>
              <div>
                <strong>Get coaching lessons</strong>
                <p>Claude AI turns your critical moments into plain-English coaching — explaining not just what went wrong, but why.</p>
              </div>
            </li>
          </ol>
        </section>

        <section className="about-page__section">
          <h2>Features</h2>
          <ul className="about-page__features">
            <li><strong>Game Review</strong> — Replay any game with eval bar, best-move arrows, and graded moves.</li>
            <li><strong>Play vs Bot</strong> — Practice against an engine tuned to any Elo, with full premove support and post-game review.</li>
            <li><strong>AI Coaching</strong> — Personalized lessons on your most important mistakes, generated on-demand.</li>
            <li><strong>Practice</strong> — Opening and tactic drills built from your own games. <em>Coming soon.</em></li>
          </ul>
        </section>

        <section className="about-page__section">
          <h2>Built With</h2>
          <p>
            DeepMove is powered by <strong>Stockfish 18</strong> for engine analysis and <strong>Claude AI</strong> (Anthropic)
            for coaching lessons. The frontend is React + TypeScript; the backend is Python + FastAPI.
          </p>
        </section>

        <section className="about-page__section">
          <h2>Contact</h2>
          <p>
            Questions, feedback, or bug reports? Reach us at{' '}
            <a href="mailto:hello@deepmove.io">hello@deepmove.io</a>.
          </p>
        </section>
      </div>
    </div>
  )
}
