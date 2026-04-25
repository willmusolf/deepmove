// UserMenu.tsx — User avatar/sign-in button for the sidebar.
import { useState, useEffect } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { getPlayerProfile } from '../../api/chesscom'
import { getIdentity } from '../../services/identity'
import AuthModal from './AuthModal'
import type { Page } from '../Layout/NavSidebar'

interface UserMenuProps {
  currentPage: Page
  onNavigate: (page: Page) => void
  collapsed?: boolean
}

export default function UserMenu({ currentPage, onNavigate, collapsed = false }: UserMenuProps) {
  const user = useAuthStore(s => s.user)
  const isLoading = useAuthStore(s => s.isLoading)
  const updateProfile = useAuthStore(s => s.updateProfile)
  const [showAuth, setShowAuth] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  // Fetch avatar when Chess.com username is linked. Lichess doesn't expose
  // avatar URLs in their API, so Lichess-only users get the initial fallback.
  useEffect(() => {
    if (!user?.chesscom_username) { setAvatarUrl(null); return }
    getPlayerProfile(user.chesscom_username).then(p => {
      setAvatarUrl(p?.avatar ?? null)
    })
  }, [user?.chesscom_username, user?.lichess_username])

  if (isLoading) return null

  function handleAuthSuccess() {
    setShowAuth(false)
    // If the user confirmed their chess account before logging in, sync it to
    // the backend now so the avatar loads immediately.
    const currentUser = useAuthStore.getState().user
    if (!currentUser) return
    const identity = getIdentity()
    const patch: { chesscom_username?: string; lichess_username?: string } = {}
    if (identity.chesscom && !currentUser.chesscom_username) patch.chesscom_username = identity.chesscom
    if (identity.lichess && !currentUser.lichess_username) patch.lichess_username = identity.lichess
    if (Object.keys(patch).length > 0) updateProfile(patch).catch(() => {})
  }

  if (!user) {
    if (collapsed) {
      return (
        <div className="nav-user nav-user--collapsed">
          <button
            className="nav-user-icon-btn"
            onClick={() => setShowAuth(true)}
            title="Sign In"
          >
            ⊙
          </button>
          {showAuth && (
            <AuthModal
              onClose={() => setShowAuth(false)}
              onSuccess={handleAuthSuccess}
            />
          )}
        </div>
      )
    }
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

  if (collapsed) {
    return (
      <div className="nav-user nav-user--collapsed">
        <button
          className={`nav-user-btn${currentPage === 'settings' ? ' active' : ''}`}
          onClick={() => onNavigate('settings')}
          title={displayName + ' — Profile & Settings'}
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
        </button>
      </div>
    )
  }

  return (
    <div className="nav-user">
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
