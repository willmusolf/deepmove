import { beforeEach, describe, expect, it, vi } from 'vitest'

function createStorageMock(): Storage {
  const store = new Map<string, string>()

  return {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key) {
      return store.get(key) ?? null
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null
    },
    removeItem(key) {
      store.delete(key)
    },
    setItem(key, value) {
      store.set(key, value)
    },
  }
}

describe('gameStore', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: createStorageMock(),
      configurable: true,
      writable: true,
    })
    sessionStorage.clear()
    vi.resetModules()
  })

  it('hydrates the persisted review session and keeps analysis progress', async () => {
    sessionStorage.setItem('deepmove_reviewGameSession', JSON.stringify({
      pgn: '1. e4 e5 2. Nf3 Nc6',
      rawPgn: '1. e4 e5 2. Nf3 Nc6',
      loadedPgn: '1. e4 e5 2. Nf3 Nc6',
      moveEvals: [{ ply: 1 }, { ply: 2 }],
      criticalMoments: [{ moveNumber: 2 }],
      userElo: 1480,
      userColor: 'black',
      platform: 'lichess',
      totalMovesCount: 4,
      currentGameId: 'lichess:abc123',
      backendGameId: 77,
      currentGameMeta: {
        opponent: 'Capablanca',
        opponentRating: 1520,
        result: 'L',
        timeControl: '600',
        endTime: 1713614400,
      },
      skipNextAnalysis: true,
      resumeFromIndex: 2,
    }))

    const { useGameStore } = await import('./gameStore')
    const state = useGameStore.getState()

    expect(state.pgn).toBe('1. e4 e5 2. Nf3 Nc6')
    expect(state.userColor).toBe('black')
    expect(state.platform).toBe('lichess')
    expect(state.analyzedCount).toBe(2)
    expect(state.skipNextAnalysis).toBe(true)
    expect(state.currentGameMeta?.opponent).toBe('Capablanca')
  })

  it('removes the persisted review session on reset', async () => {
    const { useGameStore } = await import('./gameStore')

    useGameStore.getState().setPgn('1. d4 d5')
    expect(sessionStorage.getItem('deepmove_reviewGameSession')).not.toBeNull()

    useGameStore.getState().reset()

    expect(useGameStore.getState().pgn).toBeNull()
    expect(sessionStorage.getItem('deepmove_reviewGameSession')).toBeNull()
  })
})
