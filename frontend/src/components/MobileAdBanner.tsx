import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../stores/authStore'

const SESSION_KEY = 'mobileAdDismissed'

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    adsbygoogle: any[]
  }
}

export default function MobileAdBanner() {
  const isPremium = useAuthStore(s => s.isPremium)
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(SESSION_KEY) === '1'
  )
  const pushed = useRef(false)

  useEffect(() => {
    if (isPremium || dismissed || pushed.current) return
    try {
      pushed.current = true
      ;(window.adsbygoogle = window.adsbygoogle || []).push({})
    } catch {
      // AdSense script not loaded yet (pre-approval)
    }
  }, [isPremium, dismissed])

  if (isPremium || dismissed) return null

  function handleDismiss() {
    sessionStorage.setItem(SESSION_KEY, '1')
    setDismissed(true)
  }

  return (
    <div className="mobile-ad-banner">
      <ins
        className="adsbygoogle"
        style={{ display: 'inline-block', width: '320px', height: '50px' }}
        data-ad-client="ca-pub-6306891304675674"
        data-ad-slot="YYYYYYYYYY"
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
