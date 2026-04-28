export default function PrivacyPage() {
  return (
    <div className="privacy-page">
      <div className="privacy-page__content">
        <h1>Privacy Policy</h1>
        <p className="privacy-page__updated">Last updated: April 27, 2026</p>

        <h2>1. Information We Collect</h2>
        <p>When you create an account, we collect your email address and password (stored as a secure hash). If you link a Chess.com or Lichess account, we store your username on those platforms. We store the chess games you import and any analysis you perform.</p>

        <h2>2. How We Use Your Information</h2>
        <p>We use your information to provide the DeepMove service — saving your games, generating coaching lessons, and personalizing your experience. We do not sell your personal data to third parties.</p>

        <h2>3. Cookies</h2>
        <p>We use session cookies to keep you logged in. If you are on the free tier, we display ads through Google AdSense, which may set its own cookies to personalize ads based on your browsing history. You can opt out of personalized ads at <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer">google.com/settings/ads</a>.</p>

        <h2>4. Advertising</h2>
        <p>DeepMove displays ads to free-tier users via Google AdSense. Google may use cookies and device identifiers to show relevant ads. Premium subscribers see no ads. For more information on how Google uses data, visit <a href="https://policies.google.com/technologies/ads" target="_blank" rel="noopener noreferrer">Google's Advertising Policies</a>.</p>

        <h2>5. Data Retention</h2>
        <p>We retain your account data for as long as your account is active. You can request deletion of your account and associated data by contacting us.</p>

        <h2>6. Third-Party Services</h2>
        <p>DeepMove uses the following third-party services: Neon (PostgreSQL database hosting), Render (backend hosting), Vercel (frontend hosting), and Google AdSense (advertising). Each of these services has their own privacy policies.</p>

        <h2>7. Children's Privacy</h2>
        <p>DeepMove is not directed at children under 13. We do not knowingly collect personal information from children under 13.</p>

        <h2>8. Changes to This Policy</h2>
        <p>We may update this Privacy Policy from time to time. We will notify registered users of significant changes via email.</p>

        <h2>9. Contact</h2>
        <p>If you have questions about this Privacy Policy or want to request data deletion, please contact us at <a href="mailto:privacy@deepmove.io">privacy@deepmove.io</a>.</p>
      </div>
    </div>
  )
}
