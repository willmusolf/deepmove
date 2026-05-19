import type { Page } from '../components/Layout/NavSidebar'

const SITE_URL = 'https://www.deepmove.io'

const PAGE_PATHS: Record<Page, string> = {
  review: '/',
  practice: '/practice',
  play: '/play',
  dashboard: '/dashboard',
  settings: '/settings',
  profile: '/profile',
  about: '/about',
  privacy: '/privacy',
  'reset-password': '/reset-password',
}

const INDEXABLE_PAGES = new Set<Page>(['about', 'privacy'])

const PAGE_META: Record<Page, { title: string, description: string }> = {
  review: {
    title: 'DeepMove | Chess Game Review That Helps You Improve',
    description: 'DeepMove helps chess players improve with game review, best-line analysis, and clear feedback on the mistakes that matter most.',
  },
  practice: {
    title: 'DeepMove | Practice',
    description: 'Practice modes for DeepMove are in progress.',
  },
  play: {
    title: 'DeepMove | Play and Review',
    description: 'Play against the DeepMove bot and send finished games straight into review.',
  },
  dashboard: {
    title: 'DeepMove | Dashboard',
    description: 'Track your chess improvement with DeepMove.',
  },
  settings: {
    title: 'DeepMove | Settings',
    description: 'Manage your DeepMove preferences, appearance, sound, and local data.',
  },
  profile: {
    title: 'DeepMove | Profile',
    description: 'Manage your DeepMove account, linked chess profiles, ratings, and security.',
  },
  about: {
    title: 'DeepMove | Chess Improvement Through Game Review',
    description: 'Learn how DeepMove helps chess players improve by reviewing their own games, spotting repeated mistakes, and studying critical moments.',
  },
  privacy: {
    title: 'DeepMove | Privacy Policy',
    description: 'Read the DeepMove privacy policy.',
  },
  'reset-password': {
    title: 'DeepMove | Reset Password',
    description: 'Set a new password for your DeepMove account.',
  },
}

function normalizePathname(pathname: string): string {
  if (!pathname || pathname === '/') return '/'
  return pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
}

export function getPageFromPathname(pathname: string): Page | null {
  const normalized = normalizePathname(pathname)
  const entry = Object.entries(PAGE_PATHS).find(([, path]) => path === normalized)
  return (entry?.[0] as Page | undefined) ?? null
}

export function getPathForPage(page: Page): string {
  return PAGE_PATHS[page]
}

export function isIndexablePage(page: Page): boolean {
  return INDEXABLE_PAGES.has(page)
}

export function getPageMeta(page: Page) {
  const path = getPathForPage(page)
  return {
    ...PAGE_META[page],
    canonicalUrl: `${SITE_URL}${path === '/' ? '' : path}`,
  }
}
