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
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
        <circle cx="12" cy="6.1" r="2.25" />
        <path d="M12 9.25c-2.08 0-3.76 1.64-3.76 3.68 0 .77.24 1.49.66 2.1-.86.66-1.45 1.58-1.69 2.62h9.58c-.24-1.04-.83-1.96-1.69-2.62.42-.61.66-1.33.66-2.1 0-2.04-1.68-3.68-3.76-3.68Z" />
        <path d="M7.65 18.75h8.7c.47 0 .85.38.85.85v.15c0 .47-.38.85-.85.85h-8.7a.85.85 0 0 1-.85-.85v-.15c0-.47.38-.85.85-.85Z" />
      </svg>
    ),
  },
  {
    id: 'dashboard' as const,
    label: 'Account Report',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="M8 15v-4" />
        <path d="M12 15V8" />
        <path d="M16 15v-6" />
        <path d="M20 15v-2" />
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
        <path d="M12 2.8 6.35 5.3v5.52c0 4.06 2.34 7.69 5.65 9.43 3.31-1.74 5.65-5.37 5.65-9.43V5.3L12 2.8Z" />
        <path d="M10.95 10.55V9.8a1.05 1.05 0 1 1 2.1 0v.75" strokeWidth="1.35" />
        <rect x="9.8" y="10.55" width="4.4" height="3.6" rx="0.9" strokeWidth="1.35" />
        <path d="M12 12.2v.7" strokeWidth="1.2" />
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
          d="M11.15 2.9h1.7c.34 0 .63.24.7.57l.3 1.56c.72.16 1.4.44 2.02.83l1.33-.86c.29-.19.67-.15.91.09l1.2 1.2c.24.24.28.62.09.91l-.86 1.33c.39.62.67 1.3.83 2.02l1.56.3c.33.07.57.36.57.7v1.7c0 .34-.24.63-.57.7l-1.56.3a6.9 6.9 0 0 1-.83 2.02l.86 1.33c.19.29.15.67-.09.91l-1.2 1.2a.71.71 0 0 1-.91.09l-1.33-.86a6.9 6.9 0 0 1-2.02.83l-.3 1.56a.71.71 0 0 1-.7.57h-1.7a.71.71 0 0 1-.7-.57l-.3-1.56a6.9 6.9 0 0 1-2.02-.83l-1.33.86a.71.71 0 0 1-.91-.09l-1.2-1.2a.71.71 0 0 1-.09-.91l.86-1.33a6.9 6.9 0 0 1-.83-2.02l-1.56-.3a.71.71 0 0 1-.57-.7v-1.7c0-.34.24-.63.57-.7l1.56-.3c.16-.72.44-1.4.83-2.02l-.86-1.33a.71.71 0 0 1 .09-.91l1.2-1.2c.24-.24.62-.28.91-.09l1.33.86c.62-.39 1.3-.67 2.02-.83l.3-1.56c.07-.33.36-.57.7-.57ZM12 8.15a3.85 3.85 0 1 0 0 7.7 3.85 3.85 0 0 0 0-7.7Z"
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
    <button
      type="button"
      key={item.id}
      className={`nav-item${currentPage === item.id ? ' active' : ''}`}
      onClick={() => onNavigate(item.id)}
      title={collapsed ? item.label : undefined}
    >
      <span className={`nav-icon nav-icon--${item.id}`}>{item.icon}</span>
      {!collapsed && <span className="nav-label">{item.label}</span>}
    </button>
  )
}

export default function NavSidebar({ currentPage, onNavigate, collapsed = false, onToggleCollapse }: NavSidebarProps) {
  return (
    <nav className="nav-sidebar">
      <div className="nav-logo" onClick={() => onNavigate('review')} title="Go to Review">
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
