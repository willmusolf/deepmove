// UserMenu.tsx — User avatar/sign-in button for the sidebar.
import { useState, useRef, useEffect } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { migrateOnSignup, syncGames } from '../../services/syncService'
import { getPlayerProfile } from '../../api/chesscom'
import AuthModal from './AuthModal'
import type { Page } from '../Layout/NavSidebar'

interface UserMenuProps {
  currentPage: Page
  onNavigate: (page: Page) => void
}

export default function UserMenu({ currentPage, onNavigate }: UserMenuProps) {
  const user = useAuthStore(s => s.user)
  const isLoading = useAuthStore(s => s.isLoading)
  const [showAuth, setShowAuth] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const wasLoggedIn = useRef(!!user)

  // Fetch Chess.com avatar when username is available
  useEffect(() => {
    if (!user?.chesscom_username) { setAvatarUrl(null); return }
    getPlayerProfile(user.chesscom_username).then(p => {
      setAvatarUrl(p?.avatar ?? null)
    })
  }, [user?.chesscom_username])

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

    setTimeout(() => setSyncMsg(''), 3000)
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

  // Display name: prefer chess platform username, fall back to email prefix
  const displayName =
    user.chesscom_username ||
    user.lichess_username ||
    user.email.split('@')[0]

  const initial = displayName[0].toUpperCase()

  return (
    <div className="nav-user">
      {syncMsg && <div className="nav-sync-msg">{syncMsg}</div>}
      <button
        className={`nav-user-btn${currentPage === 'settings' ? ' active' : ''}`}
        onClick={() => onNavigate('settings')}
        title="Profile & Settings"
      >
        <span className="nav-user-avatar-wrap">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              className="nav-user-avatar nav-user-avatar--img"
            />
          ) : (
            <span className="nav-user-avatar">{initial}</span>
          )}
        </span>
        <span className="nav-user-name">{displayName}</span>
      </button>
    </div>
  )
}
