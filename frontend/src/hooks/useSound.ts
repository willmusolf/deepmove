// useSound.ts — Chess sound effects hook
// Uses Lichess standard sound set. Preference persisted in localStorage.

import { useRef, useState, useCallback } from 'react'

type SoundEvent = 'move' | 'capture' | 'castle' | 'check' | 'mate' | 'promote' | 'illegal'

type AudioContextWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext
}

let sharedAudioContext: AudioContext | null | undefined
const audioBufferCache = new Map<SoundEvent, Promise<AudioBuffer>>()

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
  move: '/sounds/move.mp3',
  capture: '/sounds/capture.mp3',
  castle: '/sounds/castle.mp3',
  check: '/sounds/move-check.mp3',
  mate: '/sounds/checkmate.mp3',
  promote: '/sounds/confirmation.mp3',
  illegal: '/sounds/illegal.mp3',
}

function getStoredSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true
  return localStorage.getItem('soundEnabled') !== 'false'
}

function getAudioContextInstance(): AudioContext | null {
  if (sharedAudioContext !== undefined) {
    return sharedAudioContext
  }

  if (typeof window === 'undefined') {
    sharedAudioContext = null
    return sharedAudioContext
  }

  const AudioContextCtor = (window as AudioContextWindow).AudioContext
    ?? (window as AudioContextWindow).webkitAudioContext

  if (!AudioContextCtor) {
    sharedAudioContext = null
    return sharedAudioContext
  }

  sharedAudioContext = new AudioContextCtor()
  return sharedAudioContext
}

async function getAudioBuffer(ctx: AudioContext, event: SoundEvent): Promise<AudioBuffer> {
  const cached = audioBufferCache.get(event)
  if (cached) return cached

  const loadPromise = fetch(SOUND_PATHS[event])
    .then(async response => {
      if (!response.ok) {
        throw new Error(`Failed to load ${event} sound`)
      }
      const data = await response.arrayBuffer()
      return ctx.decodeAudioData(data)
    })
    .catch(error => {
      audioBufferCache.delete(event)
      throw error
    })

  audioBufferCache.set(event, loadPromise)
  return loadPromise
}

async function playBufferedSound(event: SoundEvent): Promise<boolean> {
  const ctx = getAudioContextInstance()
  if (!ctx) return false

  if (ctx.state === 'suspended') {
    await ctx.resume()
  }

  const buffer = await getAudioBuffer(ctx, event)
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.connect(ctx.destination)
  source.start(0)
  return true
}

export function useSound() {
  const [enabled, setEnabled] = useState(getStoredSoundEnabled)
  const enabledRef = useRef(enabled)

  // Fallback HTMLAudio path for older browsers or decode failures.
  const audioRefs = useRef<Partial<Record<SoundEvent, HTMLAudioElement>>>({})

  function getFallbackAudio(event: SoundEvent): HTMLAudioElement {
    if (!audioRefs.current[event]) {
      const audio = new Audio(SOUND_PATHS[event])
      audio.preload = 'auto'
      audio.load()
      audioRefs.current[event] = audio
    }
    return audioRefs.current[event]!
  }

  const playFallbackSound = useCallback((event: SoundEvent) => {
    const audio = getFallbackAudio(event)
    audio.currentTime = 0
    void audio.play().catch(() => {})
  }, [])

  const playEvent = useCallback((event: SoundEvent) => {
    if (!enabledRef.current) return

    void playBufferedSound(event)
      .then(played => {
        if (!played) {
          playFallbackSound(event)
        }
      })
      .catch(() => {
        playFallbackSound(event)
      })
  }, [playFallbackSound])

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
      enabledRef.current = next
      localStorage.setItem('soundEnabled', String(next))
      return next
    })
  }, [])

  return { enabled, toggle, playMoveSound, playIllegalSound }
}
