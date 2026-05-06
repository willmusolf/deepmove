interface AboutPageProps {
  onOpenApp?: () => void
  onOpenPrivacy?: () => void
}

const DIFFERENTIATORS = [
  {
    title: 'Your games first',
    text: 'DeepMove starts from the games you actually played, then surfaces the mistakes, turning points, and patterns worth studying next.',
  },
  {
    title: 'Engine plus explanation',
    text: 'Stockfish handles the heavy analysis, but the product is built to make the output understandable instead of overwhelming.',
  },
  {
    title: 'Built for repetition',
    text: 'The long-term goal is a training loop where review leads into guided practice based on the mistakes you repeat most often.',
  },
] as const

const TODAY_ITEMS = [
  'Import games from Chess.com, Lichess, or raw PGN.',
  'Review moves with eval swings, best lines, move grades, and critical moments.',
  'Play against the bot, then send finished games straight into review.',
  'Save account preferences and linked chess profiles for faster repeat use.',
] as const

const ROADMAP_ITEMS = [
  'More personalized coaching based on recurring weaknesses, not just one-off blunders.',
  'Practice flows that turn reviewed mistakes into drills, puzzles, and training plans.',
  'Clearer progress tracking so players can see which habits are improving over time.',
] as const

export default function AboutPage({ onOpenApp, onOpenPrivacy }: AboutPageProps) {
  return (
    <div className="about-page">
      <div className="about-page__content">
        <section className="about-page__hero">
          <p className="about-page__eyebrow">About DeepMove</p>
          <h1>Chess improvement that starts with the games you already played.</h1>
          <p className="about-page__lede">
            DeepMove is a chess review app for players who want more than a raw engine verdict.
            The idea is simple: play real games, review them consistently, and study the mistakes
            that keep showing up in your own positions.
          </p>
          <div className="about-page__actions">
            <button type="button" className="about-page__button" onClick={onOpenApp}>
              Open DeepMove
            </button>
            <button type="button" className="about-page__link" onClick={onOpenPrivacy}>
              Read Privacy Policy
            </button>
          </div>
        </section>

        <section className="about-page__section">
          <div className="about-page__section-head">
            <h2>What makes it different</h2>
            <p>
              Most chess tools tell you the engine move. DeepMove is aimed at helping you
              understand the mistake pattern behind the move.
            </p>
          </div>
          <div className="about-page__grid">
            {DIFFERENTIATORS.map(item => (
              <article key={item.title} className="about-page__card">
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="about-page__section">
          <div className="about-page__section-head">
            <h2>What DeepMove does today</h2>
            <p>
              The current product is focused on fast game review and a smoother post-game study loop.
            </p>
          </div>
          <ul className="about-page__list">
            {TODAY_ITEMS.map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="about-page__section about-page__section--split">
          <div>
            <h2>How to use it well</h2>
            <p>
              The best results usually come from a boring but effective routine: play serious games,
              review every loss, flag the same bad decisions when they repeat, and revisit those
              patterns before your next session.
            </p>
          </div>
          <div>
            <h2>Where it is going</h2>
            <ul className="about-page__list about-page__list--compact">
              {ROADMAP_ITEMS.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  )
}
