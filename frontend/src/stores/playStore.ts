// playStore.ts — Zustand store for active bot play game state.
// Fully isolated from gameStore — the only cross-store write is in useBotPlay.reviewGame().
import { create } from 'zustand'
import type { MoveNode, MoveTree } from '../chess/types'
import { readSessionJson, removeSessionValue, writeSessionJson } from '../utils/sessionStorage'

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
const SESSION_KEY = 'deepmove_playSession'

interface PersistedPlayState {
  config: PlayConfig | null
  status: GameStatus
  result: GameResult
  endReason: GameEndReason
  tree: MoveTree
  rootId: string | null
  currentPath: string[]
  moveCounter: number
  currentFen: string
  whiteTimeMs: number | null
  blackTimeMs: number | null
  clockRunning: boolean
  isBotThinking: boolean
  premoveQueue: Array<{ orig: string; dest: string }>
  savedAt: number
}

function parseInitialClockMs(tc: TimeControl): number | null {
  if (tc === 'none') return null
  if (tc === '5+0') return 5 * 60 * 1000
  if (tc === '10+0') return 10 * 60 * 1000
  if (tc === '15+10') return 15 * 60 * 1000
  return null
}

function isTimeControl(value: unknown): value is TimeControl {
  return value === 'none' || value === '5+0' || value === '10+0' || value === '15+10'
}

function isBotSpeed(value: unknown): value is BotSpeed {
  return value === 'instant' || value === 'fast' || value === 'normal' || value === 'slow'
}

function isGameStatus(value: unknown): value is GameStatus {
  return value === 'idle' || value === 'playing' || value === 'finished'
}

function isGameResult(value: unknown): value is GameResult {
  return value === null || value === 'user-win' || value === 'user-loss' || value === 'draw'
}

function isGameEndReason(value: unknown): value is GameEndReason {
  return value === null
    || value === 'checkmate'
    || value === 'stalemate'
    || value === 'insufficient-material'
    || value === 'threefold'
    || value === 'fifty-move'
    || value === 'user-time'
    || value === 'bot-time'
    || value === 'resigned'
}

function sanitizePlayConfig(value: unknown): PlayConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const config = value as Partial<PlayConfig>
  if (config.userColor !== 'white' && config.userColor !== 'black') return null
  if (typeof config.botElo !== 'number') return null
  if (!isTimeControl(config.timeControl)) return null
  if (typeof config.incrementMs !== 'number') return null
  if (!isBotSpeed(config.botSpeed)) return null

  return {
    userColor: config.userColor,
    botElo: config.botElo,
    timeControl: config.timeControl,
    incrementMs: config.incrementMs,
    botSpeed: config.botSpeed,
  }
}

function sanitizeMoveTree(value: unknown): MoveTree {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  return Object.fromEntries(
    Object.entries(value).flatMap(([id, rawNode]) => {
      if (!rawNode || typeof rawNode !== 'object' || Array.isArray(rawNode)) return []
      const node = rawNode as Partial<MoveNode>
      if (typeof node.san !== 'string') return []
      if (typeof node.from !== 'string' || typeof node.to !== 'string' || typeof node.fen !== 'string') return []
      if (!Array.isArray(node.childIds) || !node.childIds.every(childId => typeof childId === 'string')) return []
      if (node.parentId !== null && typeof node.parentId !== 'string') return []
      if (typeof node.moveNumber !== 'number') return []
      if (node.color !== 'white' && node.color !== 'black') return []
      if (typeof node.isMainLine !== 'boolean') return []

      return [[id, {
        id,
        san: node.san,
        from: node.from,
        to: node.to,
        fen: node.fen,
        childIds: node.childIds,
        parentId: node.parentId ?? null,
        moveNumber: node.moveNumber,
        color: node.color,
        isMainLine: node.isMainLine,
        ...(typeof node.grade === 'string' ? { grade: node.grade } : {}),
        ...(typeof node.clockTime === 'string' ? { clockTime: node.clockTime } : {}),
      } satisfies MoveNode]]
    }),
  )
}

function sanitizePath(path: unknown, tree: MoveTree): string[] {
  if (!Array.isArray(path)) return []

  const safe: string[] = []
  for (const rawId of path) {
    if (typeof rawId !== 'string') break
    const node = tree[rawId]
    if (!node) break
    const expectedParent = safe[safe.length - 1] ?? null
    if (node.parentId !== expectedParent) break
    safe.push(rawId)
  }
  return safe
}

