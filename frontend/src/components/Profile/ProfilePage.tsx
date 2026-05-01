// ProfilePage.tsx — User profile & settings
import { useEffect, useState, type FormEvent } from 'react'
import {
  clearAdminLessonCache,
  getAdminOpsStatus,
  setAdminCoachingEnabled,
  type AdminOpsStatus,
} from './adminApi'
import { useAuthStore } from '../../stores/authStore'
import { usePrefsStore, type AppTheme, type BoardTheme } from '../../stores/prefsStore'
import { clearAllAnalyses } from '../../services/gameDB'
import { readCachedRatings, type DetectedRatings } from '../Import/normalizeGame'

const REVIEW_USERNAME_STORAGE = {
  chesscom: 'deepmove_chesscom_username',
  lichess: 'deepmove_lichess_username',
} as const

interface ProfilePageProps {
  /** Called when user saves a chess platform username so the Review tab can pre-fill it */
  onUsernameLinked?: (platform: 'chesscom' | 'lichess', username: string) => void
}

export default function ProfilePage({ onUsernameLinked }: ProfilePageProps) {
  const user = useAuthStore(s => s.user)
  const updateProfile = useAuthStore(s => s.updateProfile)
  const logout = useAuthStore(s => s.logout)
  const changePassword = useAuthStore(s => s.changePassword)
  const { appTheme, boardTheme, soundEnabled, setAppTheme, setBoardTheme, setSoundEnabled } = usePrefsStore()

  // Chess account fields
  const [chesscomInput, setChesscomInput] = useState(user?.chesscom_username ?? '')
  const [lichessInput, setLichessInput] = useState(user?.lichess_username ?? '')
  const [accountSaving, setAccountSaving] = useState(false)
  const [accountMsg, setAccountMsg] = useState('')

  // Detected ratings — read synchronously from localStorage (cached at import time)
  const [detectedRatings] = useState<DetectedRatings | null>(() => readCachedRatings())

  // Cache clear
  const [clearMsg, setClearMsg] = useState('')

  // Admin ops
  const [adminOps, setAdminOps] = useState<AdminOpsStatus | null>(null)
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminBusy, setAdminBusy] = useState(false)
  const [adminMsg, setAdminMsg] = useState('')
  const [adminErr, setAdminErr] = useState('')

  // Password change
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState('')
  const [pwIsError, setPwIsError] = useState(false)

  useEffect(() => {
    setChesscomInput(user?.chesscom_username ?? '')
  }, [user?.chesscom_username])

  useEffect(() => {
    setLichessInput(user?.lichess_username ?? '')
  }, [user?.lichess_username])

  async function handleChangePassword(event?: FormEvent) {
    event?.preventDefault()
    if (newPw !== confirmPw) {
      setPwMsg('Passwords do not match')
      setPwIsError(true)
      return
    }
    if (newPw.length < 8) {
      setPwMsg('New password must be at least 8 characters')
      setPwIsError(true)
      return
    }
    setPwSaving(true)
    setPwMsg('')
    try {
      await changePassword(currentPw, newPw)
      setPwMsg('Password changed!')
      setPwIsError(false)
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
    } catch (err) {
      setPwMsg(err instanceof Error ? err.message : 'Failed to change password')
      setPwIsError(true)
    } finally {
      setPwSaving(false)
      setTimeout(() => setPwMsg(''), 4000)
    }
  }

  async function handleSaveAccounts(event?: FormEvent) {
    event?.preventDefault()
    setAccountSaving(true)
    setAccountMsg('')
    try {
      const payload: Parameters<typeof updateProfile>[0] = {}
      if (chesscomInput.trim() !== (user?.chesscom_username ?? '')) {
        payload.chesscom_username = chesscomInput.trim() || null
      }
      if (lichessInput.trim() !== (user?.lichess_username ?? '')) {
        payload.lichess_username = lichessInput.trim() || null
      }

      if (Object.keys(payload).length === 0) {
        setAccountMsg('No changes.')
        setAccountSaving(false)
        return
      }

      await updateProfile(payload)
      setAccountMsg('Saved!')

      if ('chesscom_username' in payload) {
        if (payload.chesscom_username) localStorage.setItem(REVIEW_USERNAME_STORAGE.chesscom, payload.chesscom_username)
        else localStorage.removeItem(REVIEW_USERNAME_STORAGE.chesscom)
      }
      if ('lichess_username' in payload) {
        if (payload.lichess_username) localStorage.setItem(REVIEW_USERNAME_STORAGE.lichess, payload.lichess_username)
        else localStorage.removeItem(REVIEW_USERNAME_STORAGE.lichess)
      }

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


  async function handleSaveAppearance(overrides: { appTheme?: AppTheme; boardTheme?: BoardTheme; soundEnabled?: boolean } = {}) {
    if (!user) return
    try {
      await updateProfile({
        preferences: {
          appTheme: overrides.appTheme ?? appTheme,
          boardTheme: overrides.boardTheme ?? boardTheme,
          soundEnabled: overrides.soundEnabled ?? soundEnabled,
        },
      })
    } catch {
      // Best-effort sync to backend
    }
  }

  function handleThemeToggle(theme: AppTheme) {
    setAppTheme(theme)
    void handleSaveAppearance({ appTheme: theme })
  }

  function handleBoardTheme(theme: BoardTheme) {
    setBoardTheme(theme)
    void handleSaveAppearance({ boardTheme: theme })
  }

  function handleSoundToggle(v: boolean) {
    setSoundEnabled(v)
    void handleSaveAppearance({ soundEnabled: v })
  }

  async function handleClearAnalyses() {
    const count = await clearAllAnalyses()
    setClearMsg(`Cleared ${count} cached game${count !== 1 ? 's' : ''}.`)
    setTimeout(() => setClearMsg(''), 4000)
  }

  async function loadAdminOps() {
    if (!user?.is_admin) return
    setAdminLoading(true)
    setAdminErr('')
    try {
      const data = await getAdminOpsStatus()
      setAdminOps(data)
      setAdminErr('')
    } catch (err) {
      setAdminOps(null)
      setAdminErr(err instanceof Error ? err.message : 'Could not load admin status')
    } finally {
      setAdminLoading(false)
    }
  }

  useEffect(() => {
    if (user?.is_admin) {
      void loadAdminOps()
    } else {
      setAdminOps(null)
      setAdminErr('')
      setAdminMsg('')
    }
  }, [user?.is_admin])

  async function handleSetCoachingEnabled(enabled: boolean) {
    setAdminBusy(true)
    setAdminErr('')
    setAdminMsg('')
    try {
      const result = await setAdminCoachingEnabled(enabled)
      setAdminMsg(result.message)
      setAdminOps(prev => prev ? {
        ...prev,
        coaching_enabled: result.coaching_enabled ?? prev.coaching_enabled,
      } : prev)
      await loadAdminOps()
    } catch (err) {
      setAdminErr(err instanceof Error ? err.message : 'Could not update coaching state')
    } finally {
      setAdminBusy(false)
    }
  }

  async function handleClearLessonCache() {
    setAdminBusy(true)
    setAdminErr('')
    setAdminMsg('')
    try {
      const result = await clearAdminLessonCache()
      setAdminMsg(result.message)
      setAdminOps(prev => prev ? {
        ...prev,
        lesson_cache_entries: result.lesson_cache_entries ?? prev.lesson_cache_entries,
      } : prev)
      await loadAdminOps()
    } catch (err) {
      setAdminErr(err instanceof Error ? err.message : 'Could not clear lesson cache')
    } finally {
      setAdminBusy(false)
    }
  }

  const BOARD_THEMES: { id: BoardTheme; label: string; lightColor: string; darkColor: string }[] = [
    { id: 'blue',   label: 'Blue',   lightColor: '#dee3e6', darkColor: '#8ca2ad' },
    { id: 'brown',  label: 'Brown',  lightColor: '#f0d9b5', darkColor: '#b58863' },
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
            {user.is_admin && (
              <div className="profile-info-row">
                <span className="profile-info-label">Role</span>
                <span className="profile-admin-badge">👑 Admin</span>
              </div>
            )}
          </div>
        ) : (
          <p className="profile-guest-note">Sign in to save your settings and link chess accounts.</p>
        )}
      </section>


      {/* ── Security ─────────────────────────────────────────────────── */}
      {user && (
        <section className="profile-section">
          <h3 className="profile-section-title">Security</h3>
          <form className="profile-field-group" onSubmit={handleChangePassword}>
            {/* Hidden username field: required for password-manager autofill and browser accessibility */}
            <input type="email" autoComplete="username" value={user?.email ?? ''} readOnly aria-hidden="true" style={{ display: 'none' }} />
            <div className="profile-field">
              <label className="profile-field-label">Current password</label>
              <input
                className="profile-input"
                type="password"
                name="current_password"
                autoComplete="current-password"
                value={currentPw}
                onChange={e => setCurrentPw(e.target.value)}
              />
            </div>
            <div className="profile-field">
              <label className="profile-field-label">New password</label>
              <input
                className="profile-input"
                type="password"
                name="new_password"
                autoComplete="new-password"
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
              />
            </div>
            <div className="profile-field">
              <label className="profile-field-label">Confirm new password</label>
              <input
                className="profile-input"
                type="password"
                name="confirm_new_password"
                autoComplete="new-password"
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
              />
            </div>
            <div className="profile-field-row">
              <button
                className="btn btn-primary"
                type="submit"
                disabled={pwSaving || !currentPw || !newPw || !confirmPw}
              >
                {pwSaving ? 'Changing…' : 'Change Password'}
              </button>
              {pwMsg && (
                <span className={`profile-msg${pwIsError ? ' profile-msg--err' : ' profile-msg--ok'}`}>
                  {pwMsg}
                </span>
              )}
            </div>
          </form>
        </section>
      )}

      {/* ── Chess Accounts ───────────────────────────────────────────── */}
      <section className="profile-section">
        <h3 className="profile-section-title">Chess Accounts</h3>
        <p className="profile-section-desc">Link your accounts to auto-load your games in the Review tab.</p>
        <form className="profile-field-group" onSubmit={handleSaveAccounts} autoComplete="off">
          <div className="profile-field">
            <label className="profile-field-label">Chess.com username</label>
            <input
              className="profile-input"
              type="text"
              name="chesscom_username"
              placeholder="e.g. hikaru"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              data-lpignore="true"
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
              name="lichess_username"
              placeholder="e.g. DrNykterstein"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              data-lpignore="true"
              value={lichessInput}
              onChange={e => setLichessInput(e.target.value)}
              disabled={!user}
            />
          </div>
          <div className="profile-field-row">
            <button
              className="btn btn-primary"
              type="submit"
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
        </form>
      </section>

      {/* ── Your Ratings ─────────────────────────────────────────────── */}
      <section className="profile-section">
        <h3 className="profile-section-title">Your Ratings</h3>
        <p className="profile-section-desc">Auto-detected from your imported games. Import more games to improve accuracy.</p>
        <div className="profile-ratings-grid">
          {(['bullet', 'blitz', 'rapid', 'classical'] as const).map(mode => (
            <div key={mode} className="profile-rating-item">
              <span className="profile-rating-mode">{mode.charAt(0).toUpperCase() + mode.slice(1)}</span>
              <span className="profile-rating-value">
                {detectedRatings === null ? '…' : (detectedRatings[mode] ?? '——')}
              </span>
            </div>
          ))}
        </div>
        {detectedRatings !== null && !detectedRatings.primaryMode && (
          <p className="profile-help-text" style={{ marginTop: '0.5rem' }}>
            Import games from Chess.com or Lichess to detect your ratings.
          </p>
        )}
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

      {user?.is_admin && (
        <section className="profile-section">
          <h3 className="profile-section-title">Admin Ops</h3>
          <p className="profile-section-desc">
            Lightweight production controls for your account. Coaching toggle applies to the
            current backend instance and resets on restart unless the backend env is changed.
          </p>
          <div className="profile-admin-grid">
            <div className="profile-admin-card">
              <span className="profile-admin-label">AI coaching</span>
              <strong className={`profile-admin-value${adminOps?.coaching_enabled ? ' is-live' : ''}`}>
                {adminLoading ? 'Loading…' : adminOps?.coaching_enabled ? 'Enabled' : 'Disabled'}
              </strong>
              <div className="profile-admin-actions">
                <button
                  className="btn btn-secondary"
                  onClick={() => handleSetCoachingEnabled(false)}
                  disabled={adminBusy || adminLoading || adminOps?.coaching_enabled === false}
                >
                  Disable
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => handleSetCoachingEnabled(true)}
                  disabled={adminBusy || adminLoading || adminOps?.coaching_enabled === true}
                >
                  Enable
                </button>
              </div>
            </div>

            <div className="profile-admin-card">
              <span className="profile-admin-label">Lesson cache</span>
              <strong className="profile-admin-value">
                {adminLoading ? 'Loading…' : `${adminOps?.lesson_cache_entries ?? 0} entries`}
              </strong>
              <div className="profile-admin-actions">
                <button
                  className="btn btn-secondary"
                  onClick={() => void loadAdminOps()}
                  disabled={adminBusy || adminLoading}
                >
                  Refresh
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={handleClearLessonCache}
                  disabled={adminBusy || adminLoading}
                >
                  Clear cache
                </button>
              </div>
            </div>

            <div className="profile-admin-card profile-admin-card--wide">
              <span className="profile-admin-label">Production counts</span>
              <div className="profile-admin-stats">
                <div className="profile-admin-stat">
                  <span>Users</span>
                  <strong>{adminLoading ? '…' : adminOps ? adminOps.counts.users : '—'}</strong>
                </div>
                <div className="profile-admin-stat">
                  <span>Games</span>
                  <strong>{adminLoading ? '…' : adminOps ? adminOps.counts.games : '—'}</strong>
                </div>
                <div className="profile-admin-stat">
                  <span>Lessons</span>
                  <strong>{adminLoading ? '…' : adminOps ? adminOps.counts.lessons : '—'}</strong>
                </div>
                <div className="profile-admin-stat">
                  <span>Principles</span>
                  <strong>{adminLoading ? '…' : adminOps ? adminOps.counts.principles : '—'}</strong>
                </div>
              </div>
            </div>
          </div>

          {(adminMsg || adminErr) && (
            <p className={`profile-admin-message${adminErr ? ' is-error' : ''}`}>
              {adminErr || adminMsg}
            </p>
          )}
        </section>
      )}

      {/* ── Account ──────────────────────────────────────────────────── */}
      <section className="profile-section">
        <h3 className="profile-section-title">Sign Out</h3>
        <div className="profile-field-group">
          <div className="profile-field">
            <div className="profile-field-row">
              <button className="btn btn-secondary" onClick={() => { if (window.confirm('Log out of DeepMove?')) logout() }}>
                Log Out
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
