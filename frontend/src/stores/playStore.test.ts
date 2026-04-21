import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

describe('playStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-20T12:00:00Z'))
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: createStorageMock(),
      configurable: true,
      writable: true,
    })
    sessionStorage.clear()
    vi.resetModules()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('hydrates an active play session and advances the clock across refresh', async () => {
    sessionStorage.setItem('deepmove_playSession', JSON.stringify({
      config: {
        userColor: 'white',
        botElo: 1200,
        timeControl: '5+0',
        incrementMs: 0,
        botSpeed: 'normal',
      },
      status: 'playing',
      result: null,
      endReason: null,
      tree: {
        p1: {
          id: 'p1',
          san: 'e4',
          from: 'e2',
          to: 'e4',
          fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
          childIds: [],
          parentId: null,
          moveNumber: 1,
          color: 'white',
          isMainLine: true,
        },
      },
      rootId: 'p1',
      currentPath: ['p1'],
      moveCounter: 1,
      currentFen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      whiteTimeMs: 300000,
      blackTimeMs: 300000,
      clockRunning: true,
      isBotThinking: true,
      premoveQueue: [],
      savedAt: Date.now() - 5000,
    }))

    const { usePlayStore } = await import('./playStore')
    const state = usePlayStore.getState()

    expect(state.status).toBe('playing')
    expect(state.currentPath).toEqual(['p1'])
    expect(state.currentFen).toContain(' b ')
    expect(state.blackTimeMs).toBe(295000)
    expect(state.isBotThinking).toBe(true)
  })

  it('clears the persisted session when the game resets', async () => {
    const { usePlayStore } = await import('./playStore')

    usePlayStore.getState().startGame({
      userColor: 'black',
      botElo: 900,
      timeControl: '10+0',
      incrementMs: 0,
      botSpeed: 'fast',
    })
    expect(sessionStorage.getItem('deepmove_playSession')).not.toBeNull()

    usePlayStore.getState().resetPlay()

    expect(usePlayStore.getState().status).toBe('idle')
    expect(sessionStorage.getItem('deepmove_playSession')).toBeNull()
  })
})
