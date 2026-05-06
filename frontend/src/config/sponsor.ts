import type { Page } from '../components/Layout/NavSidebar'

// Sponsor configuration — keep this null unless you have a direct sponsor takeover
// to render in place of the normal ad units.
export const ACTIVE_SPONSOR: null = null

const ADSENSE_CLIENT = 'ca-pub-6306891304675674'
const ADSENSE_ENABLED = import.meta.env.VITE_ADSENSE_ENABLED === 'true'
const DESKTOP_RAIL_SLOT = (import.meta.env.VITE_ADSENSE_DESKTOP_RAIL_SLOT ?? '').trim()
const MOBILE_BANNER_SLOT = (import.meta.env.VITE_ADSENSE_MOBILE_BANNER_SLOT ?? '').trim()

export const RAIL_AD_PAGE_SET = new Set<Page>(['review'])
export const MOBILE_BANNER_PAGE_SET = new Set<Page>(['review', 'play'])

export const desktopRailAdEnabled = ADSENSE_ENABLED && DESKTOP_RAIL_SLOT.length > 0
export const mobileBannerAdEnabled = ADSENSE_ENABLED && MOBILE_BANNER_SLOT.length > 0

export const AD_CONFIG = {
  client: ADSENSE_CLIENT,
  enabled: ADSENSE_ENABLED,
  desktopRailSlot: DESKTOP_RAIL_SLOT,
  mobileBannerSlot: MOBILE_BANNER_SLOT,
} as const

let adsenseScriptPromise: Promise<void> | null = null

export function ensureAdSenseScript(): Promise<void> {
  if (!AD_CONFIG.enabled) {
    return Promise.reject(new Error('AdSense is disabled'))
  }

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('AdSense requires a browser environment'))
  }

  if (adsenseScriptPromise) return adsenseScriptPromise

  adsenseScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-deepmove-adsense="true"]')
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve()
        return
      }
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Failed to load AdSense')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.async = true
    script.crossOrigin = 'anonymous'
    script.dataset.deepmoveAdsense = 'true'
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${AD_CONFIG.client}`
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true'
      resolve()
    }, { once: true })
    script.addEventListener('error', () => reject(new Error('Failed to load AdSense')), { once: true })
    document.head.appendChild(script)
  }).catch(error => {
    adsenseScriptPromise = null
    throw error
  })

  return adsenseScriptPromise ?? Promise.reject(new Error('Failed to initialize AdSense loader'))
}
