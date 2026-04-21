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
  // A few of these files are tracked with uppercase names in git, which matters on Linux.
  move:    '/sounds/Move.mp3',
  capture: '/sounds/Capture.mp3',
  castle:  '/sounds/Castle.mp3',
  check:   '/sounds/move-check.mp3',
  mate:    '/sounds/checkmate.mp3',
  promote: '/sounds/confirmation.mp3',
  illegal: '/sounds/illegal.mp3',
}

export function useSound() {
  const [enabled, setEnabled] = useState(() =>
    localStorage.getItem('soundEnabled') !== 'false'
  )

  // One preloaded Audio element per event, lazily created on first play
  const audioRefs = useRef<Partial<Record<SoundEvent, HTMLAudioElement>>>({})

  function getAudio(event: SoundEvent): HTMLAudioElement {
    if (!audioRefs.current[event]) {
      const audio = new Audio(SOUND_PATHS[event])
      audio.preload = 'auto'
      audio.load()
      audioRefs.current[event] = audio
    }
    return audioRefs.current[event]!
  }

  /** Play the appropriate sound for a SAN string */
  function playMoveSound(san: string) {
    if (!san) return
    if (localStorage.getItem('soundEnabled') === 'false') return
    const event = classifySan(san)
    const audio = getAudio(event)
    audio.currentTime = 0
    audio.play().catch(console.error)
  }

  function playIllegalSound() {
    if (localStorage.getItem('soundEnabled') === 'false') return
    const audio = getAudio('illegal')
    audio.currentTime = 0
    audio.play().catch(console.error)
  }

  const toggle = useCallback(() => {
    setEnabled(prev => {
      const next = !prev
      localStorage.setItem('soundEnabled', String(next))
      return next
    })
  }, [])

  return { enabled, toggle, playMoveSound, playIllegalSound }
}
