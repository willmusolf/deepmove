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
        <path d="M12 2.9 6.5 5.35v5.4c0 4.05 2.24 7.63 5.5 9.35 3.26-1.72 5.5-5.3 5.5-9.35v-5.4L12 2.9Z" />
        <path d="M10.65 10.95V9.9a1.35 1.35 0 1 1 2.7 0v1.05" />
        <rect x="9.3" y="10.95" width="5.4" height="4.6" rx="1.05" />
        <path d="M12 13.1v.95" />
      </svg>
    ),
  },
]

const ACCOUNT_ITEMS = [
  {
    id: 'settings' as const,
    label: 'Settings',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M11.47 2.88a1.85 1.85 0 0 1 1.06 0c.52.15.92.57 1.05 1.1l.18.7c.12.47.52.79 1 .81l.72.04a1.86 1.86 0 0 1 .91.31c.44.31.7.82.7 1.36 0 .2-.04.4-.1.58l-.24.67c-.17.44-.03.93.34 1.23l.56.44c.42.33.66.83.66 1.36s-.24 1.03-.66 1.36l-.56.44c-.37.3-.51.79-.34 1.23l.24.67c.06.18.1.38.1.58 0 .54-.26 1.05-.7 1.36-.27.19-.58.3-.91.31l-.72.04c-.48.02-.88.34-1 .81l-.18.7c-.13.53-.53.95-1.05 1.1a1.85 1.85 0 0 1-1.06 0c-.52-.15-.92-.57-1.05-1.1l-.18-.7c-.12-.47-.52-.79-1-.81l-.72-.04a1.86 1.86 0 0 1-.91-.31 1.67 1.67 0 0 1-.7-1.36c0-.2.04-.4.1-.58l.24-.67c.17-.44.03-.93-.34-1.23l-.56-.44a1.72 1.72 0 0 1-.66-1.36c0-.53.24-1.03.66-1.36l.56-.44c.37-.3.51-.79.34-1.23l-.24-.67a1.72 1.72 0 0 1-.1-.58c0-.54.26-1.05.7-1.36.27-.19.58-.3.91-.31l.72-.04c.48-.02.88-.34 1-.81l.18-.7c.13-.53.53-.95 1.05-1.1ZM12 8.45a3.55 3.55 0 1 0 0 7.1 3.55 3.55 0 0 0 0-7.1Z"
          clipRule="evenodd"
        />
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
      <span className={`nav-icon nav-icon--${item.id}`}>{item.icon}</span>
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
      <div className="nav-divider" />
      <UserMenu currentPage={currentPage} onNavigate={onNavigate} collapsed={collapsed} />
    </nav>
  )
}
