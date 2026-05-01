export default function AboutPage() {
  return (
    <div className="about-page">
      <div className="about-page__content">
        <div className="about-page__hero">
          <h1>DeepMove</h1>
          <p className="about-page__tagline">Serious chess improvement. Actually free.</p>
        </div>

        <section className="about-page__section">
          <p>
            I built DeepMove because I wanted a tool that actually helps you get better —
            not one that teases you with features and then asks for a subscription.
            Every player deserves real feedback on their games, regardless of whether they're paying.
            That's the whole point.
          </p>
        </section>

        <section className="about-page__section">
          <h2>How it works</h2>
          <ol className="about-page__steps">
            <li>
              <span className="about-page__step-num">1</span>
              <div>
                <strong>Import your games</strong>
                <p>Connect Chess.com or Lichess and pull in your recent games instantly.</p>
              </div>
            </li>
            <li>
              <span className="about-page__step-num">2</span>
              <div>
                <strong>Engine analysis</strong>
                <p>Stockfish 18 analyzes every position to depth 25 — the same engine the pros use — and grades every move.</p>
              </div>
            </li>
            <li>
              <span className="about-page__step-num">3</span>
              <div>
                <strong>Coaching in plain English</strong>
                <p>Claude AI explains your critical mistakes in words, not just numbers. Not "you lost 1.8 pawns" — but why it went wrong and what to think about instead.</p>
              </div>
            </li>
          </ol>
        </section>

        <section className="about-page__section">
          <h2>What's here</h2>
          <ul className="about-page__features">
            <li><strong>Game Review</strong> — Replay any game with eval bar, best-move arrows, and graded moves.</li>
            <li><strong>Play vs Bot</strong> — Practice against an engine set to any Elo, with post-game review.</li>
            <li><strong>AI Coaching</strong> — On-demand lessons on your most important mistakes.</li>
            <li><strong>Practice</strong> — Openings and tactics. <em>Coming soon.</em></li>
          </ul>
        </section>

        <section className="about-page__section">
          <h2>Feedback</h2>
          <p>
            If something's broken, confusing, or you just have an idea —
            I genuinely want to hear it.{' '}
            <a href="mailto:hello@deepmove.io">hello@deepmove.io</a>
          </p>
        </section>
      </div>
    </div>
  )
}
