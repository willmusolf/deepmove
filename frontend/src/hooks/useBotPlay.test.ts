import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBotPlay } from './useBotPlay'
import { useGameStore } from '../stores/gameStore'
import { usePlayStore } from '../stores/playStore'
import type { MoveNode } from '../chess/types'

vi.mock('../engine/stockfish', () => ({
  StockfishEngine: class MockStockfishEngine {
    initialize() {
      return Promise.resolve()
    }

    terminate() {}
    getBotMove() {
      return Promise.resolve('(none)')
    }
  },
}))

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

describe('useBotPlay review handoff', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: createStorageMock(),
      configurable: true,
      writable: true,
    })
    sessionStorage.clear()
    localStorage.clear()
    useGameStore.getState().reset()
    usePlayStore.getState().resetPlay()
  })

  it('clears stale review analysis before loading a bot game into review', () => {
    const oldNow = Date.now
    vi.spyOn(Date, 'now').mockReturnValue(1_717_000_000_000)

    const rootNode: MoveNode = {
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
    }

    useGameStore.setState({
      pgn: '1. d4 d5',
      rawPgn: '1. d4 d5',
      loadedPgn: '1. d4 d5',
      moveEvals: [{ moveNumber: 1, color: 'white', san: 'd4', fen: 'x', eval: { fen: 'x', score: 25, isMate: false, mateIn: null, bestMove: 'd7d5', pv: ['d7d5'], depth: 14 }, grade: 'mistake' }],
      criticalMoments: [{ moveNumber: 1 } as any],
      userElo: 1675,
      userColor: 'black',
      platform: 'lichess',
      skipNextAnalysis: true,
      totalMovesCount: 12,
      currentGameMeta: {
        opponent: 'Old Opponent',
        opponentRating: 1800,
        result: 'L',
        timeControl: '600',
        endTime: 123,
      },
    })

    usePlayStore.setState({
      config: {
        userColor: 'white',
        botElo: 1500,
        timeControl: '10+0',
        incrementMs: 0,
        botSpeed: 'normal',
      },
      status: 'finished',
      result: 'user-win',
      endReason: 'checkmate',
      tree: { p1: rootNode },
      rootId: 'p1',
      currentPath: ['p1'],
      moveCounter: 1,
      currentFen: rootNode.fen,
      whiteTimeMs: 600_000,
      blackTimeMs: 600_000,
      clockRunning: false,
      isBotThinking: false,
      premoveQueue: [],
    })

    const onNavigateToReview = vi.fn()
    const { result, unmount } = renderHook(() => useBotPlay(onNavigateToReview))

    act(() => {
      result.current.reviewGame()
    })

    const state = useGameStore.getState()
    expect(onNavigateToReview).toHaveBeenCalledOnce()
    expect(state.pgn).toContain('[Event "DeepMove Bot Game"]')
    expect(state.rawPgn).toBe(state.pgn)
    expect(state.loadedPgn).toBe(state.pgn)
    expect(state.moveEvals).toEqual([])
    expect(state.criticalMoments).toEqual([])
    expect(state.skipNextAnalysis).toBe(false)
    expect(state.platform).toBeNull()
    expect(state.userColor).toBe('white')
    expect(state.userElo).toBe(1675)
    expect(state.currentGameMeta).toEqual({
      opponent: 'Stockfish (1500)',
      opponentRating: 1500,
      result: 'W',
      timeControl: '10+0',
      endTime: 1_717_000_000_000,
    })

    unmount()
    vi.restoreAllMocks()
    Date.now = oldNow
  })

  it('does nothing when there is no finished bot game to review', () => {
    const onNavigateToReview = vi.fn()
    const { result, unmount } = renderHook(() => useBotPlay(onNavigateToReview))

    act(() => {
      result.current.reviewGame()
    })

    expect(onNavigateToReview).not.toHaveBeenCalled()
    expect(useGameStore.getState().pgn).toBeNull()

    unmount()
  })
})
