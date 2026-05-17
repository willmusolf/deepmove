import { useCallback, useEffect, useState } from 'react'
import {
  clearAdminLessonCache,
  getAdminOpsStatus,
  setAdminCoachingEnabled,
  type AdminOpsStatus,
} from './adminApi'
import AuthModal from '../Auth/AuthModal'
import { useAuthStore } from '../../stores/authStore'
import { usePrefsStore, type AppTheme, type BoardTheme } from '../../stores/prefsStore'
import { clearAllAnalyses } from '../../services/gameDB'

export default function SettingsPage() {
  const user = useAuthStore(s => s.user)
  const updateProfile = useAuthStore(s => s.updateProfile)
  const {
    appTheme,
    boardTheme,
    soundEnabled,
    setAppTheme,
    setBoardTheme,
    setSoundEnabled,
  } = usePrefsStore()

  const [clearMsg, setClearMsg] = useState('')
  const [showAuth, setShowAuth] = useState(false)
  const [adminOps, setAdminOps] = useState<AdminOpsStatus | null>(null)
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminBusy, setAdminBusy] = useState(false)
  const [adminMsg, setAdminMsg] = useState('')
  const [adminErr, setAdminErr] = useState('')

  const BOARD_THEMES: { id: BoardTheme; label: string; lightColor: string; darkColor: string }[] = [
    { id: 'blue', label: 'Blue', lightColor: '#dee3e6', darkColor: '#8ca2ad' },
    { id: 'brown', label: 'Brown', lightColor: '#f0d9b5', darkColor: '#b58863' },
    { id: 'green', label: 'Green', lightColor: '#ffffdd', darkColor: '#86a666' },
    { id: 'purple', label: 'Purple', lightColor: '#e8d0e0', darkColor: '#9c6b9c' },
  ]

  async function handleSaveAppearance(overrides: {
    appTheme?: AppTheme
    boardTheme?: BoardTheme
    soundEnabled?: boolean
  } = {}) {
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
      // Best-effort sync to backend.
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

  function handleSoundToggle(next: boolean) {
    setSoundEnabled(next)
    void handleSaveAppearance({ soundEnabled: next })
  }

  async function handleClearAnalyses() {
    const count = await clearAllAnalyses()
    setClearMsg(`Cleared ${count} cached game${count !== 1 ? 's' : ''}.`)
    setTimeout(() => setClearMsg(''), 4000)
  }

  const loadAdminOps = useCallback(async () => {
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
  }, [user?.is_admin])

  useEffect(() => {
    if (user?.is_admin) {
      void loadAdminOps()
    } else {
      setAdminOps(null)
      setAdminErr('')
      setAdminMsg('')
    }
  }, [loadAdminOps, user?.is_admin])

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

  return (
    <div className="profile-page">
      <h2 className="profile-title">Settings</h2>

      <section className="profile-section">
        <h3 className="profile-section-title">Preferences</h3>
        {user ? (
          <p className="profile-section-desc">Your local settings update immediately and sync to your account.</p>
        ) : (
          <div className="profile-guest-note">
            <p>These settings work right away as a guest. Sign in if you want them synced to your account.</p>
            <button className="btn btn-primary" type="button" onClick={() => setShowAuth(true)}>
              Sign In
            </button>
          </div>
        )}
      </section>

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
              {BOARD_THEMES.map(theme => (
                <button
                  key={theme.id}
                  className={`profile-board-swatch${boardTheme === theme.id ? ' active' : ''}`}
                  title={theme.label}
                  onClick={() => handleBoardTheme(theme.id)}
                >
                  <span className="swatch-half swatch-light" style={{ background: theme.lightColor }} />
                  <span className="swatch-half swatch-dark" style={{ background: theme.darkColor }} />
                  <span className="swatch-label">{theme.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="profile-field">
            <label className="profile-field-label">Sound</label>
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

      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
          onSuccess={() => setShowAuth(false)}
        />
      )}
    </div>
  )
}
