// gameStore.ts — Global game state (Zustand)
import { create } from 'zustand'
import type { MoveEval } from '../engine/analysis'
import type { TopLine } from '../engine/stockfish'
import type { CriticalMoment } from '../chess/types'
import { readSessionJson, removeSessionValue, writeSessionJson } from '../utils/sessionStorage'


export interface GameMeta {
  opponent: string
  opponentRating: number
  result: 'W' | 'L' | 'D'
  timeControl: string
  endTime: number
}

const GAME_SESSION_KEY = 'deepmove_reviewGameSession'

interface PersistedGameState {
  pgn: string | null
  rawPgn: string | null
  loadedPgn: string | null
  moveEvals: MoveEval[]
  criticalMoments: CriticalMoment[]
  userElo: number
  userColor: 'white' | 'black' | null
  platform: 'chesscom' | 'lichess' | null
  totalMovesCount: number
  currentGameId: string | null
  backendGameId: number | null
  currentGameMeta: GameMeta | null
  skipNextAnalysis: boolean
  resumeFromIndex: number
}

interface GameState {
  pgn: string | null
  rawPgn: string | null  // original PGN before cleanPgn (needed for clock extraction)
  loadedPgn: string | null  // raw PGN of the currently loaded game (for list highlight)
  moveEvals: MoveEval[]
  analyzedCount: number     // incremented each move during analysis (for progress bar)
  criticalMoments: CriticalMoment[]
  userElo: number
  userColor: 'white' | 'black' | null  // null = unknown (PGN paste)
  platform: 'chesscom' | 'lichess' | null  // Platform the game was loaded from
  isAnalyzing: boolean
  totalMovesCount: number   // set at analysis start so status bar can show "32/47"
  currentPositionLines: TopLine[]   // multi-PV results for current position
  isAnalyzingPosition: boolean      // true while running per-position multi-PV analysis
  skipNextAnalysis: boolean         // set by GameSelector when loading from cache
  currentGameId: string | null      // canonical ID for IndexedDB persistence
  backendGameId: number | null      // DB primary key after sync (null until uploaded)
  currentGameMeta: GameMeta | null  // display metadata for IndexedDB record

  // Actions
  setPgn: (pgn: string) => void
  setRawPgn: (pgn: string) => void
  setLoadedPgn: (pgn: string) => void
  setMoveEvals: (evals: MoveEval[]) => void
  setAnalyzedCount: (count: number) => void
  setCriticalMoments: (moments: CriticalMoment[]) => void
  setUserElo: (elo: number) => void
  setUserColor: (color: 'white' | 'black' | null) => void
  setPlatform: (platform: 'chesscom' | 'lichess' | null) => void
  setAnalyzing: (analyzing: boolean) => void
  setTotalMovesCount: (count: number) => void
  setCurrentPositionLines: (lines: TopLine[]) => void
  setAnalyzingPosition: (v: boolean) => void
  setCurrentGameId: (id: string | null) => void
  setBackendGameId: (id: number | null) => void
  setCurrentGameMeta: (meta: GameMeta | null) => void
  setSkipNextAnalysis: (v: boolean) => void
  resumeFromIndex: number              // 0 = fresh analysis, N = resume from move N
  setResumeFromIndex: (n: number) => void
  reset: () => void
}

const initialState: {
  pgn: string | null
  rawPgn: string | null
  loadedPgn: string | null
  moveEvals: MoveEval[]
  analyzedCount: number
  criticalMoments: CriticalMoment[]
  userElo: number
  userColor: 'white' | 'black' | null
  platform: 'chesscom' | 'lichess' | null
  isAnalyzing: boolean
  totalMovesCount: number
  currentPositionLines: TopLine[]
  isAnalyzingPosition: boolean
  currentGameId: string | null
  backendGameId: number | null
  currentGameMeta: GameMeta | null
  skipNextAnalysis: boolean
  resumeFromIndex: number
} = {
  pgn: null,
  rawPgn: null,
  loadedPgn: null,
  moveEvals: [],
  analyzedCount: 0,
  criticalMoments: [],
  userElo: 1200,
  userColor: null,
  platform: null,
  isAnalyzing: false,
  totalMovesCount: 0,
  currentPositionLines: [],
  isAnalyzingPosition: false,
  currentGameId: null,
  backendGameId: null,
  currentGameMeta: null,
  skipNextAnalysis: false,
  resumeFromIndex: 0,
}

function sanitizeMoveEvals(value: unknown): MoveEval[] {
  return Array.isArray(value) ? value as MoveEval[] : []
}

function sanitizeCriticalMoments(value: unknown): CriticalMoment[] {
  return Array.isArray(value) ? value as CriticalMoment[] : []
}

