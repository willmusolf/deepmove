// gameStore.ts — Global game state (Zustand)
import { create } from 'zustand'
import type { MoveEval } from '../engine/analysis'
import type { TopLine } from '../engine/stockfish'
import type { CriticalMoment } from '../chess/types'

interface GameState {
  pgn: string | null
  moveEvals: MoveEval[]
  currentMoveIndex: number
  criticalMoments: CriticalMoment[]
  userElo: number
  isAnalyzing: boolean
  totalMovesCount: number   // set at analysis start so status bar can show "32/47"
  currentPositionLines: TopLine[]   // multi-PV results for current position
  isAnalyzingPosition: boolean      // true while running per-position multi-PV analysis

  // Actions
  setPgn: (pgn: string) => void
  setMoveEvals: (evals: MoveEval[]) => void
  setCurrentMove: (index: number) => void
  setCriticalMoments: (moments: CriticalMoment[]) => void
  setUserElo: (elo: number) => void
  setAnalyzing: (analyzing: boolean) => void
  setTotalMovesCount: (count: number) => void
  setCurrentPositionLines: (lines: TopLine[]) => void
  setAnalyzingPosition: (v: boolean) => void
  reset: () => void
}

const initialState = {
  pgn: null,
  moveEvals: [],
  currentMoveIndex: 0,
  criticalMoments: [],
  userElo: 1200,
  isAnalyzing: false,
  totalMovesCount: 0,
  currentPositionLines: [],
  isAnalyzingPosition: false,
}

export const useGameStore = create<GameState>(set => ({
  ...initialState,
  setPgn: pgn => set({ pgn }),
  setMoveEvals: moveEvals => set({ moveEvals }),
  setCurrentMove: currentMoveIndex => set({ currentMoveIndex }),
  setCriticalMoments: criticalMoments => set({ criticalMoments }),
  setUserElo: userElo => set({ userElo }),
  setAnalyzing: isAnalyzing => set({ isAnalyzing }),
  setTotalMovesCount: totalMovesCount => set({ totalMovesCount }),
  setCurrentPositionLines: currentPositionLines => set({ currentPositionLines }),
  setAnalyzingPosition: isAnalyzingPosition => set({ isAnalyzingPosition }),
  reset: () => set(initialState),
}))
