import { useEffect, useRef } from 'react'
import { useAuthStore } from '../stores/authStore'

interface AdBannerProps {
  slot: string
  format?: 'auto' | 'rectangle' | 'vertical'
  className?: string
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    adsbygoogle: any[]
  }
}

export default function AdBanner({ slot, format = 'auto', className }: AdBannerProps) {
  const isPremium = useAuthStore(s => s.isPremium)
  const pushed = useRef(false)

  useEffect(() => {
    if (isPremium || pushed.current) return
    try {
      pushed.current = true
      ;(window.adsbygoogle = window.adsbygoogle || []).push({})
    } catch {
      // AdSense script not loaded yet (pre-approval)
    }
  }, [isPremium])

  if (isPremium) return null

  return (
    <ins
      className={`adsbygoogle${className ? ` ${className}` : ''}`}
      style={{ display: 'block' }}
      data-ad-client="ca-pub-6306891304675674"
      data-ad-slot={slot}
      data-ad-format={format}
      data-full-width-responsive="true"
    />
  )
}
