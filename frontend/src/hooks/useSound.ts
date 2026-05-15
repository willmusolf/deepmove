// useSound.ts — Chess sound effects hook
// Uses Lichess standard sound set. Preference persisted in localStorage and prefsStore.

import { useEffect, useCallback } from 'react'
import { usePrefsStore } from '../stores/prefsStore'
import { useAuthStore } from '../stores/authStore'

type SoundEvent = 'move' | 'capture' | 'castle' | 'check' | 'mate' | 'promote' | 'illegal'
type BrowserAudioContext = AudioContext

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

const FALLBACK_AUDIO_POOL_SIZE = 3
const sharedAudioCache: Partial<Record<SoundEvent, HTMLAudioElement[]>> = {}
const decodedBufferCache: Partial<Record<SoundEvent, AudioBuffer>> = {}
const decodedBufferLoads: Partial<Record<SoundEvent, Promise<void>>> = {}
let sharedAudioContext: BrowserAudioContext | null = null
let hasAttemptedAudioContextInit = false
let hasUnlockedFallbackCache = false
let hasRegisteredUnlockListeners = false
let hasRegisteredLifecycleListeners = false
let soundEnabledSnapshot = true

function syncSoundEnabledSnapshot(next: boolean) {
  soundEnabledSnapshot = next
}

function getStoredSoundEnabled(): boolean {
  if (typeof window === 'undefined') return soundEnabledSnapshot
  try {
    const stored = localStorage.getItem('soundEnabled')
    if (stored === null) return soundEnabledSnapshot
    soundEnabledSnapshot = stored !== 'false'
    return soundEnabledSnapshot
  } catch {
    return soundEnabledSnapshot
  }
}

function createAudioElement(event: SoundEvent): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null
  const audio = new Audio(SOUND_PATHS[event])
  audio.preload = 'auto'
  audio.setAttribute('playsinline', '')
  audio.setAttribute('webkit-playsinline', '')
  return audio
}

function getAudioPool(event: SoundEvent): HTMLAudioElement[] {
  let pool = sharedAudioCache[event]
  if (pool) return pool

  const audio = createAudioElement(event)
  pool = audio ? [audio] : []
  sharedAudioCache[event] = pool
  return pool
}

function getOrCreateAudio(event: SoundEvent): HTMLAudioElement | null {
  return getAudioPool(event)[0] ?? null
}

function getFallbackAudioForPlayback(event: SoundEvent): HTMLAudioElement | null {
  const pool = getAudioPool(event)
  const idleAudio = pool.find(audio => audio.paused || audio.ended)
  if (idleAudio) return idleAudio

  if (pool.length < FALLBACK_AUDIO_POOL_SIZE) {
    const audio = createAudioElement(event)
    if (audio) {
      pool.push(audio)
      return audio
    }
  }

  return pool[pool.length - 1] ?? null
}

function getAudioContext(): BrowserAudioContext | null {
  if (typeof window === 'undefined') return null
  if (sharedAudioContext) return sharedAudioContext
  if (hasAttemptedAudioContextInit) return null

  hasAttemptedAudioContextInit = true
  const AudioContextCtor = window.AudioContext
    ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

  if (!AudioContextCtor) return null

  try {
    sharedAudioContext = new AudioContextCtor()
    return sharedAudioContext
  } catch {
    return null
  }
}

function preloadAllSounds() {
  for (const event of Object.keys(SOUND_PATHS) as SoundEvent[]) {
    const audio = getOrCreateAudio(event)
    if (audio && audio.readyState === 0) audio.load()
  }
}

function preloadDecodedSounds() {
  const context = getAudioContext()
  if (!context) return

  for (const event of Object.keys(SOUND_PATHS) as SoundEvent[]) {
    if (decodedBufferCache[event] || decodedBufferLoads[event]) continue

    decodedBufferLoads[event] = fetch(SOUND_PATHS[event])
      .then(res => {
        if (!res.ok) throw new Error(`Failed to load sound: ${event}`)
        return res.arrayBuffer()
      })
      .then(buffer => context.decodeAudioData(buffer))
      .then(decoded => {
        decodedBufferCache[event] = decoded
      })
      .catch(() => {
        // Fallback HTMLAudio path remains available if fetch/decode fails.
      })
      .finally(() => {
        delete decodedBufferLoads[event]
      })
  }
}

