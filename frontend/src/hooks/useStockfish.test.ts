import { act, renderHook, waitFor } from '@testing-library/react'
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

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

describe('useStockfish', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: createStorageMock(),
      configurable: true,
      writable: true,
    })
    sessionStorage.clear()
    localStorage.clear()
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('ignores stale analysis callbacks after cancellation', async () => {
    const analysisDeferred = createDeferred<any[]>()
    const analyzeGameMock = vi.fn()
    let activeOnMoveComplete: ((moveEval: any) => void) | undefined

    analyzeGameMock.mockImplementation((
      _pgn: string,
      _engine: unknown,
      _depth: number,
      _onProgress: ((completed: number, total: number) => void) | undefined,
      _signal: AbortSignal | undefined,
      _movetime: number | undefined,
      onMoveComplete?: (moveEval: any) => void,
    ) => {
      activeOnMoveComplete = onMoveComplete
      return analysisDeferred.promise
    })

    class MockStockfishEngine {
      initialize() {
        return Promise.resolve()
      }

      stop() {}
      terminate() {}
      analyzePositionMultiPV() {
        return Promise.resolve([])
      }
      analyzePosition() {
        return Promise.resolve(null)
      }
    }

    vi.doMock('../engine/stockfish', () => ({
      StockfishEngine: MockStockfishEngine,
    }))
    vi.doMock('../engine/analysis', () => ({
      analyzeGame: analyzeGameMock,
    }))
    vi.doMock('../engine/criticalMoments', () => ({
      detectCriticalMoments: vi.fn(() => []),
    }))
    vi.doMock('../services/gameDB', () => ({
      saveAnalyzedGame: vi.fn(() => Promise.resolve()),
    }))
    vi.doMock('../services/syncService', () => ({
      pushGame: vi.fn(() => Promise.resolve(null)),
    }))
    vi.doMock('../stores/authStore', () => ({
      useAuthStore: {
        getState: () => ({ accessToken: null }),
      },
    }))

    const [{ useStockfish }, { useGameStore }] = await Promise.all([
      import('./useStockfish'),
      import('../stores/gameStore'),
    ])

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { result } = renderHook(() => useStockfish())

      await waitFor(() => expect(result.current.isReady).toBe(true))

      act(() => {
        useGameStore.getState().setUserColor('white')
        useGameStore.getState().setUserElo(1400)
      })

      await act(async () => {
        void result.current.runAnalysis('1. e4 e5')
        await Promise.resolve()
      })

      const firstEval = {
        moveNumber: 1,
        color: 'white',
        san: 'e4',
        fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
        eval: {
          fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
          depth: 14,
          score: 18,
          isMate: false,
          mateIn: null,
          bestMove: 'e7e5',
          pv: ['e7e5'],
        },
        grade: 'best',
      }

      await act(async () => {
        activeOnMoveComplete?.(firstEval)
        await Promise.resolve()
      })

      expect(useGameStore.getState().moveEvals).toHaveLength(1)

      act(() => {
        result.current.cancelGameAnalysis()
      })

      const staleEval = {
        ...firstEval,
        moveNumber: 1,
        san: 'd4',
        fen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1',
        eval: {
          ...firstEval.eval,
          fen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1',
          bestMove: 'd7d5',
          pv: ['d7d5'],
        },
      }

      await act(async () => {
        activeOnMoveComplete?.(staleEval)
        analysisDeferred.resolve([firstEval, staleEval])
        await analysisDeferred.promise
        await Promise.resolve()
      })

      expect(useGameStore.getState().moveEvals).toEqual([firstEval])
      expect(useGameStore.getState().isAnalyzing).toBe(false)
      expect(useGameStore.getState().analyzedCount).toBe(0)
      expect(useGameStore.getState().totalMovesCount).toBe(0)
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })
})
