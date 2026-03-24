// prefsStore.ts — App-wide user preferences (theme, board, sound)
// Persists to localStorage. Applies CSS changes immediately on update.
// Syncs to backend user.preferences when logged in.

import { create } from 'zustand'

export type AppTheme = 'dark' | 'light'
export type BoardTheme = 'brown' | 'blue' | 'green' | 'purple'

interface Prefs {
  appTheme: AppTheme
  boardTheme: BoardTheme
  soundEnabled: boolean
}

const PREFS_KEY = 'deepmove_prefs'

function loadPrefs(): Prefs {
  const soundEnabled = localStorage.getItem('soundEnabled') !== 'false'
  const defaults: Prefs = { appTheme: 'dark', boardTheme: 'blue', soundEnabled }
  try {
    const saved = localStorage.getItem(PREFS_KEY)
    if (saved) return { ...defaults, ...JSON.parse(saved), soundEnabled }
  } catch {}
  return defaults
}

export function applyTheme(prefs: Prefs) {
  const root = document.documentElement
  root.classList.toggle('theme-light', prefs.appTheme === 'light')
  root.setAttribute('data-board', prefs.boardTheme)
}

interface PrefsState extends Prefs {
  setAppTheme: (t: AppTheme) => void
  setBoardTheme: (t: BoardTheme) => void
  setSoundEnabled: (v: boolean) => void
  loadFromUser: (userPrefs: Record<string, unknown>) => void
}

export const usePrefsStore = create<PrefsState>((set, get) => {
  const initial = loadPrefs()
  // Apply on startup (before React renders)
  applyTheme(initial)

  function persist(next: Partial<Prefs>) {
    const updated = { ...get(), ...next }
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      appTheme: updated.appTheme,
      boardTheme: updated.boardTheme,
    }))
    // Keep sound in sync with useSound's own key
    localStorage.setItem('soundEnabled', String(updated.soundEnabled))
    applyTheme(updated)
  }

  return {
    ...initial,

    setAppTheme: (appTheme) => {
      set({ appTheme })
      persist({ appTheme })
    },

    setBoardTheme: (boardTheme) => {
      set({ boardTheme })
      persist({ boardTheme })
    },

    setSoundEnabled: (soundEnabled) => {
      set({ soundEnabled })
      persist({ soundEnabled })
    },

    // Called on login to merge server preferences into local state
    loadFromUser: (userPrefs) => {
      const defaults: Prefs = { appTheme: 'dark', boardTheme: 'blue', soundEnabled: true }
      const update: Partial<Prefs> = {}
      if (userPrefs.appTheme === 'light' || userPrefs.appTheme === 'dark') {
        update.appTheme = userPrefs.appTheme as AppTheme
      } else {
        update.appTheme = defaults.appTheme
      }
      if (['brown', 'blue', 'green', 'purple'].includes(userPrefs.boardTheme as string)) {
        update.boardTheme = userPrefs.boardTheme as BoardTheme
      } else {
        update.boardTheme = defaults.boardTheme
      }
      if (typeof userPrefs.soundEnabled === 'boolean') {
        update.soundEnabled = userPrefs.soundEnabled
      }
      const merged = { ...get(), ...update }
      set(merged)
      persist(update)
    },
  }
})
