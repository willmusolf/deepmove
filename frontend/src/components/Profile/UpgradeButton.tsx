import { useState } from 'react'
import { useAuthStore } from '../../stores/authStore'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export default function UpgradeButton() {
  const user = useAuthStore(s => s.user)
  const accessToken = useAuthStore(s => s.accessToken)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!user) return null

  async function handleClick() {
    setLoading(true)
    setError(null)
    const endpoint = user!.is_premium ? '/payments/portal' : '/payments/checkout'
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: `Error ${res.status}` }))
        throw new Error(body.detail ?? `Error ${res.status}`)
      }
      const { url } = await res.json()
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <div className="upgrade-button-wrap">
      <button
        className={`upgrade-button ${user.is_premium ? 'upgrade-button--manage' : ''}`}
        onClick={handleClick}
        disabled={loading}
      >
        {loading ? 'Loading...' : user.is_premium ? 'Premium · Manage' : 'Upgrade · $5/mo'}
      </button>
      {error && <p className="upgrade-button__error">{error}</p>}
    </div>
  )
}
