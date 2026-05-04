// useSound.ts — Chess sound effects hook
// Uses Lichess standard sound set. Preference persisted in localStorage.

import { useRef, useState, useCallback } from 'react'

type SoundEvent = 'move' | 'capture' | 'castle' | 'check' | 'mate' | 'promote' | 'illegal'

/** Classify a SAN string into the appropriate sound event */
export function classifySan(san: string): SoundEvent {
  if (san.endsWith('#')) return 'mate'
  if (san.endsWith('+')) return 'check'
  if (san.startsWith('O-O')) return 'castle'
  // Promotion: SAN contains '=' (e.g. e8=Q, exd8=Q+)
  if (san.includes('=')) return 'promote'
  if (san.includes('x')) return 'capture'
  return 'move'
}

const SOUND_PATHS: Record<SoundEvent, string> = {
  move:    '/sounds/move.mp3',
  capture: '/sounds/capture.mp3',
  castle:  '/sounds/castle.mp3',
  check:   '/sounds/move-check.mp3',
  mate:    '/sounds/checkmate.mp3',
  promote: '/sounds/confirmation.mp3',
  illegal: '/sounds/illegal.mp3',
}

function getStoredSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true
  return localStorage.getItem('soundEnabled') !== 'false'
}

export function useSound() {
  const [enabled, setEnabled] = useState(getStoredSoundEnabled)
  const audioRefs = useRef<Partial<Record<SoundEvent, HTMLAudioElement>>>({})

  const playEvent = useCallback((event: SoundEvent) => {
    if (!getStoredSoundEnabled()) return
    let audio = audioRefs.current[event]
    if (!audio) {
      audio = new Audio(SOUND_PATHS[event])
      audio.preload = 'auto'
      audioRefs.current[event] = audio
    }
    audio.currentTime = 0
    void audio.play().catch(err => console.warn('[sound] play failed:', (err as Error).name, (err as Error).message))
  }, [])

  /** Play the appropriate sound for a SAN string */
  const playMoveSound = useCallback((san: string) => {
    if (!san) return
    playEvent(classifySan(san))
  }, [playEvent])

  const playIllegalSound = useCallback(() => {
    playEvent('illegal')
  }, [playEvent])

  const toggle = useCallback(() => {
    setEnabled(prev => {
      const next = !prev
      localStorage.setItem('soundEnabled', String(next))
      return next
    })
  }, [])

  return { enabled, toggle, playMoveSound, playIllegalSound }
}
