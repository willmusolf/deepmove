import { describe, expect, it } from 'vitest'
import { getPageFromPathname, getPathForPage, getPageMeta, isIndexablePage } from './pageMeta'

describe('pageMeta routing', () => {
  it('uses the public landing page at the root path', () => {
    expect(getPageFromPathname('/')).toBe('about')
    expect(getPathForPage('about')).toBe('/')
  })

  it('keeps the legacy about route as an alias', () => {
    expect(getPageFromPathname('/about')).toBe('about')
  })

  it('moves the interactive review app off the root path', () => {
    expect(getPathForPage('review')).toBe('/review')
    expect(isIndexablePage('review')).toBe(false)
  })

  it('keeps canonical metadata rooted on the public landing page', () => {
    expect(getPageMeta('about').canonicalUrl).toBe('https://www.deepmove.io')
    expect(isIndexablePage('about')).toBe(true)
  })
})
