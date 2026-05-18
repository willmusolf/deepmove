import type { ReactNode } from 'react'
import UserMenu from '../Auth/UserMenu'

export type Page = 'review' | 'practice' | 'play' | 'dashboard' | 'settings' | 'profile' | 'about' | 'privacy' | 'reset-password'

interface NavSidebarProps {
  currentPage: Page
  onNavigate: (page: Page) => void
  collapsed?: boolean
  onToggleCollapse?: () => void
}

const MAIN_ITEMS = [
  {
    id: 'review' as const,
    label: 'Review',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.5 21h5" />
        <path d="M8 21h8" />
        <path d="M9 18h6" />
        <path d="M9 18c0-2.2 1.2-3.2 1.2-4.8 0-.8-.4-1.7-1.2-2.8h6c-.8 1.1-1.2 2-1.2 2.8 0 1.6 1.2 2.6 1.2 4.8" />
        <path d="M11.4 10.4c-.9-1.1-1.4-2.2-1.4-3.4 0-2 1.4-3.5 3.4-3.5S16.8 5 16.8 7c0 1.2-.5 2.3-1.4 3.4" />
        <path d="M12 5.2c.5-.7 1.1-1.1 1.8-1.1" />
      </svg>
    ),
  },
  {
    id: 'play' as const,
    label: 'Play',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
        <path d="M8 6.5v11l9-5.5-9-5.5Z" />
      </svg>
    ),
  },
]

const INFO_ITEMS = [
  {
    id: 'about' as const,
    label: 'About',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 10v6" />
        <circle cx="12" cy="7.5" r="0.7" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    id: 'privacy' as const,
    label: 'Privacy',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l7 3v5c0 4.4-2.8 8.4-7 10-4.2-1.6-7-5.6-7-10V6l7-3Z" />
        <path d="M9.5 11.5V10a2.5 2.5 0 0 1 5 0v1.5" />
        <rect x="8" y="11.5" width="8" height="6.5" rx="1.2" />
      </svg>
    ),
  },
]

const ACCOUNT_ITEMS = [
  {
    id: 'settings' as const,
    label: 'Settings',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3.2" />
        <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 0 1 0 2.8 2 2 0 0 1-2.8 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 0 1-4 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 0 1-2.8 0 2 2 0 0 1 0-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 0 1 0-4h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 0 1 0-2.8 2 2 0 0 1 2.8 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a2 2 0 0 1 4 0v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 0 1 2.8 0 2 2 0 0 1 0 2.8l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6h.2a2 2 0 0 1 0 4h-.2a1 1 0 0 0-.9.6Z" />
      </svg>
    ),
  },
]

function renderItem(
  item: { id: Page; label: string; icon: ReactNode },
  currentPage: Page,
  onNavigate: (page: Page) => void,
  collapsed: boolean,
) {
  return (
    <div
      key={item.id}
      className={`nav-item${currentPage === item.id ? ' active' : ''}`}
      onClick={() => onNavigate(item.id)}
      title={collapsed ? item.label : undefined}
    >
      <span className="nav-icon">{item.icon}</span>
      {!collapsed && <span>{item.label}</span>}
    </div>
  )
}

export default function NavSidebar({ currentPage, onNavigate, collapsed = false, onToggleCollapse }: NavSidebarProps) {
  return (
    <nav className="nav-sidebar">
      <div className="nav-logo" onClick={() => onNavigate('about')} title="Go to Home">
        <img src="/DeepMove.png" alt="DeepMove" className="nav-logo__img" />
        {!collapsed && <span className="nav-logo__name">DeepMove</span>}
        {onToggleCollapse && (
          <button
            type="button"
            className="nav-logo-toggle"
            onClick={e => { e.stopPropagation(); onToggleCollapse() }}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              {collapsed
                ? <polyline points="9 18 15 12 9 6" />
                : <polyline points="15 18 9 12 15 6" />
              }
            </svg>
          </button>
        )}
      </div>

      {MAIN_ITEMS.map(item => renderItem(item, currentPage, onNavigate, collapsed))}
      <div className="nav-divider" />
      {INFO_ITEMS.map(item => renderItem(item, currentPage, onNavigate, collapsed))}
      <div className="nav-divider" />
      {ACCOUNT_ITEMS.map(item => renderItem(item, currentPage, onNavigate, collapsed))}
      <UserMenu currentPage={currentPage} onNavigate={onNavigate} collapsed={collapsed} />
    </nav>
  )
}
