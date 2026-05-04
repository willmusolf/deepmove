// useSound.ts — Chess sound effects hook
// Uses Lichess standard sound set. Preference persisted in localStorage.

import { useEffect, useState, useCallback } from 'react'

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

const sharedAudioCache: Partial<Record<SoundEvent, HTMLAudioElement>> = {}
const sharedBufferCache: Partial<Record<SoundEvent, AudioBuffer>> = {}
const sharedBufferLoadPromises: Partial<Record<SoundEvent, Promise<AudioBuffer | null>>> = {}
let hasPrimedAudio = false
let sharedAudioContext: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return null
  if (!sharedAudioContext) {
    sharedAudioContext = new Ctx()
  }
  return sharedAudioContext
}

function ensureAudio(event: SoundEvent): HTMLAudioElement {
  let audio = sharedAudioCache[event]
  if (audio) return audio

  audio = new Audio(SOUND_PATHS[event])
  audio.preload = 'auto'
  audio.setAttribute('playsinline', '')
  audio.setAttribute('webkit-playsinline', '')
  sharedAudioCache[event] = audio
  return audio
}

function preloadAllAudio() {
  for (const event of Object.keys(SOUND_PATHS) as SoundEvent[]) {
    const audio = ensureAudio(event)
    if (audio.readyState === 0) audio.load()
  }
}

async function loadBuffer(event: SoundEvent): Promise<AudioBuffer | null> {
  if (sharedBufferCache[event]) return sharedBufferCache[event] ?? null
  if (sharedBufferLoadPromises[event]) return sharedBufferLoadPromises[event] ?? null

  const context = getAudioContext()
  if (!context) return null

  const loadPromise = fetch(SOUND_PATHS[event])
    .then(async response => {
      if (!response.ok) throw new Error(`Failed to load ${SOUND_PATHS[event]}`)
      const arrayBuffer = await response.arrayBuffer()
      const decoded = await context.decodeAudioData(arrayBuffer.slice(0))
      sharedBufferCache[event] = decoded
      return decoded
    })
    .catch(err => {
      console.warn('[sound] buffer decode failed:', (err as Error).message)
      return null
    })

  sharedBufferLoadPromises[event] = loadPromise
  return loadPromise
}

function primeBufferLoads() {
  for (const event of Object.keys(SOUND_PATHS) as SoundEvent[]) {
    void loadBuffer(event)
  }
}

function playEventNow(event: SoundEvent) {
  if (!getStoredSoundEnabled()) return

  const context = getAudioContext()
  const buffer = sharedBufferCache[event]
  if (context && buffer) {
    if (context.state === 'suspended') {
      void context.resume().then(() => {
        const source = context.createBufferSource()
        source.buffer = buffer
        source.connect(context.destination)
        source.start(0)
      }).catch(() => {})
      return
    }

    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    source.start(0)
    return
  }

  const audio = ensureAudio(event)
  audio.currentTime = 0
  void audio.play().catch(err => console.warn('[sound] play failed:', (err as Error).name, (err as Error).message))
}

function warmAudioPlayback() {
  if (hasPrimedAudio) return
  hasPrimedAudio = true

  const context = getAudioContext()
  if (context?.state === 'suspended') {
    void context.resume().catch(() => {})
  }

  primeBufferLoads()

  for (const event of Object.keys(SOUND_PATHS) as SoundEvent[]) {
    const audio = ensureAudio(event)
    const previousMuted = audio.muted
    audio.muted = true
    audio.currentTime = 0
    void audio.play()
      .then(() => {
        audio.pause()
        audio.currentTime = 0
        audio.muted = previousMuted
      })
      .catch(() => {
        audio.muted = previousMuted
      })
  }
}

function getStoredSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true
  return localStorage.getItem('soundEnabled') !== 'false'
}

export function useSound() {
  const [enabled, setEnabled] = useState(getStoredSoundEnabled)

  useEffect(() => {
    preloadAllAudio()
    primeBufferLoads()

    const handleFirstInteraction = () => {
      preloadAllAudio()
      warmAudioPlayback()
    }

    window.addEventListener('pointerdown', handleFirstInteraction, { once: true, passive: true })
    window.addEventListener('keydown', handleFirstInteraction, { once: true })

    return () => {
      window.removeEventListener('pointerdown', handleFirstInteraction)
      window.removeEventListener('keydown', handleFirstInteraction)
    }
  }, [])

  const playEvent = useCallback((event: SoundEvent) => {
    playEventNow(event)
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

export function playSharedMoveSound(san: string) {
  if (!san) return
  playEventNow(classifySan(san))
}
