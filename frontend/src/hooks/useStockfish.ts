// useStockfish.ts — React hook for Stockfish engine lifecycle + game analysis
//
// TWO-WORKER ARCHITECTURE:
//   backgroundEngine  — full-game sequential analysis (elo-adaptive depth)
//   interactiveEngine  — per-position multi-PV analysis (depth 22), always available

function getAnalysisDepth(elo: number): number {
  if (!elo || elo < 1200) return elo ? 10 : 14
  if (elo < 1600) return 14
  return 18
}

import { useEffect, useRef, useState } from 'react'
import { StockfishEngine } from '../engine/stockfish'
import type { TopLine } from '../engine/stockfish'
import { analyzeGame } from '../engine/analysis'

import { detectCriticalMoments } from '../engine/criticalMoments'
import { useGameStore } from '../stores/gameStore'
import { saveAnalyzedGame } from '../services/gameDB'
import { pushGame } from '../services/syncService'
import { useAuthStore } from '../stores/authStore'

export type EngineStatus = 'loading' | 'ready' | 'error'

export function useStockfish() {
  const backgroundRef = useRef<StockfishEngine | null>(null)
  const interactiveRef = useRef<StockfishEngine | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('loading')

  const setMoveEvals = useGameStore(s => s.setMoveEvals)
  const setAnalyzedCount = useGameStore(s => s.setAnalyzedCount)
  const setAnalyzing = useGameStore(s => s.setAnalyzing)
  const setTotalMovesCount = useGameStore(s => s.setTotalMovesCount)
  const setCriticalMoments = useGameStore(s => s.setCriticalMoments)
  const userElo = useGameStore(s => s.userElo)
  const userColor = useGameStore(s => s.userColor)

  useEffect(() => {
    const bg = new StockfishEngine()
    const ia = new StockfishEngine()
    backgroundRef.current = bg
    interactiveRef.current = ia

    Promise.all([bg.initialize(), ia.initialize()])
      .then(() => {
        setIsReady(true)
        setEngineStatus('ready')
      })
      .catch(err => {
        console.error('Stockfish init failed:', err)
        setEngineStatus('error')
      })

    return () => {
      bg.terminate()
      ia.terminate()
      backgroundRef.current = null
      interactiveRef.current = null
    }
  }, [])

  async function runAnalysis(pgn: string) {
    const engine = backgroundRef.current
    if (!engine || !isReady) return

    abortRef.current?.abort()
    engine.stop()  // interrupt any in-flight background analysis
    const controller = new AbortController()
    abortRef.current = controller

    setAnalyzing(true)
    setAnalyzedCount(0)
    setTotalMovesCount(0)

    const color = userColor ?? 'white'

    // Resume support: read how many moves are already analyzed from the store
    const startFromIndex = useGameStore.getState().resumeFromIndex
    const initialEvals = startFromIndex > 0 ? useGameStore.getState().moveEvals : []
    // Reset resumeFromIndex so a subsequent fresh analysis doesn't accidentally resume
    useGameStore.getState().setResumeFromIndex(0)

    if (startFromIndex === 0) {
      setMoveEvals([])
    }
    // If resuming, moveEvals already has the cached evals (set by handleSelect) — don't clear them

    // Build a partial game record template (filled in per-move and on completion)
    function buildRecord(evals: import('../engine/analysis').MoveEval[], partial: boolean, moments?: import('../chess/types').CriticalMoment[]) {
      const state = useGameStore.getState()
      if (!state.currentGameId || !state.currentGameMeta) return null
      const username = localStorage.getItem(
        state.platform === 'lichess' ? 'deepmove_lichess_username' : 'deepmove_chesscom_username'
      ) ?? ''
      return {
        id: state.currentGameId,
        username,
        platform: (state.platform ?? 'pgn-paste') as 'chesscom' | 'lichess' | 'pgn-paste',
        rawPgn: state.rawPgn ?? pgn,
        cleanedPgn: state.pgn ?? pgn,
        userColor: state.userColor,
        userElo: state.userElo,
        moveEvals: evals,
        criticalMoments: moments ?? [],
        analyzedAt: Date.now(),
        opponent: state.currentGameMeta.opponent,
        opponentRating: state.currentGameMeta.opponentRating,
        result: state.currentGameMeta.result,
        timeControl: state.currentGameMeta.timeControl,
        endTime: state.currentGameMeta.endTime,
        backendGameId: state.backendGameId ?? null,
        partial,
      }
    }

    // Per-move callback: update store + save partial checkpoint to IndexedDB
    const accumulatedEvals: import('../engine/analysis').MoveEval[] = [...initialEvals]
    function onMoveComplete(moveEval: import('../engine/analysis').MoveEval) {
      accumulatedEvals.push(moveEval)
      setMoveEvals([...accumulatedEvals])
      setAnalyzedCount(accumulatedEvals.length)
      // Detect critical moments progressively so coaching lessons start fetching early.
      // Only run once we have enough evals for the detection to be meaningful (10+ moves).
      // This fires on every move but detectCriticalMoments is cheap (sort + slice).
      if (accumulatedEvals.length >= 10) {
        const earlyMoments = detectCriticalMoments([...accumulatedEvals], color, userElo)
        setCriticalMoments(earlyMoments)
      }
      const record = buildRecord([...accumulatedEvals], true)
      if (record) saveAnalyzedGame(record).catch(() => {})
    }

    try {
      const results = await analyzeGame(
        pgn, engine, getAnalysisDepth(userElo),
        (_done, total) => { if (accumulatedEvals.length === startFromIndex) setTotalMovesCount(total) },
        controller.signal, 100,
        onMoveComplete,
        startFromIndex,
        initialEvals,
      )

      if (controller.signal.aborted) { setAnalyzedCount(0); setTotalMovesCount(0); return }

      setMoveEvals(results)
      const moments = detectCriticalMoments(results, color, userElo)
      setCriticalMoments(moments)

      // Final save: partial: false (complete)
      const state = useGameStore.getState()
      if (state.currentGameId && state.currentGameMeta) {
        const gameRecord = buildRecord(results, false, moments)
        if (gameRecord) {
          saveAnalyzedGame(gameRecord).catch(err => console.error('Failed to save game to IndexedDB:', err))

          // Push to backend if user is authenticated
          const accessToken = useAuthStore.getState().accessToken
          if (accessToken && !state.backendGameId) {
            pushGame(gameRecord)
              .then(backendId => {
                if (backendId !== null) {
                  useGameStore.getState().setBackendGameId(backendId)
                }
              })
              .catch(err => console.error('Failed to push game to backend:', err))
          }
        }
      }
    } catch (err) {
      console.error('Analysis failed:', err)
    } finally {
      setAnalyzing(false)
    }
  }

  async function analyzePositionLines(
    fen: string,
    depth = 22,
    numLines = 3,
    onUpdate?: (lines: TopLine[], depth: number) => void,
  ): Promise<TopLine[]> {
    const engine = interactiveRef.current
    if (!engine || !isReady) return []
    return engine.analyzePositionMultiPV(fen, depth, numLines, onUpdate)
  }

  function stopPositionAnalysis() {
    interactiveRef.current?.stopPositionAnalysis()
  }

  async function analyzePositionSingle(fen: string, depth = 14): Promise<import('../engine/stockfish').EvalResult | null> {
    const engine = interactiveRef.current
    if (!engine || !isReady) return null
    return engine.analyzePosition(fen, depth)
  }

  return { isReady, engineStatus, runAnalysis, analyzePositionLines, analyzePositionSingle, stopPositionAnalysis }
}
