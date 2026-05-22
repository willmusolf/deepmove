import { SUPPORT_EMAIL, SUPPORT_GITHUB_ISSUES_URL, SUPPORT_GITHUB_URL, SUPPORT_MAILTO } from '../config/contact'

interface AboutPageProps {
  onOpenApp?: () => void
  onOpenPrivacy?: () => void
}

const DIFFERENTIATORS = [
  {
    title: 'Review first',
    text: 'DeepMove is built around reviewing your own games quickly, spotting the moments that mattered, and leaving with something concrete to fix next time.',
  },
  {
    title: 'Built for improvers',
    text: 'The target player is already competing online and wants a tighter study loop, not a full beginner course and not a giant database rabbit hole.',
  },
  {
    title: 'Training plan in progress',
    text: 'Broader account-history insights and recurring-weakness training are still beta work. The flagship product today is game review that leads into improvement.',
  },
] as const

const TODAY_ITEMS = [
  'Import games from Chess.com, Lichess, or raw PGN.',
  'Review moves with eval swings, best lines, move grades, and critical moments.',
  'Play against the bot, then send finished games straight into review.',
  'Save account preferences and linked chess profiles for faster repeat use.',
  'Open beta account snapshots after sign-in if you want a broader look at recurring trends.',
] as const

const BETA_ITEMS = [
  'Insights Beta stores an account-history snapshot instead of acting like a live dashboard.',
  'Trend labels and selected examples are still being tightened before DeepMove leans on them as a primary promise.',
  'The long-term goal is report -> lesson -> practice, but the review flow comes first.',
] as const

const ROADMAP_ITEMS = [
  'Better recurring-weakness detection backed by stronger review examples.',
  'Practice flows that turn reviewed mistakes into drills, puzzles, and mini lessons.',
  'Clearer progress tracking so players can see which habits are improving over time.',
] as const

const AUDIENCE_ITEMS = [
  'Players who already have real games on Chess.com, Lichess, or PGN and want a faster review loop.',
  'Improvers who understand engine scores exist but still need help translating them into habits they can fix.',
  'Adult club players and online grinders who want practical post-game study instead of a giant database rabbit hole.',
] as const

const REVIEW_FLOW_ITEMS = [
  'Import a finished game from Chess.com, Lichess, or a PGN file.',
  'Scan the critical moments, eval swings, and move grades to find where the result really turned.',
  'Use best-line context and written coaching to understand the mistake pattern, not just the engine move.',
  'Take the lesson into the next game, then repeat the cycle often enough that the same blunders stop repeating.',
] as const

const FAQ_ITEMS = [
  {
    question: 'Is DeepMove a database, a lesson platform, or an engine wrapper?',
    answer: 'It is closest to a review workflow product. The engine is part of the stack, but the value is supposed to come from clearer feedback, faster diagnosis, and a better study loop after each game.',
  },
  {
    question: 'What makes the content on this site different from generic chess advice?',
    answer: 'DeepMove is built around the mistakes that appear in your own imported games. The content is meant to be anchored to personal review data rather than broad recycled opening tips or scraped game dumps.',
  },
  {
    question: 'Why is the public promise focused on review instead of a full training system?',
    answer: 'Because that is the most trustworthy thing DeepMove does today. Broader training-plan work is in beta, and the goal is to earn stronger claims by making the review loop genuinely useful first.',
  },
] as const

export default function AboutPage({ onOpenApp, onOpenPrivacy }: AboutPageProps) {
  return (
    <div className="about-page">
      <div className="about-page__content">
        <section className="about-page__hero">
          <p className="about-page__eyebrow">About DeepMove</p>
          <h1>Chess improvement that starts with the games you already played.</h1>
          <p className="about-page__lede">
            DeepMove is a chess review app for improvers who want more than a raw engine verdict.
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

        <section className="about-page__section">
          <div className="about-page__section-head">
            <h2>What is beta right now</h2>
            <p>
              Account-wide training snapshots are live, but they are still secondary to review and
              should be treated as an experimental layer rather than the whole product promise.
            </p>
          </div>
          <ul className="about-page__list">
            {BETA_ITEMS.map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="about-page__section about-page__section--split">
          <div>
            <h2>Who it is for</h2>
            <ul className="about-page__list about-page__list--compact">
              {AUDIENCE_ITEMS.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2>What a review session looks like</h2>
            <ul className="about-page__list about-page__list--compact">
              {REVIEW_FLOW_ITEMS.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
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

        <section className="about-page__section">
          <div className="about-page__section-head">
            <h2>Frequently asked questions</h2>
          </div>
          <div className="about-page__grid">
            {FAQ_ITEMS.map(item => (
              <article key={item.question} className="about-page__card">
                <h3>{item.question}</h3>
                <p>{item.answer}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="about-page__section">
          <div className="about-page__section-head">
            <h2>Questions, bugs, or feedback?</h2>
            <p>
              Email{' '}
              <a href={SUPPORT_MAILTO}>
                {SUPPORT_EMAIL}
              </a>{' '}
              any time if something breaks, feels confusing, or you have an idea that would make
              DeepMove more useful.
            </p>
            <p>
              If you would rather post it publicly, you can also open an issue on{' '}
              <a href={SUPPORT_GITHUB_ISSUES_URL} target="_blank" rel="noreferrer">
                GitHub
              </a>{' '}
              or browse the project repo{' '}
              <a href={SUPPORT_GITHUB_URL} target="_blank" rel="noreferrer">
                here
              </a>.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
