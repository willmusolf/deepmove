import UserMenu from '../Auth/UserMenu'

export type Page = 'review' | 'practice' | 'play' | 'dashboard' | 'settings' | 'about'

interface NavSidebarProps {
  currentPage: Page
  onNavigate: (page: Page) => void
  collapsed?: boolean
  onToggleCollapse?: () => void
}

const NAV_ITEMS = [
  { id: 'review'    as const, label: 'Review',    icon: '♟', soon: false },
  { id: 'practice'  as const, label: 'Practice',  icon: '◎', soon: true  },
  { id: 'play'      as const, label: 'Play',       icon: '⚔', soon: false },
  { id: 'dashboard' as const, label: 'Dashboard', icon: '▦', soon: true  },
  { id: 'about'     as const, label: 'About',     icon: 'ⓘ', soon: true  },
]

export default function NavSidebar({ currentPage, onNavigate, collapsed = false, onToggleCollapse }: NavSidebarProps) {
  return (
    <nav className="nav-sidebar">
      <div className="nav-logo">
        <img src="/DeepMove.png" alt="DeepMove" className="nav-logo__img" />
        {!collapsed && <span className="nav-logo__name">DeepMove</span>}
      </div>
      {NAV_ITEMS.map(item => (
        <div
          key={item.id}
          className={`nav-item${currentPage === item.id ? ' active' : ''}`}
          onClick={() => onNavigate(item.id)}
          title={collapsed ? item.label : undefined}
        >
          <span className="nav-icon">{item.icon}</span>
          {!collapsed && <span>{item.label}</span>}
          {!collapsed && item.soon && <span className="nav-soon">Soon</span>}
        </div>
      ))}
      <div className="nav-spacer" />
      {onToggleCollapse && (
        <button
          type="button"
          className="nav-collapse-btn"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          {collapsed ? '☰' : '‹'}
        </button>
      )}
      {!collapsed && <UserMenu currentPage={currentPage} onNavigate={onNavigate} />}
    </nav>
  )
}
