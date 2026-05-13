import type { Page } from '../components/Layout/NavSidebar'

export function normalizeRestoredPage(page: Page): Page {
  if (page === 'practice' || page === 'dashboard') return 'review'
  return page
}
