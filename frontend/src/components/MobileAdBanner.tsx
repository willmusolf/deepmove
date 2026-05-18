import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { AD_CONFIG, ensureAdSenseScript, type SponsorConfig } from '../config/sponsor'
import SponsorCard from './SponsorCard'

const SESSION_KEY = 'mobileAdDismissed'

declare global {
  interface Window {
    adsbygoogle: Array<Record<string, never>>
  }
}

interface MobileAdBannerProps {
  sponsor?: SponsorConfig | null
  page?: string
}

export default function MobileAdBanner({ sponsor }: MobileAdBannerProps = {}) {
  const isPremium = useAuthStore(s => s.isPremium)
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(SESSION_KEY) === '1'
  )
  const pushed = useRef(false)

  useEffect(() => {
    if (isPremium || dismissed || sponsor || pushed.current || !AD_CONFIG.enabled || !AD_CONFIG.mobileBannerSlot) return

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
  }, [isPremium, dismissed, sponsor])

  if (isPremium || dismissed) return null

  function handleDismiss() {
    sessionStorage.setItem(SESSION_KEY, '1')
    setDismissed(true)
  }

  if (sponsor) {
    return (
      <div className="mobile-ad-banner">
        <SponsorCard sponsor={sponsor} variant="mobile" />
        <button
          className="mobile-ad-banner__close"
          onClick={handleDismiss}
          aria-label="Dismiss sponsor"
        >
          ×
        </button>
      </div>
    )
  }

  if (!AD_CONFIG.enabled || !AD_CONFIG.mobileBannerSlot) return null

  return (
    <div className="mobile-ad-banner">
      <ins
        className="adsbygoogle"
        style={{ display: 'inline-block', width: '320px', height: '50px' }}
        data-ad-client={AD_CONFIG.client}
        data-ad-slot={AD_CONFIG.mobileBannerSlot}
        data-ad-format="fixed"
      />
      <button
        className="mobile-ad-banner__close"
        onClick={handleDismiss}
        aria-label="Dismiss ad"
      >
        ×
      </button>
    </div>
  )
}
