import { useEffect, useRef } from 'react'
import { useAuthStore } from '../stores/authStore'
import { AD_CONFIG, ensureAdSenseScript, ensureEzoicScripts, type SponsorConfig } from '../config/sponsor'
import SponsorCard from './SponsorCard'

interface AdBannerProps {
  slot?: string
  placeholderId?: number | null
  format?: 'auto' | 'rectangle' | 'vertical'
  className?: string
  sponsor?: SponsorConfig | null
  placement?: string
  page?: string
}

declare global {
  interface Window {
    adsbygoogle: Array<Record<string, never>>
    ezstandalone: {
      cmd: Array<() => void>
      showAds: (...ids: number[]) => void
      destroyPlaceholders?: (...ids: number[]) => void
    }
  }
}

export default function AdBanner({ slot, placeholderId, format = 'auto', className, sponsor, placement }: AdBannerProps) {
  const isPremium = useAuthStore(s => s.isPremium)
  const pushed = useRef(false)

  useEffect(() => {
    if (isPremium || sponsor || pushed.current || placeholderId !== null && placeholderId !== undefined) return
    if (!AD_CONFIG.enabled || !slot) return

    let cancelled = false

    void ensureAdSenseScript()
      .then(() => {
        if (cancelled || pushed.current) return
        pushed.current = true
        ;(window.adsbygoogle = window.adsbygoogle || []).push({})
      })
      .catch(() => {
        // Ads stay dormant until AdSense is approved and enabled.
      })

    return () => {
      cancelled = true
    }
  }, [isPremium, slot, sponsor, placeholderId])

  useEffect(() => {
    if (isPremium || sponsor || placeholderId === null || placeholderId === undefined) return

    let cancelled = false

    void ensureEzoicScripts()
      .then(() => {
        if (cancelled) return
        window.ezstandalone.cmd.push(() => {
          window.ezstandalone.showAds(placeholderId)
        })
      })
      .catch(() => {
        // Keep the slot empty if Ezoic has not been configured yet.
      })

    return () => {
      cancelled = true
      if (window.ezstandalone?.destroyPlaceholders) {
        window.ezstandalone.cmd.push(() => {
          window.ezstandalone.destroyPlaceholders?.(placeholderId)
        })
      }
    }
  }, [isPremium, sponsor, placeholderId])

  if (isPremium) return null

  if (sponsor) {
    return <SponsorCard sponsor={sponsor} variant={placement === 'inline' ? 'inline' : 'rail'} />
  }

  if (placeholderId !== null && placeholderId !== undefined) {
    const variant = placement === 'inline' ? 'inline' : 'rail'
    return (
      <div
        id={`ezoic-pub-ad-placeholder-${placeholderId}`}
        className={`ezoic-ad-placeholder ezoic-ad-placeholder--${variant}`}
      />
    )
  }

  if (!AD_CONFIG.enabled || !slot) return null

  return (
    <ins
      className={`adsbygoogle${className ? ` ${className}` : ''}`}
      style={{ display: 'block' }}
      data-ad-client={AD_CONFIG.client}
      data-ad-slot={slot}
      data-ad-format={format}
      data-full-width-responsive="true"
    />
  )
}
