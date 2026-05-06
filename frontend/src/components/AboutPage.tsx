export default function AboutPage() {
  return (
    <div className="about-page">
      <div className="about-page__content">
        <div className="about-page__hero">
          <p className="about-page__eyebrow">About DeepMove</p>
          <h1>Improve at chess by learning from your own games.</h1>
          <p className="about-page__lede">
            DeepMove is a chess improvement app built around game review. Instead of handing
            you a pile of random engine lines, it helps you look at your own mistakes, your own
            turning points, and the positions that are most worth studying next.
          </p>
        </div>

        <section className="about-page__section">
          <h2>What DeepMove does today</h2>
          <ul className="about-page__list">
            <li>Imports games from Chess.com, Lichess, or PGN.</li>
            <li>Runs move-by-move review with eval swings, best lines, and critical moments.</li>
            <li>Lets you play against the bot and send finished games straight into review.</li>
          </ul>
        </section>

        <section className="about-page__section">
          <h2>How to get better at chess</h2>
          <p>
            A strong improvement loop is simple: play serious games, review every loss,
            notice the same mistakes repeating, and study the positions that actually came
            from your games. DeepMove is designed to make that review step easier and more
            consistent.
          </p>
        </section>

        <section className="about-page__section">
          <h2>What we are aiming for</h2>
          <p>
            The long-term goal is personal chess training: review first, then guided practice
            based on the errors and patterns you miss most often. Some of that is already live,
            and some of it is still being built.
          </p>
        </section>

        <div className="about-page__actions">
          <a className="about-page__button" href="/">Open DeepMove</a>
          <a className="about-page__link" href="/privacy">Privacy Policy</a>
        </div>
      </div>
    </div>
  )
}
