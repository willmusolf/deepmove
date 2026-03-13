// useStockfish.ts — React hook for Stockfish engine lifecycle + game analysis

import { useEffect, useRef, useState } from 'react'
import { StockfishEngine } from '../engine/stockfish'
import type { TopLine } from '../engine/stockfish'
import { analyzeGame } from '../engine/analysis'
import type { MoveEval } from '../engine/analysis'
import { detectCriticalMoments } from '../engine/criticalMoments'
import { useGameStore } from '../stores/gameStore'

export type EngineStatus = 'loading' | 'ready' | 'error'

export function useStockfish() {
  const engineRef = useRef<StockfishEngine | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('loading')

  const setMoveEvals = useGameStore(s => s.setMoveEvals)
  const setAnalyzing = useGameStore(s => s.setAnalyzing)
  const setTotalMovesCount = useGameStore(s => s.setTotalMovesCount)
  const setCriticalMoments = useGameStore(s => s.setCriticalMoments)
  const userElo = useGameStore(s => s.userElo)
  const userColor = useGameStore(s => s.userColor)

  useEffect(() => {
    const engine = new StockfishEngine()
    engineRef.current = engine

    engine.initialize()
      .then(() => {
        setIsReady(true)
        setEngineStatus('ready')
      })
      .catch(err => {
        console.error('Stockfish init failed:', err)
        setEngineStatus('error')
      })

    return () => {
      engine.terminate()
      engineRef.current = null
    }
  }, [])

  async function runAnalysis(pgn: string) {
    const engine = engineRef.current
    if (!engine || !isReady) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setAnalyzing(true)
    setMoveEvals([])
    setTotalMovesCount(0)

    const partial: MoveEval[] = []
    const color = userColor ?? 'white'

    try {
      await analyzeGame(pgn, engine, 15, (done, total, latest) => {
        if (done === 1) setTotalMovesCount(total)
        partial.push(latest)
        setMoveEvals([...partial])
      }, controller.signal)
      if (controller.signal.aborted) return
      const moments = detectCriticalMoments(partial, color, userElo)
      setCriticalMoments(moments)
    } catch (err) {
      console.error('Analysis failed:', err)
    } finally {
      setAnalyzing(false)
    }
  }

  async function analyzePositionLines(fen: string, depth = 18, numLines = 3): Promise<TopLine[]> {
    const engine = engineRef.current
    if (!engine || !isReady) return []
    return engine.analyzePositionMultiPV(fen, depth, numLines)
  }

  return { isReady, engineStatus, runAnalysis, analyzePositionLines }
}
