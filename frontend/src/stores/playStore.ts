// playStore.ts — Zustand store for active bot play game state.
// Fully isolated from gameStore — the only cross-store write is in useBotPlay.reviewGame().
import { create } from 'zustand'
import type { MoveNode, MoveTree } from '../chess/types'

export type TimeControl = 'none' | '5+0' | '10+0' | '15+10'
export type BotSpeed = 'instant' | 'fast' | 'normal' | 'slow'
export type GameStatus = 'idle' | 'playing' | 'finished'
export type GameResult = 'user-win' | 'user-loss' | 'draw' | null
export type GameEndReason =
  | 'checkmate'
  | 'stalemate'
  | 'insufficient-material'
  | 'threefold'
  | 'fifty-move'
  | 'user-time'
  | 'bot-time'
  | 'resigned'
  | null

export interface PlayConfig {
  userColor: 'white' | 'black'   // captured from board orientation at Start click
  botElo: number                  // 500–3000
  timeControl: TimeControl
  incrementMs: number             // 0 for 5+0/10+0, 10000 for 15+10
  botSpeed: BotSpeed              // UI think-time pad
}

export const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

function parseInitialClockMs(tc: TimeControl): number | null {
  if (tc === 'none') return null
  if (tc === '5+0') return 5 * 60 * 1000
  if (tc === '10+0') return 10 * 60 * 1000
  if (tc === '15+10') return 15 * 60 * 1000
  return null
}

interface PlayState {
  config: PlayConfig | null
  status: GameStatus
  result: GameResult
  endReason: GameEndReason

  // Move tree — same MoveNode/MoveTree types from chess/types.ts
  tree: MoveTree
  rootId: string | null
  currentPath: string[]
  moveCounter: number
  currentFen: string

  // Clocks (null = untimed)
  whiteTimeMs: number | null
  blackTimeMs: number | null
  clockRunning: boolean

  isBotThinking: boolean
  premoveQueue: Array<{ orig: string; dest: string }>

  // Actions
  setConfig: (config: PlayConfig) => void
  startGame: (config: PlayConfig) => void
  addPlayMove: (node: MoveNode) => void
  setCurrentFen: (fen: string) => void
  setIsBotThinking: (v: boolean) => void
  setClockRunning: (v: boolean) => void
  tickClock: (color: 'white' | 'black', elapsedMs: number) => void
  addIncrement: (color: 'white' | 'black') => void
  setResult: (result: GameResult, reason: GameEndReason) => void
  resetPlay: () => void
}

const initialState = {
  config: null as PlayConfig | null,
  status: 'idle' as GameStatus,
  result: null as GameResult,
  endReason: null as GameEndReason,
  tree: {} as MoveTree,
  rootId: null as string | null,
  currentPath: [] as string[],
  moveCounter: 0,
  currentFen: STARTING_FEN,
  whiteTimeMs: null as number | null,
  blackTimeMs: null as number | null,
  clockRunning: false,
  isBotThinking: false,
  premoveQueue: [] as Array<{ orig: string; dest: string }>,
}

export const usePlayStore = create<PlayState>((set) => ({
  ...initialState,

  setConfig: (config) => set({ config }),

  startGame: (config) => set({
    config,
    status: 'playing',
    result: null,
    endReason: null,
    tree: {},
    rootId: null,
    currentPath: [],
    moveCounter: 0,
    currentFen: STARTING_FEN,
    whiteTimeMs: parseInitialClockMs(config.timeControl),
    blackTimeMs: parseInitialClockMs(config.timeControl),
    clockRunning: config.timeControl !== 'none',
    isBotThinking: false,
    premoveQueue: [],
  }),

  addPlayMove: (node) => set((state) => {
    const newTree = { ...state.tree, [node.id]: node }

    // Wire parent's childIds
    if (node.parentId && newTree[node.parentId]) {
      const parent = { ...newTree[node.parentId] }
      if (!parent.childIds.includes(node.id)) {
        parent.childIds = [...parent.childIds, node.id]
      }
      newTree[node.parentId] = parent
    }

    const newPath = [...state.currentPath, node.id]
    const newRootId = state.rootId ?? node.id

    return {
      tree: newTree,
      rootId: newRootId,
      currentPath: newPath,
    }
  }),

  setCurrentFen: (fen) => set({ currentFen: fen }),

  setIsBotThinking: (v) => set({ isBotThinking: v }),

  setClockRunning: (v) => set({ clockRunning: v }),

  tickClock: (color, elapsedMs) => set((state) => {
    if (color === 'white' && state.whiteTimeMs !== null) {
      return { whiteTimeMs: Math.max(0, state.whiteTimeMs - elapsedMs) }
    }
    if (color === 'black' && state.blackTimeMs !== null) {
      return { blackTimeMs: Math.max(0, state.blackTimeMs - elapsedMs) }
    }
    return {}
  }),

  addIncrement: (color) => set((state) => {
    const inc = state.config?.incrementMs ?? 0
    if (inc === 0) return {}
    if (color === 'white' && state.whiteTimeMs !== null) {
      return { whiteTimeMs: state.whiteTimeMs + inc }
    }
    if (color === 'black' && state.blackTimeMs !== null) {
      return { blackTimeMs: state.blackTimeMs + inc }
    }
    return {}
  }),

  setResult: (result, reason) => set({
    result,
    endReason: reason,
    status: 'finished',
    clockRunning: false,
  }),

  resetPlay: () => set({ ...initialState }),
}))
