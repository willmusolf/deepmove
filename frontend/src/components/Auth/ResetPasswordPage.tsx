import { useState } from 'react'
import { api } from '../../api/client'

interface Props {
  onDone: () => void
}

export default function ResetPasswordPage({ onDone }: Props) {
  const token = new URLSearchParams(window.location.search).get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  if (!token) {
    return (
      <div className="document-page">
        <div className="document-page__content">
          <h1>Invalid reset link</h1>
          <p>This password reset link is missing or malformed.</p>
          <button className="auth-submit" onClick={onDone}>Go to DeepMove</button>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="document-page">
        <div className="document-page__content">
          <h1>Password reset</h1>
          <p>Your password has been updated. You can now log in with your new password.</p>
          <button className="auth-submit" onClick={onDone}>Go to DeepMove</button>
        </div>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    try {
      await api.post<{ message: string }>('/auth/reset-password', {
        token,
        new_password: password,
      })
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. The link may have expired.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="document-page">
      <div className="document-page__content">
        <h1>Reset your password</h1>
        <form onSubmit={handleSubmit} className="auth-form" style={{ maxWidth: 360 }}>
          <input
            type="password"
            placeholder="New password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoFocus
            autoComplete="new-password"
            className="auth-input"
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            required
            autoComplete="new-password"
            className="auth-input"
          />
          {error && <div className="auth-error">{error}</div>}
          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? '...' : 'Set new password'}
          </button>
        </form>
      </div>
    </div>
  )
}
