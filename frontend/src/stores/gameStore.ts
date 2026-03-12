// gameStore.ts — Global game state (Zustand)
// Holds the current game being reviewed: PGN, move evals, current position, critical moments.
// TODO (Track A, Session 3+): Expand as features are built

import { create } from 'zustand'
import type { MoveEval } from '../engine/analysis'
import type { CriticalMoment } from '../chess/types'

interface GameState {
  pgn: string | null
  moveEvals: MoveEval[]
  currentMoveIndex: number
  criticalMoments: CriticalMoment[]
  userElo: number
  isAnalyzing: boolean

  // Actions
  setPgn: (pgn: string) => void
  setMoveEvals: (evals: MoveEval[]) => void
  setCurrentMove: (index: number) => void
  setCriticalMoments: (moments: CriticalMoment[]) => void
  setUserElo: (elo: number) => void
  setAnalyzing: (analyzing: boolean) => void
  reset: () => void
}

const initialState = {
  pgn: null,
  moveEvals: [],
  currentMoveIndex: 0,
  criticalMoments: [],
  userElo: 1200,
  isAnalyzing: false,
}

export const useGameStore = create<GameState>(set => ({
  ...initialState,
  setPgn: pgn => set({ pgn }),
  setMoveEvals: moveEvals => set({ moveEvals }),
  setCurrentMove: currentMoveIndex => set({ currentMoveIndex }),
  setCriticalMoments: criticalMoments => set({ criticalMoments }),
  setUserElo: userElo => set({ userElo }),
  setAnalyzing: isAnalyzing => set({ isAnalyzing }),
  reset: () => set(initialState),
}))