function unlockWebAudio() {
  const context = getAudioContext()
  if (!context || context.state !== 'suspended') return
  void context.resume().catch(() => {
    // HTMLAudio fallback remains available if resume fails.
  })
}

function unlockFallbackCache() {
  if (hasUnlockedFallbackCache) return
  hasUnlockedFallbackCache = true

  for (const event of Object.keys(SOUND_PATHS) as SoundEvent[]) {
    const audio = getOrCreateAudio(event)
    if (!audio) continue
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

function stopFallbackSounds() {
  for (const pool of Object.values(sharedAudioCache)) {
    if (!pool) continue
    for (const audio of pool) {
      audio.pause()
      audio.currentTime = 0
    }
  }
}

function ensureSoundWarmup() {
  if (typeof window === 'undefined') return
  preloadAllSounds()
  // preloadDecodedSounds() fires lazily via handleFirstInteraction on first user tap

  if (!hasRegisteredLifecycleListeners && typeof document !== 'undefined') {
    hasRegisteredLifecycleListeners = true
    const handleAppReactivated = () => {
      if (document.visibilityState === 'hidden') return
      unlockWebAudio()
      preloadDecodedSounds()
    }
    document.addEventListener('visibilitychange', handleAppReactivated)
    window.addEventListener('pageshow', handleAppReactivated)
  }

  if (hasRegisteredUnlockListeners) return
  hasRegisteredUnlockListeners = true

  const handleFirstInteraction = () => {
    unlockWebAudio()
    unlockFallbackCache()
    preloadDecodedSounds()
    window.removeEventListener('pointerdown', handleFirstInteraction)
    window.removeEventListener('touchstart', handleFirstInteraction)
    window.removeEventListener('keydown', handleFirstInteraction)
    hasRegisteredUnlockListeners = false
  }

  window.addEventListener('pointerdown', handleFirstInteraction, { passive: true })
  window.addEventListener('touchstart', handleFirstInteraction, { passive: true })
  window.addEventListener('keydown', handleFirstInteraction)
}

function playDecodedBuffer(event: SoundEvent): boolean {
  const context = getAudioContext()
  const buffer = context ? decodedBufferCache[event] : null
  if (!context || !buffer) return false

  if (context.state !== 'running') {
    unlockWebAudio()
    return false
  }

  try {
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    source.start(0)
    return true
  } catch {
    return false
  }
}

function playEventNow(event: SoundEvent) {
  if (!getStoredSoundEnabled()) return
  unlockWebAudio()
  if (playDecodedBuffer(event)) return

  const audio = getFallbackAudioForPlayback(event)
  if (!audio) return
  audio.currentTime = 0
  void audio.play().catch(err => console.warn('[sound] play failed:', (err as Error).name, (err as Error).message))
}

export function playSharedMoveSound(san: string) {
  if (!san) return
  ensureSoundWarmup()
  playEventNow(classifySan(san))
}

export function useSound() {
  const enabled = usePrefsStore(s => s.soundEnabled)
  const setSoundEnabled = usePrefsStore(s => s.setSoundEnabled)

  useEffect(() => {
    syncSoundEnabledSnapshot(enabled)
    ensureSoundWarmup()
  }, [enabled])

  const playMoveSound = useCallback((san: string) => {
    playSharedMoveSound(san)
  }, [])

  const playIllegalSound = useCallback(() => {
    ensureSoundWarmup()
    playEventNow('illegal')
  }, [])

  const toggle = useCallback(() => {
    const next = !usePrefsStore.getState().soundEnabled
    syncSoundEnabledSnapshot(next)
    setSoundEnabled(next)

    if (next) {
      ensureSoundWarmup()
      unlockWebAudio()
      unlockFallbackCache()
      preloadDecodedSounds()
    } else {
      stopFallbackSounds()
    }

    const authState = useAuthStore.getState()
    if (authState.user && authState.accessToken) {
      const { appTheme, boardTheme } = usePrefsStore.getState()
      authState.updateProfile({
        preferences: {
          appTheme,
          boardTheme,
          soundEnabled: next,
        },
      }).catch(() => {
        // Best-effort backend sync; local prefs remain authoritative in the UI.
      })
    }
  }, [setSoundEnabled])

  return { enabled, toggle, playMoveSound, playIllegalSound }
}
