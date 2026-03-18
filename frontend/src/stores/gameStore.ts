// gameStore.ts — Global game state (Zustand)
import { create } from 'zustand'
import type { MoveEval } from '../engine/analysis'
import type { TopLine } from '../engine/stockfish'
import type { CriticalMoment } from '../chess/types'


export interface GameMeta {
  opponent: string
  opponentRating: number
  result: 'W' | 'L' | 'D'
  timeControl: string
  endTime: number
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
  setCurrentGameMeta: (meta: GameMeta | null) => void
  setSkipNextAnalysis: (v: boolean) => void
  reset: () => void
}

const initialState = {
  pgn: null,
  rawPgn: null as string | null,
  loadedPgn: null as string | null,
  moveEvals: [],
  analyzedCount: 0,
  criticalMoments: [],
  userElo: 1200,
  userColor: null as 'white' | 'black' | null,
  platform: null as 'chesscom' | 'lichess' | null,
  isAnalyzing: false,
  totalMovesCount: 0,
  currentPositionLines: [],
  isAnalyzingPosition: false,
  currentGameId: null as string | null,
  currentGameMeta: null as GameMeta | null,
  skipNextAnalysis: false,
}

export const useGameStore = create<GameState>(set => ({
  ...initialState,
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
  setCurrentGameMeta: currentGameMeta => set({ currentGameMeta }),
  setSkipNextAnalysis: skipNextAnalysis => set({ skipNextAnalysis }),
  reset: () => set(initialState),
}))
