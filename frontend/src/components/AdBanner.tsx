import { useEffect, useRef } from 'react'
import { useAuthStore } from '../stores/authStore'
import { AD_CONFIG, ensureAdSenseScript } from '../config/sponsor'

interface AdBannerProps {
  slot?: string
  format?: 'auto' | 'rectangle' | 'vertical'
  className?: string
  sponsor?: unknown
  placement?: string
  page?: string
}

declare global {
  interface Window {
    adsbygoogle: unknown[]
  }
}

export default function AdBanner({ slot, format = 'auto', className }: AdBannerProps) {
  const isPremium = useAuthStore(s => s.isPremium)
  const pushed = useRef(false)

  useEffect(() => {
    if (isPremium || pushed.current || !AD_CONFIG.enabled || !slot) return

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
  }, [isPremium, slot])

  if (isPremium || !AD_CONFIG.enabled || !slot) return null

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
