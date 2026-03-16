// useSound.ts — Chess sound effects hook
// Plays Lichess standard sounds on move events. Preference persisted in localStorage.

import { useRef, useState, useCallback } from 'react'

type SoundEvent = 'move' | 'capture' | 'castle' | 'check'

/** Classify a SAN string into the appropriate sound event */
export function classifySan(san: string): SoundEvent {
  if (san.endsWith('#') || san.endsWith('+')) return 'check'
  if (san.startsWith('O-O')) return 'castle'
  if (san.includes('x')) return 'capture'
  return 'move'
}

export function useSound() {
  const [enabled, setEnabled] = useState(() =>
    localStorage.getItem('soundEnabled') !== 'false'
  )

  // Lazily initialized Audio objects — created on first play to avoid
  // browser autoplay restrictions before any user interaction.
  const audiosRef = useRef<Record<SoundEvent, HTMLAudioElement> | null>(null)

  function getAudios(): Record<SoundEvent, HTMLAudioElement> {
    if (!audiosRef.current) {
      audiosRef.current = {
        move:    new Audio('/sounds/Move.mp3'),
        capture: new Audio('/sounds/Capture.mp3'),
        castle:  new Audio('/sounds/Castle.mp3'),
        check:   new Audio('/sounds/Check.mp3'),
      }
      // Preload
      for (const audio of Object.values(audiosRef.current)) {
        audio.preload = 'auto'
        audio.load()
      }
    }
    return audiosRef.current
  }

  /** Play the appropriate sound for a SAN string (move, capture, castle, check) */
  const playMoveSound = useCallback((san: string) => {
    if (!san) return
    const enabledNow = localStorage.getItem('soundEnabled') !== 'false'
    if (!enabledNow) return
    const event = classifySan(san)
    const audio = getAudios()[event]
    audio.currentTime = 0
    audio.play().catch(() => {})
  }, [])

  /** Play a specific sound event directly */
  const playSound = useCallback((event: SoundEvent) => {
    const enabledNow = localStorage.getItem('soundEnabled') !== 'false'
    if (!enabledNow) return
    const audio = getAudios()[event]
    audio.currentTime = 0
    audio.play().catch(() => {})
  }, [])

  const toggle = useCallback(() => {
    setEnabled(prev => {
      const next = !prev
      localStorage.setItem('soundEnabled', String(next))
      return next
    })
  }, [])

  return { enabled, toggle, playMoveSound, playSound }
}