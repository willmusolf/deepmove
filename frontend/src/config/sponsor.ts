import type { Page } from '../components/Layout/NavSidebar'

export interface SponsorConfig {
  name: string
  url: string
  copy: string
  cta: string
  label: string
  imageUrl?: string
}

const SPONSOR_ENABLED = import.meta.env.VITE_SPONSOR_ENABLED === 'true'
const SPONSOR_NAME = (import.meta.env.VITE_SPONSOR_NAME ?? '').trim()
const SPONSOR_URL = (import.meta.env.VITE_SPONSOR_URL ?? '').trim()
const SPONSOR_COPY = (
  import.meta.env.VITE_SPONSOR_COPY
  ?? 'Support DeepMove by checking out this chess-friendly sponsor.'
).trim()
const SPONSOR_CTA = (import.meta.env.VITE_SPONSOR_CTA ?? 'Learn more').trim()
const SPONSOR_LABEL = (import.meta.env.VITE_SPONSOR_LABEL ?? 'Sponsored').trim()
const SPONSOR_IMAGE_URL = (import.meta.env.VITE_SPONSOR_IMAGE_URL ?? '').trim()

export const ACTIVE_SPONSOR: SponsorConfig | null = SPONSOR_ENABLED && SPONSOR_NAME && SPONSOR_URL
  ? {
      name: SPONSOR_NAME,
      url: SPONSOR_URL,
      copy: SPONSOR_COPY,
      cta: SPONSOR_CTA,
      label: SPONSOR_LABEL,
      imageUrl: SPONSOR_IMAGE_URL || undefined,
    }
  : null

const ADSENSE_CLIENT = 'ca-pub-6306891304675674'
const ADSENSE_ENABLED = import.meta.env.VITE_ADSENSE_ENABLED === 'true'
// Keep ad units disabled until the site has cleared review and placements are
// intentionally re-enabled in production.
const ADSENSE_APPROVED = import.meta.env.VITE_ADSENSE_APPROVED === 'true'
const DESKTOP_RAIL_SLOT = (import.meta.env.VITE_ADSENSE_DESKTOP_RAIL_SLOT ?? '').trim()
const MOBILE_BANNER_SLOT = (import.meta.env.VITE_ADSENSE_MOBILE_BANNER_SLOT ?? '').trim()

const EZOIC_ENABLED = import.meta.env.VITE_EZOIC_ENABLED === 'true'
const EZOIC_DESKTOP_RAIL_PLACEHOLDER_ID = Number.parseInt(
  (import.meta.env.VITE_EZOIC_DESKTOP_RAIL_PLACEHOLDER ?? '').trim(),
  10,
)
const EZOIC_INLINE_PLACEHOLDER_ID = Number.parseInt(
  (import.meta.env.VITE_EZOIC_INLINE_PLACEHOLDER ?? '').trim(),
  10,
)

export const RAIL_AD_PAGE_SET = new Set<Page>(['review', 'play'])
export const MOBILE_BANNER_PAGE_SET = new Set<Page>(['review', 'play'])

export const desktopRailAdEnabled = ADSENSE_ENABLED && ADSENSE_APPROVED && DESKTOP_RAIL_SLOT.length > 0
export const mobileBannerAdEnabled = ADSENSE_ENABLED && ADSENSE_APPROVED && MOBILE_BANNER_SLOT.length > 0

export const AD_CONFIG = {
  client: ADSENSE_CLIENT,
  enabled: ADSENSE_ENABLED && ADSENSE_APPROVED,
  desktopRailSlot: DESKTOP_RAIL_SLOT,
  mobileBannerSlot: MOBILE_BANNER_SLOT,
} as const

export const EZOIC_CONFIG = {
  enabled: EZOIC_ENABLED,
  desktopRailPlaceholderId: Number.isFinite(EZOIC_DESKTOP_RAIL_PLACEHOLDER_ID)
    ? EZOIC_DESKTOP_RAIL_PLACEHOLDER_ID
    : null,
  inlinePlaceholderId: Number.isFinite(EZOIC_INLINE_PLACEHOLDER_ID)
    ? EZOIC_INLINE_PLACEHOLDER_ID
    : null,
  desktopRailEnabled: EZOIC_ENABLED && Number.isFinite(EZOIC_DESKTOP_RAIL_PLACEHOLDER_ID),
  inlineEnabled: EZOIC_ENABLED && Number.isFinite(EZOIC_INLINE_PLACEHOLDER_ID),
} as const

let adsenseScriptPromise: Promise<void> | null = null
let ezoicScriptPromise: Promise<void> | null = null

function loadExternalScript(
  src: string,
  datasetKey: string,
  attrs: Record<string, string> = {},
): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>(`script[data-deepmove-script="${datasetKey}"]`)
  if (existing) {
    if (existing.dataset.loaded === 'true') return Promise.resolve()
    return new Promise<void>((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error(`Failed to load script: ${src}`)), { once: true })
    })
  }

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.dataset.deepmoveScript = datasetKey
    Object.entries(attrs).forEach(([key, value]) => {
      script.setAttribute(key, value)
    })
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true'
      resolve()
    }, { once: true })
    script.addEventListener('error', () => reject(new Error(`Failed to load script: ${src}`)), { once: true })
    document.head.appendChild(script)
  })
}

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

export function ensureEzoicScripts(): Promise<void> {
  if (!EZOIC_CONFIG.enabled) {
    return Promise.reject(new Error('Ezoic is disabled'))
  }

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Ezoic requires a browser environment'))
  }

  window.ezstandalone = window.ezstandalone || {}
  window.ezstandalone.cmd = window.ezstandalone.cmd || []

  if (ezoicScriptPromise) return ezoicScriptPromise

  ezoicScriptPromise = (async () => {
    await loadExternalScript('https://cmp.gatekeeperconsent.com/min.js', 'ezoic-cmp-primary', { 'data-cfasync': 'false' })
    await loadExternalScript('https://the.gatekeeperconsent.com/cmp.min.js', 'ezoic-cmp-secondary', { 'data-cfasync': 'false' })
    await loadExternalScript('https://www.ezojs.com/ezoic/sa.min.js', 'ezoic-standalone')
    await loadExternalScript('https://ezoicanalytics.com/analytics.js', 'ezoic-analytics')
  })().catch(error => {
    ezoicScriptPromise = null
    throw error
  })

  return ezoicScriptPromise
}
