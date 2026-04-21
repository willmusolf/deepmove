import UserMenu from '../Auth/UserMenu'

export type Page = 'review' | 'practice' | 'play' | 'dashboard' | 'settings' | 'about'

interface NavSidebarProps {
  currentPage: Page
  onNavigate: (page: Page) => void
  collapsed?: boolean
  onToggleCollapse?: () => void
}

const MAIN_ITEMS = [
  { id: 'review' as const, label: 'Review', icon: '♟' },
  { id: 'play'   as const, label: 'Play',   icon: '▶' },
]

const SOON_ITEMS = [
  { id: 'practice'  as const, label: 'Practice',  icon: '◎' },
  { id: 'dashboard' as const, label: 'Dashboard', icon: '▨' },
  { id: 'about'     as const, label: 'About',     icon: 'ⓘ' },
]

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

      {MAIN_ITEMS.map(item => (
        <div
          key={item.id}
          className={`nav-item${currentPage === item.id ? ' active' : ''}`}
          onClick={() => onNavigate(item.id)}
          title={collapsed ? item.label : undefined}
        >
          <span className="nav-icon">{item.icon}</span>
          {!collapsed && <span>{item.label}</span>}
        </div>
      ))}

      <div className="nav-divider" />

      {SOON_ITEMS.map(item => (
        <div
          key={item.id}
          className={`nav-item${currentPage === item.id ? ' active' : ''}`}
          onClick={() => onNavigate(item.id)}
          title={collapsed ? item.label : undefined}
        >
          <span className="nav-icon">{item.icon}</span>
          {!collapsed && <span>{item.label}</span>}
          {!collapsed && <span className="nav-soon">Soon</span>}
        </div>
      ))}

      <div className="nav-spacer" />
      <UserMenu currentPage={currentPage} onNavigate={onNavigate} collapsed={collapsed} />
    </nav>
  )
}
