// AuthModal.tsx — Login / Sign Up modal with email+password and OAuth buttons.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuthStore } from '../../stores/authStore'
import { api } from '../../api/client'

interface AuthModalProps {
  onClose: () => void
  onSuccess: () => void
}

type Tab = 'login' | 'signup'
type Mode = 'auth' | 'forgot'
type PasswordCredentialCtor = new (init: { id: string; password: string }) => Credential

// Google "G" logo (official colors)
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

// Lichess logo — stylized chess knight in Lichess brand color
function LichessIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <g fill="currentColor" stroke="none">
        <path d="M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18"/>
        <path d="M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 C 13.27,9.506 13.5,8.5 13.5,7.5 C 14.5,6.5 16.5,10 16.5,10 L 18.5,10 C 18.5,10 19.28,8.008 21,7 C 22,7 22,10 22,10"/>
        <circle cx="9" cy="25.5" r="0.5"/>
        <ellipse cx="14.5" cy="15.5" rx="0.5" ry="1.5" transform="rotate(30 14.5 15.5)"/>
        <path d="M 11,39 L 37,39 L 36,36 L 12,36 Z" fillRule="evenodd"/>
      </g>
    </svg>
  )
}

export default function AuthModal({ onClose, onSuccess }: AuthModalProps) {
  const [tab, setTab] = useState<Tab>('login')
  const [mode, setMode] = useState<Mode>('auth')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [pwFocused, setPwFocused] = useState(false)
  const [loading, setLoading] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)
  const [forgotError, setForgotError] = useState('')

  // Show OAuth error if we were redirected back from a failed OAuth attempt
  const [error, setError] = useState<string>(() => {
    if (sessionStorage.getItem('dm_oauth_error') === '1') {
      sessionStorage.removeItem('dm_oauth_error')
      return 'Sign-in failed. Please try again or use email and password.'
    }
    return ''
  })

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

  async function handleForgotSubmit(e: React.FormEvent) {
    e.preventDefault()
    setForgotError('')
    setForgotLoading(true)
    try {
      await api.post<{ message: string }>('/auth/forgot-password', { email: forgotEmail })
      setForgotSent(true)
    } catch (err) {
      setForgotError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setForgotLoading(false)
    }
  }

  const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
  const showRequirements = tab === 'signup' && (pwFocused || (password.length > 0 && !pwValid))

  useEffect(() => {
    document.body.classList.add('auth-modal-open')
    const activeElement = document.activeElement
    if (activeElement instanceof HTMLElement) activeElement.blur()

    return () => {
      document.body.classList.remove('auth-modal-open')
    }
  }, [])

  const forgotContent = (
    <div className="auth-overlay" onClick={onClose}>
      <div
        className="auth-modal"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Reset password"
      >
        <button className="auth-close" onClick={onClose}>&times;</button>
        <div className="auth-tabs">
          <button className="auth-tab active">Reset password</button>
        </div>
        {forgotSent ? (
          <div className="auth-form">
            <p style={{ margin: '0 0 12px', fontSize: '0.9rem', color: 'var(--text-secondary, #aaa)' }}>
              If an account with that email exists, a reset link has been sent. Check your inbox.
            </p>
            <button
              className="auth-submit"
              onClick={() => { setMode('auth'); setForgotSent(false); setForgotEmail('') }}
            >
              Back to login
            </button>
          </div>
        ) : (
          <form onSubmit={handleForgotSubmit} className="auth-form">
            <input
              type="email"
              placeholder="Your email"
              value={forgotEmail}
              onChange={e => setForgotEmail(e.target.value)}
              required
              autoFocus
              autoComplete="email"
              className="auth-input"
            />
            {forgotError && <div className="auth-error">{forgotError}</div>}
            <button type="submit" className="auth-submit" disabled={forgotLoading}>
              {forgotLoading ? '...' : 'Send reset link'}
            </button>
            <button
              type="button"
              className="auth-forgot"
              onClick={() => { setMode('auth'); setForgotError('') }}
            >
              Back to login
            </button>
          </form>
        )}
      </div>
    </div>
  )

  const authContent = (
    <div className="auth-overlay" onClick={onClose}>
      <div
        className="auth-modal"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={tab === 'login' ? 'Log in' : 'Sign up'}
      >
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
          <input
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
            <input
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
          {tab === 'login' && (
            <button
              type="button"
              className="auth-forgot"
              onClick={() => { setForgotEmail(email); setForgotError(''); setMode('forgot') }}
            >
              Forgot password?
            </button>
          )}
        </form>

        <div className="auth-divider">
          <span>or</span>
        </div>

        <div className="auth-oauth">
          <a href={`${API_BASE}/auth/google`} className="auth-oauth-btn auth-oauth--google">
            <GoogleIcon />
            Continue with Google
          </a>
          <a href={`${API_BASE}/auth/lichess`} className="auth-oauth-btn auth-oauth--lichess">
            <LichessIcon />
            Continue with Lichess
          </a>
        </div>
      </div>
    </div>
  )

  if (mode === 'forgot') {
    return createPortal(forgotContent, document.body)
  }

  return createPortal(authContent, document.body)
}