function sanitizeGameMeta(value: unknown): GameMeta | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const meta = value as Partial<GameMeta>
  if (typeof meta.opponent !== 'string') return null
  if (typeof meta.opponentRating !== 'number') return null
  if (meta.result !== 'W' && meta.result !== 'L' && meta.result !== 'D') return null
  if (typeof meta.timeControl !== 'string') return null
  if (typeof meta.endTime !== 'number') return null

  return {
    opponent: meta.opponent,
    opponentRating: meta.opponentRating,
    result: meta.result,
    timeControl: meta.timeControl,
    endTime: meta.endTime,
  }
}

function loadGameState(): typeof initialState {
  const parsed = readSessionJson<Partial<PersistedGameState>>(GAME_SESSION_KEY)
  if (!parsed || typeof parsed !== 'object' || typeof parsed.pgn !== 'string') {
    return initialState
  }

  const moveEvals = sanitizeMoveEvals(parsed.moveEvals)
  const criticalMoments = sanitizeCriticalMoments(parsed.criticalMoments)
  const storedResume = typeof parsed.resumeFromIndex === 'number' ? parsed.resumeFromIndex : 0
  // If analysis was interrupted (resumeFromIndex reset to 0 but partial evals exist),
  // default to resuming from the last completed move rather than restarting from scratch.
  const resumeFromIndex = storedResume === 0 && moveEvals.length > 0
    ? moveEvals.length
    : storedResume

  return {
    ...initialState,
    pgn: parsed.pgn,
    rawPgn: typeof parsed.rawPgn === 'string' ? parsed.rawPgn : parsed.pgn,
    loadedPgn: typeof parsed.loadedPgn === 'string' ? parsed.loadedPgn : null,
    moveEvals,
    analyzedCount: moveEvals.length,
    criticalMoments,
    userElo: typeof parsed.userElo === 'number' ? parsed.userElo : initialState.userElo,
    userColor: parsed.userColor === 'white' || parsed.userColor === 'black' ? parsed.userColor : null,
    platform: parsed.platform === 'chesscom' || parsed.platform === 'lichess' ? parsed.platform : null,
    totalMovesCount: typeof parsed.totalMovesCount === 'number' ? parsed.totalMovesCount : 0,
    currentGameId: typeof parsed.currentGameId === 'string' ? parsed.currentGameId : null,
    backendGameId: typeof parsed.backendGameId === 'number' ? parsed.backendGameId : null,
    currentGameMeta: sanitizeGameMeta(parsed.currentGameMeta),
    skipNextAnalysis: parsed.skipNextAnalysis === true,
    resumeFromIndex,
  }
}

function toPersistedGameState(state: GameState): PersistedGameState {
  return {
    pgn: state.pgn,
    rawPgn: state.rawPgn,
    loadedPgn: state.loadedPgn,
    moveEvals: state.moveEvals,
    criticalMoments: state.criticalMoments,
    userElo: state.userElo,
    userColor: state.userColor,
    platform: state.platform,
    totalMovesCount: state.totalMovesCount,
    currentGameId: state.currentGameId,
    backendGameId: state.backendGameId,
    currentGameMeta: state.currentGameMeta,
    skipNextAnalysis: state.skipNextAnalysis,
    resumeFromIndex: state.resumeFromIndex,
  }
}

function persistGameState(state: GameState) {
  if (!state.pgn) {
    removeSessionValue(GAME_SESSION_KEY)
    return
  }

  writeSessionJson(GAME_SESSION_KEY, toPersistedGameState(state))
}

const hydratedInitialState = loadGameState()

export const useGameStore = create<GameState>(set => ({
  ...hydratedInitialState,
  setPgn: pgn => set({ pgn }),
  setRawPgn: rawPgn => set({ rawPgn }),
  setLoadedPgn: loadedPgn => set({ loadedPgn }),
  setMoveEvals: moveEvals => set({ moveEvals }),
  setAnalyzedCount: analyzedCount => set({ analyzedCount }),
  setCriticalMoments: criticalMoments => set({ criticalMoments }),
  setUserElo: userElo => set({ userElo }),
  setUserColor: userColor => set({ userColor }),
  setPlatform: platform => set({ platform }),
  setAnalyzing: isAnalyzing => set({ isAnalyzing }),
  setTotalMovesCount: totalMovesCount => set({ totalMovesCount }),
  setCurrentPositionLines: currentPositionLines => set({ currentPositionLines }),
  setAnalyzingPosition: isAnalyzingPosition => set({ isAnalyzingPosition }),
  setCurrentGameId: currentGameId => set({ currentGameId }),
  setBackendGameId: backendGameId => set({ backendGameId }),
  setCurrentGameMeta: currentGameMeta => set({ currentGameMeta }),
  setSkipNextAnalysis: skipNextAnalysis => set({ skipNextAnalysis }),
  setResumeFromIndex: resumeFromIndex => set({ resumeFromIndex }),
  reset: () => {
    removeSessionValue(GAME_SESSION_KEY)
    set(initialState)
  },
}))

useGameStore.subscribe((state) => {
  persistGameState(state)
})