function loadPlaySession(): PersistedPlayState | null {
  const parsed = readSessionJson<Partial<PersistedPlayState>>(SESSION_KEY)
  if (!parsed || typeof parsed !== 'object') return null

  const status = isGameStatus(parsed.status) ? parsed.status : 'idle'
  const result = isGameResult(parsed.result) ? parsed.result : null
  const endReason = isGameEndReason(parsed.endReason) ? parsed.endReason : null
  const config = sanitizePlayConfig(parsed.config)
  const tree = sanitizeMoveTree(parsed.tree)
  const currentPath = sanitizePath(parsed.currentPath, tree)
  const currentFen = typeof parsed.currentFen === 'string'
    ? parsed.currentFen
    : (currentPath.length > 0 ? tree[currentPath[currentPath.length - 1]]?.fen ?? STARTING_FEN : STARTING_FEN)

  let whiteTimeMs = typeof parsed.whiteTimeMs === 'number' ? parsed.whiteTimeMs : null
  let blackTimeMs = typeof parsed.blackTimeMs === 'number' ? parsed.blackTimeMs : null
  let clockRunning = parsed.clockRunning === true
  let nextStatus = status
  let nextResult = result
  let nextEndReason = endReason

  const savedAt = typeof parsed.savedAt === 'number' ? parsed.savedAt : Date.now()
  if (status === 'playing' && clockRunning) {
    const elapsedMs = Math.max(0, Date.now() - savedAt)
    const sideToMove = currentFen.split(' ')[1] === 'w' ? 'white' : 'black'
    if (sideToMove === 'white' && whiteTimeMs !== null) whiteTimeMs = Math.max(0, whiteTimeMs - elapsedMs)
    if (sideToMove === 'black' && blackTimeMs !== null) blackTimeMs = Math.max(0, blackTimeMs - elapsedMs)

    const timedOut = sideToMove === 'white' ? whiteTimeMs === 0 : blackTimeMs === 0
    if (timedOut && config) {
      const userTimedOut = sideToMove === config.userColor
      nextStatus = 'finished'
      nextResult = userTimedOut ? 'user-loss' : 'user-win'
      nextEndReason = userTimedOut ? 'user-time' : 'bot-time'
      clockRunning = false
    }
  }

  return {
    config,
    status: nextStatus,
    result: nextResult,
    endReason: nextEndReason,
    tree,
    rootId: typeof parsed.rootId === 'string' ? parsed.rootId : null,
    currentPath,
    moveCounter: typeof parsed.moveCounter === 'number' ? parsed.moveCounter : currentPath.length,
    currentFen,
    whiteTimeMs,
    blackTimeMs,
    clockRunning,
    isBotThinking: parsed.isBotThinking === true && nextStatus === 'playing',
    premoveQueue: Array.isArray(parsed.premoveQueue)
      ? parsed.premoveQueue.filter(move =>
        move
        && typeof move === 'object'
        && typeof move.orig === 'string'
        && typeof move.dest === 'string'
      )
      : [],
    savedAt,
  }
}

function toPersistedPlayState(state: PlayState): PersistedPlayState {
  return {
    config: state.config,
    status: state.status,
    result: state.result,
    endReason: state.endReason,
    tree: state.tree,
    rootId: state.rootId,
    currentPath: state.currentPath,
    moveCounter: state.moveCounter,
    currentFen: state.currentFen,
    whiteTimeMs: state.whiteTimeMs,
    blackTimeMs: state.blackTimeMs,
    clockRunning: state.clockRunning,
    isBotThinking: state.isBotThinking,
    premoveQueue: state.premoveQueue,
    savedAt: Date.now(),
  }
}

function persistPlayState(state: PlayState) {
  if (state.status === 'idle' && state.rootId === null && state.currentPath.length === 0 && state.config === null) {
    removeSessionValue(SESSION_KEY)
    return
  }

  writeSessionJson(SESSION_KEY, toPersistedPlayState(state))
}

export function clearPlaySession() {
  removeSessionValue(SESSION_KEY)
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

const baseInitialState = {
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

// Hydrate the full play session so active games, clocks, and move history survive refresh.
const savedSession = loadPlaySession()
const initialState = savedSession
  ? {
      ...baseInitialState,
      config: savedSession.config,
      status: savedSession.status,
      result: savedSession.result,
      endReason: savedSession.endReason,
      tree: savedSession.tree,
      rootId: savedSession.rootId,
      currentPath: savedSession.currentPath,
      moveCounter: savedSession.moveCounter,
      currentFen: savedSession.currentFen,
      whiteTimeMs: savedSession.whiteTimeMs,
      blackTimeMs: savedSession.blackTimeMs,
      clockRunning: savedSession.clockRunning,
      isBotThinking: savedSession.isBotThinking,
      premoveQueue: savedSession.premoveQueue,
    }
  : baseInitialState

export const usePlayStore = create<PlayState>((set) => ({
  ...initialState,

  setConfig: (config) => set({ config }),

  startGame: (config) => {
    clearPlaySession()
    set({
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
    })
  },

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

  resetPlay: () => {
    clearPlaySession()
    set({ ...baseInitialState })
  },
}))

usePlayStore.subscribe((state) => {
  persistPlayState(state)
})
