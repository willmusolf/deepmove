import { describe, expect, it } from 'vitest'
import { getPageFromPathname, getPathForPage, getPageMeta, isIndexablePage } from './pageMeta'

describe('pageMeta routing', () => {
  it('uses the review app at the root path', () => {
    expect(getPageFromPathname('/')).toBe('review')
    expect(getPathForPage('review')).toBe('/')
  })

  it('moves the about page onto its own route', () => {
    expect(getPageFromPathname('/about')).toBe('about')
    expect(getPathForPage('about')).toBe('/about')
  })

  it('keeps the review route non-indexable', () => {
    expect(isIndexablePage('review')).toBe(false)
  })

  it('keeps canonical metadata aligned to the remapped routes', () => {
    expect(getPageMeta('review').canonicalUrl).toBe('https://www.deepmove.io')
    expect(getPageMeta('about').canonicalUrl).toBe('https://www.deepmove.io/about')
    expect(isIndexablePage('about')).toBe(true)
  })
})
