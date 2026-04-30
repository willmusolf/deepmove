// AuthModal.tsx — Login / Sign Up modal with email+password and OAuth buttons.
import { useState } from 'react'
import { useAuthStore } from '../../stores/authStore'

interface AuthModalProps {
  onClose: () => void
  onSuccess: () => void
}

type Tab = 'login' | 'signup'
type PasswordCredentialCtor = new (init: { id: string; password: string }) => Credential

export default function AuthModal({ onClose, onSuccess }: AuthModalProps) {
  const [tab, setTab] = useState<Tab>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [pwFocused, setPwFocused] = useState(false)

  const login = useAuthStore(s => s.login)
  const register = useAuthStore(s => s.register)

  const pwLongEnough = password.length >= 8
  const pwHasLetter = /[A-Za-z]/.test(password)
  const pwHasNumber = /[0-9]/.test(password)
  const pwValid = pwLongEnough && pwHasLetter && pwHasNumber

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (tab === 'signup' && !pwValid) {
      setError('Password must be at least 8 characters with a letter and a number')
      return
    }
    setLoading(true)
    try {
      if (tab === 'login') {
        await login(email, password)
      } else {
        await register(email, password)
      }
      // Tell the browser to save/update the credential so autofill works next time
      const passwordCredentialCtor = (window as Window & { PasswordCredential?: PasswordCredentialCtor }).PasswordCredential
      if ('credentials' in navigator && passwordCredentialCtor) {
        try {
          const cred = new passwordCredentialCtor({ id: email, password })
          await navigator.credentials.store(cred)
        } catch { /* not supported in this browser — ignore */ }
      }
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

  const showRequirements = tab === 'signup' && (pwFocused || (password.length > 0 && !pwValid))

  return (
    <div className="auth-overlay" onClick={onClose}>
      <div className="auth-modal" onClick={e => e.stopPropagation()}>
        <button className="auth-close" onClick={onClose}>&times;</button>

        <div className="auth-tabs">
          <button
            className={`auth-tab${tab === 'login' ? ' active' : ''}`}
            onClick={() => { setTab('login'); setError('') }}
          >
            Log In
          </button>
          <button
            className={`auth-tab${tab === 'signup' ? ' active' : ''}`}
            onClick={() => { setTab('signup'); setError('') }}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <label className="sr-only" htmlFor="auth-email">Email</label>
          <input
            id="auth-email"
            name="email"
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoFocus
            autoComplete="email"
            className="auth-input"
          />
          <div className="auth-input-wrap">
            <label className="sr-only" htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              className="auth-input"
              onFocus={() => setPwFocused(true)}
              onBlur={() => setPwFocused(false)}
            />
            <button
              type="button"
              className="auth-eye"
              onClick={() => setShowPassword(v => !v)}
              tabIndex={-1}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>
          {showRequirements && (
            <div className="auth-requirements">
              <div className={`auth-req-row ${pwLongEnough ? 'auth-req-met' : 'auth-req-unmet'}`}>
                <span>{pwLongEnough ? '\u2713' : '\u2717'}</span>
                <span>At least 8 characters</span>
              </div>
              <div className={`auth-req-row ${pwHasLetter && pwHasNumber ? 'auth-req-met' : 'auth-req-unmet'}`}>
                <span>{pwHasLetter && pwHasNumber ? '\u2713' : '\u2717'}</span>
                <span>Contains a letter and a number</span>
              </div>
            </div>
          )}
          {error && <div className="auth-error">{error}</div>}
          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? '...' : tab === 'login' ? 'Log In' : 'Create Account'}
          </button>
        </form>

        <div className="auth-divider">
          <span>or</span>
        </div>

        <div className="auth-oauth">
          <a href={`${API_BASE}/auth/lichess`} className="auth-oauth-btn auth-oauth--lichess">
            Continue with Lichess
          </a>
          <a href={`${API_BASE}/auth/google`} className="auth-oauth-btn auth-oauth--google">
            Continue with Google
          </a>
          <a href={`${API_BASE}/auth/chesscom`} className="auth-oauth-btn auth-oauth--chesscom">
            Continue with Chess.com
          </a>
        </div>
      </div>
    </div>
  )
}
