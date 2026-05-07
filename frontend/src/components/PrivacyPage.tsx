import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../config/contact'

interface PrivacyPageProps {
  onOpenApp?: () => void
  onOpenAbout?: () => void
}

const SUMMARY_ITEMS = [
  'We collect the account, game, and coaching data needed to run DeepMove.',
  'We do not sell personal data.',
  'You can request account deletion or a copy of your data by contacting us.',
  'DeepMove does not currently serve third-party display ads.',
] as const

export default function PrivacyPage({ onOpenApp, onOpenAbout }: PrivacyPageProps) {
  return (
    <div className="privacy-page">
      <div className="privacy-page__content">
        <section className="privacy-page__hero">
          <p className="privacy-page__eyebrow">Privacy Policy</p>
          <h1>Privacy Policy for DeepMove</h1>
          <p className="privacy-page__updated">Last updated: May 6, 2026</p>
          <p className="privacy-page__lede">
            This policy explains what DeepMove collects, why it is collected, and what choices
            you have. The goal is to be straightforward about the data required to run account
            features, game review, and coaching.
          </p>
          <div className="privacy-page__actions">
            <button type="button" className="about-page__button" onClick={onOpenApp}>
              Back to App
            </button>
            <button type="button" className="about-page__link" onClick={onOpenAbout}>
              About DeepMove
            </button>
          </div>
        </section>

        <section className="privacy-page__section privacy-page__section--highlight">
          <h2>At a glance</h2>
          <ul className="privacy-page__list">
            {SUMMARY_ITEMS.map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="privacy-page__section">
          <h2>1. Information we collect</h2>
          <p>
            When you create an account, we store your email address, a securely hashed password
            if you use email login, and basic account metadata such as whether your account is on
            the free or premium tier.
          </p>
          <p>
            If you connect external services, we may store linked identifiers and usernames for
            providers such as Google, Lichess, and Chess.com so account access and profile linking
            work correctly.
          </p>
          <p>
            When you review games, we store the PGN you import, game metadata such as ratings,
            color, opponent, result, and time control, plus analysis outputs like move evaluations,
            critical moments, and any coaching lessons generated for your account.
          </p>
          <p>
            We also store limited technical and security information such as authentication events,
            IP-based abuse prevention data, and your app preferences. Some preferences and recent
            review state are stored locally in your browser using local storage or session storage
            so the app can restore your last view more quickly.
          </p>
        </section>

        <section className="privacy-page__section">
          <h2>2. How we use information</h2>
          <p>
            We use your data to create and secure your account, sync linked chess identities,
            analyze imported games, generate coaching output, remember preferences, and operate
            the service safely and reliably.
          </p>
          <p>
            We may also use aggregated operational information to monitor performance, control
            abuse, debug problems, and understand which parts of the product need improvement.
          </p>
        </section>

        <section className="privacy-page__section">
          <h2>3. AI coaching</h2>
          <p>
            When coaching is enabled for a position, DeepMove sends structured chess-review facts
            to an AI provider so a lesson can be generated. DeepMove is built so the model receives
            verified review inputs rather than free-form access to your entire account.
          </p>
          <p>
            At the time of this policy, DeepMove uses Anthropic for coaching generation. Coaching
            output may be cached to reduce latency and cost when the same lesson request is repeated.
          </p>
        </section>

        <section className="privacy-page__section">
          <h2>4. Cookies, local storage, and sessions</h2>
          <p>
            DeepMove uses cookies and browser storage for sign-in state, account linking flows,
            saved preferences, and restoring parts of the interface between visits. If you block
            these technologies entirely, some account features may not work correctly.
          </p>
        </section>

        <section className="privacy-page__section">
          <h2>5. Third-party services</h2>
          <p>
            DeepMove relies on third-party infrastructure and integrations including Vercel for the
            frontend, Render for backend hosting, Neon for database hosting, Anthropic for AI
            coaching, Google for OAuth login, and the public APIs of Chess.com and Lichess when you
            choose to import or link those accounts.
          </p>
        </section>

        <section className="privacy-page__section">
          <h2>6. Advertising</h2>
          <p>
            DeepMove does not currently serve third-party display ads. If that changes, this policy
            will be updated before ads go live to describe the provider, what data may be used, and
            what controls are available to users.
          </p>
        </section>

        <section className="privacy-page__section">
          <h2>7. Data retention</h2>
          <p>
            We retain account data, saved games, and generated lessons for as long as your account
            remains active or as needed to operate the service, comply with legal obligations, and
            resolve security or abuse issues.
          </p>
        </section>

        <section className="privacy-page__section">
          <h2>8. Your choices</h2>
          <p>
            You can update profile details from the app and remove linked usernames at any time. If
            you want your saved data exported or your account deleted, contact us and we will help
            process the request.
          </p>
        </section>

        <section className="privacy-page__section">
          <h2>9. Children&apos;s privacy</h2>
          <p>
            DeepMove is not intended for children under 13, and we do not knowingly collect personal
            information from children under 13.
          </p>
        </section>

        <section className="privacy-page__section">
          <h2>10. Contact</h2>
          <p>
            Questions about this policy, bug reports, and general feedback can be sent to{' '}
            <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>.
          </p>
        </section>
      </div>
    </div>
  )
}
