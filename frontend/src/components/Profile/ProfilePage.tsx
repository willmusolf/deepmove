// ProfilePage.tsx — User profile & settings
import { useState } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { usePrefsStore, type AppTheme, type BoardTheme } from '../../stores/prefsStore'
import { clearAllAnalyses } from '../../services/gameDB'

interface ProfilePageProps {
  /** Called when user saves a chess platform username so the Review tab can pre-fill it */
  onUsernameLinked?: (platform: 'chesscom' | 'lichess', username: string) => void
}

export default function ProfilePage({ onUsernameLinked }: ProfilePageProps) {
  const user = useAuthStore(s => s.user)
  const updateProfile = useAuthStore(s => s.updateProfile)
  const { appTheme, boardTheme, soundEnabled, setAppTheme, setBoardTheme, setSoundEnabled } = usePrefsStore()

  // Chess account fields
  const [chesscomInput, setChesscomInput] = useState(user?.chesscom_username ?? '')
  const [lichessInput, setLichessInput] = useState(user?.lichess_username ?? '')
  const [accountSaving, setAccountSaving] = useState(false)
  const [accountMsg, setAccountMsg] = useState('')

  // Elo field
  const [eloInput, setEloInput] = useState(String(user?.elo_estimate ?? ''))
  const [eloSaving, setEloSaving] = useState(false)
  const [eloMsg, setEloMsg] = useState('')

  // Cache clear
  const [clearMsg, setClearMsg] = useState('')

  async function handleSaveAccounts() {
    setAccountSaving(true)
    setAccountMsg('')
    try {
      const payload: Parameters<typeof updateProfile>[0] = {}
      if (chesscomInput.trim() !== (user?.chesscom_username ?? '')) {
        payload.chesscom_username = chesscomInput.trim() || undefined
      }
      if (lichessInput.trim() !== (user?.lichess_username ?? '')) {
        payload.lichess_username = lichessInput.trim() || undefined
      }

      if (Object.keys(payload).length === 0) {
        setAccountMsg('No changes.')
        setAccountSaving(false)
        return
      }

      await updateProfile(payload)
      setAccountMsg('Saved!')

      // Notify parent so Review tab can auto-load games
      if (payload.chesscom_username) {
        onUsernameLinked?.('chesscom', payload.chesscom_username)
      }
      if (payload.lichess_username) {
        onUsernameLinked?.('lichess', payload.lichess_username)
      }
    } catch (err) {
      setAccountMsg(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setAccountSaving(false)
      setTimeout(() => setAccountMsg(''), 3000)
    }
  }

  async function handleSaveElo() {
    const parsed = parseInt(eloInput, 10)
    if (isNaN(parsed) || parsed < 100 || parsed > 3500) {
      setEloMsg('Enter a rating between 100 and 3500')
      setTimeout(() => setEloMsg(''), 3000)
      return
    }
    setEloSaving(true)
    setEloMsg('')
    try {
      await updateProfile({ elo_estimate: parsed })
      setEloMsg('Saved!')
    } catch (err) {
      setEloMsg(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setEloSaving(false)
      setTimeout(() => setEloMsg(''), 3000)
    }
  }

  async function handleSaveAppearance() {
    if (!user) return
    try {
      await updateProfile({
        preferences: {
          appTheme,
          boardTheme,
          soundEnabled,
        },
      })
    } catch {
      // Best-effort sync to backend
    }
  }

  function handleThemeToggle(theme: AppTheme) {
    setAppTheme(theme)
    void handleSaveAppearance()
  }

  function handleBoardTheme(theme: BoardTheme) {
    setBoardTheme(theme)
    void handleSaveAppearance()
  }

  function handleSoundToggle(v: boolean) {
    setSoundEnabled(v)
    void handleSaveAppearance()
  }

  async function handleClearAnalyses() {
    const count = await clearAllAnalyses()
    setClearMsg(`Cleared ${count} cached game${count !== 1 ? 's' : ''}.`)
    setTimeout(() => setClearMsg(''), 4000)
  }

  const BOARD_THEMES: { id: BoardTheme; label: string; lightColor: string; darkColor: string }[] = [
    { id: 'brown',  label: 'Brown',  lightColor: '#f0d9b5', darkColor: '#b58863' },
    { id: 'blue',   label: 'Blue',   lightColor: '#dee3e6', darkColor: '#8ca2ad' },
    { id: 'green',  label: 'Green',  lightColor: '#ffffdd', darkColor: '#86a666' },
    { id: 'purple', label: 'Purple', lightColor: '#e8d0e0', darkColor: '#9c6b9c' },
  ]

  return (
    <div className="profile-page">
      <h2 className="profile-title">Profile &amp; Settings</h2>

      {/* ── Account Info ─────────────────────────────────────────────── */}
      <section className="profile-section">
        <h3 className="profile-section-title">Account</h3>
        {user ? (
          <div className="profile-info-grid">
            <div className="profile-info-row">
              <span className="profile-info-label">Email</span>
              <span className="profile-info-value">{user.email}</span>
            </div>
            <div className="profile-info-row">
              <span className="profile-info-label">Member since</span>
              <span className="profile-info-value">
                {new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </span>
            </div>
            <div className="profile-info-row">
              <span className="profile-info-label">Plan</span>
              <span className="profile-info-value">{user.is_premium ? 'Premium' : 'Free'}</span>
            </div>
          </div>
        ) : (
          <p className="profile-guest-note">Sign in to save your settings and link chess accounts.</p>
        )}
      </section>

      {/* ── Chess Accounts ───────────────────────────────────────────── */}
      <section className="profile-section">
        <h3 className="profile-section-title">Chess Accounts</h3>
        <p className="profile-section-desc">Link your accounts to auto-load your games in the Review tab.</p>
        <div className="profile-field-group">
          <div className="profile-field">
            <label className="profile-field-label">Chess.com username</label>
            <input
              className="profile-input"
              type="text"
              placeholder="e.g. hikaru"
              value={chesscomInput}
              onChange={e => setChesscomInput(e.target.value)}
              disabled={!user}
            />
          </div>
          <div className="profile-field">
            <label className="profile-field-label">Lichess username</label>
            <input
              className="profile-input"
              type="text"
              placeholder="e.g. DrNykterstein"
              value={lichessInput}
              onChange={e => setLichessInput(e.target.value)}
              disabled={!user}
            />
          </div>
          <div className="profile-field-row">
            <button
              className="btn btn-primary"
              onClick={handleSaveAccounts}
              disabled={!user || accountSaving}
            >
              {accountSaving ? 'Saving…' : 'Save'}
            </button>
            {accountMsg && (
              <span className={`profile-msg${accountMsg === 'Saved!' ? ' profile-msg--ok' : ' profile-msg--err'}`}>
                {accountMsg}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* ── Elo Estimate ─────────────────────────────────────────────── */}
      <section className="profile-section">
        <h3 className="profile-section-title">Your Rating</h3>
        <p className="profile-section-desc">Helps the coach tailor lessons to your level.</p>
        <div className="profile-field-group">
          <div className="profile-field">
            <label className="profile-field-label">Estimated rating</label>
            <input
              className="profile-input profile-input--short"
              type="number"
              placeholder="e.g. 1330"
              min={100}
              max={3500}
              value={eloInput}
              onChange={e => setEloInput(e.target.value)}
              disabled={!user}
            />
          </div>
          <div className="profile-field-row">
            <button
              className="btn btn-primary"
              onClick={handleSaveElo}
              disabled={!user || eloSaving}
            >
              {eloSaving ? 'Saving…' : 'Save'}
            </button>
            {eloMsg && (
              <span className={`profile-msg${eloMsg === 'Saved!' ? ' profile-msg--ok' : ' profile-msg--err'}`}>
                {eloMsg}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* ── Appearance ───────────────────────────────────────────────── */}
      <section className="profile-section">
        <h3 className="profile-section-title">Appearance</h3>

        <div className="profile-field-group">
          <div className="profile-field">
            <label className="profile-field-label">Theme</label>
            <div className="profile-toggle-group">
              <button
                className={`profile-toggle-btn${appTheme === 'dark' ? ' active' : ''}`}
                onClick={() => handleThemeToggle('dark')}
              >
                Dark
              </button>
              <button
                className={`profile-toggle-btn${appTheme === 'light' ? ' active' : ''}`}
                onClick={() => handleThemeToggle('light')}
              >
                Light
              </button>
            </div>
          </div>

          <div className="profile-field">
            <label className="profile-field-label">Board color</label>
            <div className="profile-board-themes">
              {BOARD_THEMES.map(t => (
                <button
                  key={t.id}
                  className={`profile-board-swatch${boardTheme === t.id ? ' active' : ''}`}
                  title={t.label}
                  onClick={() => handleBoardTheme(t.id)}
                >
                  <span
                    className="swatch-half swatch-light"
                    style={{ background: t.lightColor }}
                  />
                  <span
                    className="swatch-half swatch-dark"
                    style={{ background: t.darkColor }}
                  />
                  <span className="swatch-label">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="profile-field">
            <label className="profile-field-label">Move sounds</label>
            <div className="profile-toggle-group">
              <button
                className={`profile-toggle-btn${soundEnabled ? ' active' : ''}`}
                onClick={() => handleSoundToggle(true)}
              >
                On
              </button>
              <button
                className={`profile-toggle-btn${!soundEnabled ? ' active' : ''}`}
                onClick={() => handleSoundToggle(false)}
              >
                Off
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Data ─────────────────────────────────────────────────────── */}
      <section className="profile-section">
        <h3 className="profile-section-title">Data</h3>
        <div className="profile-field-group">
          <div className="profile-field">
            <label className="profile-field-label">Cached analysis</label>
            <div className="profile-field-row">
              <button className="btn btn-secondary" onClick={handleClearAnalyses}>
                Clear analysis cache
              </button>
              {clearMsg && <span className="profile-msg profile-msg--ok">{clearMsg}</span>}
            </div>
            <p className="profile-help-text">
              Games will re-run Stockfish analysis on next view.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
