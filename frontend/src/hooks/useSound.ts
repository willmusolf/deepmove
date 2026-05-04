// useSound.ts — Chess sound effects hook
// Uses Lichess standard sound set. Preference persisted in localStorage and prefsStore.

import { useEffect, useCallback } from 'react'
import { usePrefsStore } from '../stores/prefsStore'
import { useAuthStore } from '../stores/authStore'

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
let hasUnlockedSoundCache = false
let hasRegisteredUnlockListeners = false

function getStoredSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true
  return localStorage.getItem('soundEnabled') !== 'false'
}

function getOrCreateAudio(event: SoundEvent): HTMLAudioElement {
  let audio = sharedAudioCache[event]
  if (audio) return audio

  audio = new Audio(SOUND_PATHS[event])
  audio.preload = 'auto'
  audio.setAttribute('playsinline', '')
  audio.setAttribute('webkit-playsinline', '')
  sharedAudioCache[event] = audio
  return audio
}

function preloadAllSounds() {
  for (const event of Object.keys(SOUND_PATHS) as SoundEvent[]) {
    const audio = getOrCreateAudio(event)
    if (audio.readyState === 0) audio.load()
  }
}

function unlockSoundCache() {
  if (hasUnlockedSoundCache) return

  for (const event of Object.keys(SOUND_PATHS) as SoundEvent[]) {
    const audio = getOrCreateAudio(event)
    const previousMuted = audio.muted
    audio.muted = true
    audio.currentTime = 0
    void audio.play()
      .then(() => {
        audio.pause()
        audio.currentTime = 0
        audio.muted = previousMuted
        hasUnlockedSoundCache = true
      })
      .catch(() => {
        audio.muted = previousMuted
      })
  }
}

function ensureSoundWarmup() {
  if (typeof window === 'undefined') return
  preloadAllSounds()

  if (hasRegisteredUnlockListeners) return
  hasRegisteredUnlockListeners = true

  const handleFirstInteraction = () => {
    unlockSoundCache()
    window.removeEventListener('pointerdown', handleFirstInteraction)
    window.removeEventListener('touchstart', handleFirstInteraction)
    window.removeEventListener('keydown', handleFirstInteraction)
    hasRegisteredUnlockListeners = false
  }

  window.addEventListener('pointerdown', handleFirstInteraction, { passive: true })
  window.addEventListener('touchstart', handleFirstInteraction, { passive: true })
  window.addEventListener('keydown', handleFirstInteraction)
}

function playEventNow(event: SoundEvent) {
  if (!getStoredSoundEnabled()) return
  const audio = getOrCreateAudio(event)
  audio.currentTime = 0
  void audio.play().catch(err => console.warn('[sound] play failed:', (err as Error).name, (err as Error).message))
}

export function playSharedMoveSound(san: string) {
  if (!san) return
  ensureSoundWarmup()
  unlockSoundCache()
  playEventNow(classifySan(san))
}

export function useSound() {
  const enabled = usePrefsStore(s => s.soundEnabled)
  const setSoundEnabled = usePrefsStore(s => s.setSoundEnabled)

  useEffect(() => {
    ensureSoundWarmup()
  }, [])

  const playMoveSound = useCallback((san: string) => {
    playSharedMoveSound(san)
  }, [])

  const playIllegalSound = useCallback(() => {
    ensureSoundWarmup()
    unlockSoundCache()
    playEventNow('illegal')
  }, [])

  const toggle = useCallback(() => {
    const next = !usePrefsStore.getState().soundEnabled
    setSoundEnabled(next)

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
