// AuthModal.tsx — Login / Sign Up modal with email+password and OAuth buttons.
import { useState } from 'react'
import { useAuthStore } from '../../stores/authStore'

interface AuthModalProps {
  onClose: () => void
  onSuccess: () => void
}

type Tab = 'login' | 'signup'

export default function AuthModal({ onClose, onSuccess }: AuthModalProps) {
  const [tab, setTab] = useState<Tab>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const login = useAuthStore(s => s.login)
  const register = useAuthStore(s => s.register)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (tab === 'login') {
        await login(email, password)
      } else {
        await register(email, password)
      }
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

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
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoFocus
            className="auth-input"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={6}
            className="auth-input"
          />
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
