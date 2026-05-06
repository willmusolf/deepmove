import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { AD_CONFIG, ensureAdSenseScript } from '../config/sponsor'

const SESSION_KEY = 'mobileAdDismissed'

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    adsbygoogle: any[]
  }
}

interface MobileAdBannerProps {
  sponsor?: unknown
  page?: string
}

export default function MobileAdBanner(_props: MobileAdBannerProps = {}) {
  const isPremium = useAuthStore(s => s.isPremium)
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(SESSION_KEY) === '1'
  )
  const pushed = useRef(false)

  useEffect(() => {
    if (isPremium || dismissed || pushed.current || !AD_CONFIG.enabled || !AD_CONFIG.mobileBannerSlot) return

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
  }, [isPremium, dismissed])

  if (isPremium || dismissed || !AD_CONFIG.enabled || !AD_CONFIG.mobileBannerSlot) return null

  function handleDismiss() {
    sessionStorage.setItem(SESSION_KEY, '1')
    setDismissed(true)
  }

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
