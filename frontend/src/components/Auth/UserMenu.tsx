// UserMenu.tsx — User avatar/sign-in button for the sidebar.
import { useState, useRef } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { migrateOnSignup, syncGames } from '../../services/syncService'
import AuthModal from './AuthModal'

export default function UserMenu() {
  const user = useAuthStore(s => s.user)
  const isLoading = useAuthStore(s => s.isLoading)
  const logout = useAuthStore(s => s.logout)
  const [showAuth, setShowAuth] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const wasLoggedIn = useRef(!!user)

  if (isLoading) return null

  async function handleAuthSuccess() {
    setShowAuth(false)
    const isNewUser = !wasLoggedIn.current
    wasLoggedIn.current = true

    try {
      if (isNewUser && !localStorage.getItem('deepmove_migrated')) {
        setSyncMsg('Syncing your games...')
        const result = await migrateOnSignup()
        if (result.uploaded > 0) {
          setSyncMsg(`Synced ${result.uploaded} game${result.uploaded !== 1 ? 's' : ''}`)
        } else {
          setSyncMsg('')
        }
      } else {
        setSyncMsg('Syncing...')
        const result = await syncGames()
        const total = result.uploaded + result.downloaded
        setSyncMsg(total > 0 ? `Synced ${total} game${total !== 1 ? 's' : ''}` : '')
      }
    } catch {
      setSyncMsg('')
    }

    // Clear sync message after 3 seconds
    if (syncMsg || true) {
      setTimeout(() => setSyncMsg(''), 3000)
    }
  }

  if (!user) {
    return (
      <>
        <div className="nav-user">
          <button className="nav-signin-btn" onClick={() => setShowAuth(true)}>
            Sign In
          </button>
        </div>
        {showAuth && (
          <AuthModal
            onClose={() => setShowAuth(false)}
            onSuccess={handleAuthSuccess}
          />
        )}
      </>
    )
  }

  const initial = user.email[0].toUpperCase()

  return (
    <div className="nav-user">
      {syncMsg && <div className="nav-sync-msg">{syncMsg}</div>}
      <button
        className="nav-user-btn"
        onClick={() => setShowDropdown(v => !v)}
      >
        <span className="nav-user-avatar">{initial}</span>
        <span className="nav-user-email">{user.email}</span>
      </button>
      {showDropdown && (
        <div className="nav-user-dropdown">
          {user.chesscom_username && (
            <div className="nav-user-link">Chess.com: {user.chesscom_username}</div>
          )}
          {user.lichess_username && (
            <div className="nav-user-link">Lichess: {user.lichess_username}</div>
          )}
          <button
            className="nav-user-logout"
            onClick={() => { logout(); setShowDropdown(false); wasLoggedIn.current = false }}
          >
            Log Out
          </button>
        </div>
      )}
    </div>
  )
}
