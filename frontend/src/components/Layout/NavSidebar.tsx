import UserMenu from '../Auth/UserMenu'

export type Page = 'review' | 'dashboard' | 'settings' | 'about'

interface NavSidebarProps {
  currentPage: Page
  onNavigate: (page: Page) => void
}

const NAV_ITEMS = [
  { id: 'review' as const,    label: 'Review',    icon: '♟', soon: false },
  { id: 'dashboard' as const, label: 'Dashboard', icon: '▦', soon: true  },
  { id: 'settings' as const,  label: 'Settings',  icon: '⚙', soon: true  },
  { id: 'about' as const,     label: 'About',     icon: 'ⓘ', soon: true  },
]

export default function NavSidebar({ currentPage, onNavigate }: NavSidebarProps) {
  return (
    <nav className="nav-sidebar">
      <div className="nav-logo">
        <img src="/DeepMove.png" alt="DeepMove" className="nav-logo__img" />
        <span className="nav-logo__name">DeepMove</span>
      </div>
      {NAV_ITEMS.map(item => (
        <div
          key={item.id}
          className={`nav-item${currentPage === item.id ? ' active' : ''}`}
          onClick={() => onNavigate(item.id)}
        >
          <span className="nav-icon">{item.icon}</span>
          <span>{item.label}</span>
          {item.soon && <span className="nav-soon">Soon</span>}
        </div>
      ))}
      <div className="nav-spacer" />
      <UserMenu />
    </nav>
  )
}
