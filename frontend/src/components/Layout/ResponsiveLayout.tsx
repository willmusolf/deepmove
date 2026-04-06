import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import NavSidebar, { type Page } from './NavSidebar'

interface ResponsiveLayoutProps {
  currentPage: Page
  onNavigate: (page: Page) => void
  children: ReactNode
}

const COMPACT_NAV_MEDIA_QUERY = '(max-width: 1023px)'

const PAGE_LABELS: Record<Page, string> = {
  review: 'Review',
  play: 'Play',
  dashboard: 'Dashboard',
  settings: 'Settings',
  about: 'About',
}

export default function ResponsiveLayout({ currentPage, onNavigate, children }: ResponsiveLayoutProps) {
  const [isCompactNav, setIsCompactNav] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia(COMPACT_NAV_MEDIA_QUERY).matches
  ))
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia(COMPACT_NAV_MEDIA_QUERY)
    const syncLayout = () => {
      setIsCompactNav(mediaQuery.matches)
      if (!mediaQuery.matches) setNavOpen(false)
    }

    syncLayout()

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncLayout)
      return () => mediaQuery.removeEventListener('change', syncLayout)
    }

    mediaQuery.addListener(syncLayout)
    return () => mediaQuery.removeListener(syncLayout)
  }, [])

  useEffect(() => {
    setNavOpen(false)
  }, [currentPage])

  useEffect(() => {
    if (!navOpen) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavOpen(false)
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [navOpen])

  function handleNavigate(page: Page) {
    onNavigate(page)
    setNavOpen(false)
  }

  return (
    <div className={`app app-shell${isCompactNav ? ' app-shell--compact-nav' : ''}${navOpen ? ' app-shell--nav-open' : ''}`}>
      {isCompactNav && (
        <button
          type="button"
          className="app-shell__backdrop"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
        />
      )}

      <NavSidebar currentPage={currentPage} onNavigate={handleNavigate} />

      <div className="app-content">
        {isCompactNav && (
          <header className="app-header">
            <button
              type="button"
              className="app-header__menu"
              aria-label="Open navigation"
              aria-expanded={navOpen}
              onClick={() => setNavOpen(true)}
            >
              Menu
            </button>

            <div className="app-header__brand">
              <img src="/DeepMove.png" alt="" className="app-header__brand-mark" />
              <span className="app-header__brand-name">DeepMove</span>
            </div>

            <span className="app-header__page">{PAGE_LABELS[currentPage]}</span>
          </header>
        )}

        {children}
      </div>
    </div>
  )
}
