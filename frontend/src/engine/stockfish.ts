// stockfish.ts — Web Worker manager for Stockfish WASM
//
// The worker entry is /public/stockfish/worker.js, a tiny classic-worker wrapper
// around the copied nmrugg Stockfish bundle in /public/stockfish/stockfish.js.
// The Stockfish bundle reads self.location.hash in worker mode to discover the
// wasm URL, so we pass the explicit binary path through the worker URL hash.

import { Chess } from 'chess.js'

const MIN_MULTIPV_DISPLAY_DEPTH = 10

export interface EvalResult {
  fen: string
  depth: number
  score: number      // centipawns, positive = white advantage; ±30000 = forced mate
  isMate: boolean
  mateIn: number | null  // positive = white mates, negative = black mates
  bestMove: string
  pv: string[]
}

export interface TopLine {
  rank: number        // 1, 2, 3
  score: number       // centipawns, white-perspective
  isMate: boolean
  mateIn: number | null
  pv: string[]        // UCI moves e.g. ["e2e4", "e7e5", ...]
  san: string         // SAN of the first move for display
  depth: number       // analysis depth at which this line was produced
}

interface QueueItem {
  fen: string
  depth: number
  resolve: (result: EvalResult) => void
  reject?: (reason?: unknown) => void
  multiPV?: number
  multiPvResolve?: (lines: TopLine[]) => void
  multiPvOnUpdate?: (lines: TopLine[], depth: number) => void
  // Bot play fields
  botMoveResolve?: (uci: string) => void
  botElo?: number
  movetime?: number
}

export class StockfishEngine {
  private worker: Worker | null = null
  private pendingResolve: ((result: EvalResult) => void) | null = null
  private currentFen = ''
  private latestScore = 0
  private latestIsMate = false
  private latestMateIn: number | null = null
  private latestDepth = 0
  private latestBestMove = ''
  private latestPv: string[] = []
  private busy = false
  private queue: QueueItem[] = []
  private _initTimeoutId: ReturnType<typeof setTimeout> | null = null

  // Multi-PV state
  private currentIsMultiPV = false
  private currentMultiPvResolve: ((lines: TopLine[]) => void) | null = null
  private currentMultiPvOnUpdate: ((lines: TopLine[], depth: number) => void) | null = null
  private lastEmittedMultiPvDepth = 0
  private latestMultiPvLines: Map<number, TopLine> = new Map()
  private currentSideToMove: 'w' | 'b' = 'w'

  // Bot move state
  private currentIsBotMove = false
  private currentBotMoveResolve: ((uci: string) => void) | null = null

  // Pending queue item waiting for readyok before dispatch (race-condition guard)
  private pendingQueueItem: QueueItem | null = null

  private createCancelledError(): Error {
    return new Error('Stockfish analysis cancelled')
  }

  private cancelQueueItem(item: QueueItem | null) {
    if (!item) return
    item.reject?.(this.createCancelledError())
  }

  private normalizeScoreForWhite(rawScore: number): number {
    return this.currentSideToMove === 'w' ? rawScore : -rawScore
  }

  private normalizeMateForWhite(mateIn: number | null): number | null {
    if (mateIn === null) return null
    return this.currentSideToMove === 'w' ? mateIn : -mateIn
  }

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.worker = new Worker('/stockfish/worker.js#/stockfish/stockfish.wasm,worker')

      let settled = false

      this._initTimeoutId = setTimeout(() => {
        if (settled) return
        settled = true
        reject(new Error('Stockfish init timed out'))
      }, 60_000)

      // Two-phase init: 'uci' → wait for 'uciok' → 'isready' → wait for 'readyok'
      this.worker.onmessage = (e: MessageEvent<string>) => {
        const line = e.data
        if (line === 'uciok') {
          this.worker!.postMessage('setoption name Hash value 128')
          // Use multiple threads if SharedArrayBuffer is available (requires COOP/COEP headers).
          // Cap at 4 — diminishing returns beyond that; leave 1 core for the UI thread.
          const threads = typeof SharedArrayBuffer !== 'undefined'
            ? Math.min(4, Math.max(1, (navigator.hardwareConcurrency ?? 2) - 1))
            : 1
          this.worker!.postMessage(`setoption name Threads value ${threads}`)
          this.worker!.postMessage('isready')
        } else if (line === 'readyok') {
          if (settled) return
          settled = true
          if (this._initTimeoutId) { clearTimeout(this._initTimeoutId); this._initTimeoutId = null }
          this.worker!.onmessage = (ev: MessageEvent<string>) => this.onUciLine(ev.data)
          resolve()
        }
      }

      this.worker.onerror = (err) => {
        if (settled) return
        settled = true
        if (this._initTimeoutId) { clearTimeout(this._initTimeoutId); this._initTimeoutId = null }
        const message = err.message || 'Stockfish worker failed to load'
        reject(new Error(`Stockfish worker error: ${message}`))
      }

      this.worker.postMessage('uci')
    })
  }

  private uciToSan(fen: string, uciMove: string): string {
    try {
      const chess = new Chess(fen)
      const from = uciMove.slice(0, 2)
      const to = uciMove.slice(2, 4)
      const promo = uciMove[4]
      const move = chess.move({ from, to, promotion: promo ?? 'q' })
      return move?.san ?? uciMove
    } catch {
      return uciMove
    }
  }

  private onUciLine(line: string) {
    // readyok: worker has flushed all prior commands — safe to dispatch pending multi-PV analysis
    if (line === 'readyok' && this.pendingQueueItem) {
      const item = this.pendingQueueItem
      this.pendingQueueItem = null
      this.dispatch(item)
      return
    }

    if (line.startsWith('info')) {
      if (this.currentIsMultiPV) {
        // Multi-PV parsing — accumulate per-rank
        const multiPvMatch = line.match(/\bmultipv (\d+)/)
        if (!multiPvMatch) return
        const rank = parseInt(multiPvMatch[1], 10)

        const depthMatch = line.match(/\bdepth (\d+)/)
        const cpMatch = line.match(/\bscore cp (-?\d+)/)
        const mateMatch = line.match(/\bscore mate (-?\d+)/)
        const pvMatch = line.match(/ pv (.+)$/)
        if (!pvMatch) return

        const depth = depthMatch ? parseInt(depthMatch[1], 10) : 0
        const pv = pvMatch[1].trim().split(' ')
        let isMate = false
        let mateIn: number | null = null
        let rawScore = 0

        if (mateMatch) {
          const m = parseInt(mateMatch[1], 10)
          isMate = true
          mateIn = m
          rawScore = m > 0 ? 30_000 : -30_000
        } else if (cpMatch) {
          rawScore = parseInt(cpMatch[1], 10)
        }

        // Convert to white-perspective
        const score = this.normalizeScoreForWhite(rawScore)
        const whiteMateIn = isMate ? this.normalizeMateForWhite(mateIn) : null

        const san = pv.length > 0 ? this.uciToSan(this.currentFen, pv[0]) : ''

        this.latestMultiPvLines.set(rank, { rank, score, isMate, mateIn: whiteMateIn, pv, san, depth })

        // Emit when rank 1 reaches a new depth. Rank 1 is emitted first by Stockfish,
        // so this fires as early as possible at each depth. Ranks 2/3 may lag by
        // one depth in the emitted array, which is acceptable — the depth counter
        // progresses smoothly and rank 1 (the best move) is always current.
        if (rank === 1 && depth >= MIN_MULTIPV_DISPLAY_DEPTH && depth > this.lastEmittedMultiPvDepth && this.currentMultiPvOnUpdate) {
          this.lastEmittedMultiPvDepth = depth
          this.currentMultiPvOnUpdate(
            Array.from(this.latestMultiPvLines.values()).sort((a, b) => a.rank - b.rank),
            depth,
          )
        }
      } else {
        // Single-PV parsing (existing logic)
        const depthMatch = line.match(/\bdepth (\d+)/)
        const cpMatch = line.match(/\bscore cp (-?\d+)/)
        const mateMatch = line.match(/\bscore mate (-?\d+)/)
        const pvMatch = line.match(/ pv (.+)$/)

        if (depthMatch) this.latestDepth = parseInt(depthMatch[1], 10)

        if (mateMatch) {
          const m = parseInt(mateMatch[1], 10)
          this.latestIsMate = true
          this.latestMateIn = this.normalizeMateForWhite(m)
          this.latestScore = this.normalizeScoreForWhite(m > 0 ? 30_000 : -30_000)
        } else if (cpMatch) {
          this.latestIsMate = false
          this.latestMateIn = null
          this.latestScore = this.normalizeScoreForWhite(parseInt(cpMatch[1], 10))
        }

        if (pvMatch) this.latestPv = pvMatch[1].trim().split(' ')
      }
      return
    }

    // 'bestmove e2e4 ponder e7e5'
    if (line.startsWith('bestmove')) {
      if (this.currentIsBotMove) {
        const bmMatch = line.match(/^bestmove (\S+)/)
        const uci = bmMatch ? bmMatch[1] : ''

        const resolve = this.currentBotMoveResolve
        this.currentBotMoveResolve = null
        this.currentIsBotMove = false
        this.busy = false

        // Reset strength limiting for subsequent analysis
        this.worker!.postMessage('setoption name UCI_LimitStrength value false')

        if (resolve) resolve(uci)
        this.drainQueue()
      } else if (this.currentIsMultiPV) {
        const lines = Array.from(this.latestMultiPvLines.values())
          .sort((a, b) => a.rank - b.rank)

        const resolve = this.currentMultiPvResolve
        this.currentMultiPvResolve = null
        this.currentMultiPvOnUpdate = null
        this.currentIsMultiPV = false
        this.latestMultiPvLines = new Map()
        this.busy = false

        // Reset MultiPV to 1 for subsequent single-PV analysis
        this.worker!.postMessage('setoption name MultiPV value 1')

        if (resolve) resolve(lines)
        this.drainQueue()
      } else {
        const bmMatch = line.match(/^bestmove (\S+)/)
        if (bmMatch) this.latestBestMove = bmMatch[1]

        const result: EvalResult = {
          fen: this.currentFen,
          depth: this.latestDepth,
          score: this.latestScore,
          isMate: this.latestIsMate,
          mateIn: this.latestMateIn,
          bestMove: this.latestBestMove,
          pv: this.latestPv,
        }

        const resolve = this.pendingResolve
        this.pendingResolve = null
        this.busy = false

        if (resolve) resolve(result)
        this.drainQueue()
      }
    }
  }

  private drainQueue() {
    if (this.busy || this.queue.length === 0) return
    const next = this.queue.shift()!
    if (next.multiPV) {
      // Before dispatching multi-PV analysis, flush any pending stop commands
      // with an isready/readyok round-trip. Without this, a second 'stop' sent
      // during rapid navigate-away → navigate-back can race with the new 'go'
      // and kill the new analysis at depth 2-3, appearing as premature completion.
      this.pendingQueueItem = next
      this.worker!.postMessage('isready')
      return
    }
    this.dispatch(next)
  }

  private dispatch(item: QueueItem) {
    this.busy = true
    this.currentFen = item.fen
    this.currentSideToMove = item.fen.split(' ')[1] === 'b' ? 'b' : 'w'

    if (item.botMoveResolve && item.botElo !== undefined && item.movetime !== undefined) {
      this.currentIsBotMove = true
      this.currentBotMoveResolve = item.botMoveResolve
      this.currentIsMultiPV = false
      this.latestBestMove = ''
      this.pendingResolve = null
      this.worker!.postMessage('setoption name UCI_LimitStrength value true')
      this.worker!.postMessage(`setoption name UCI_Elo value ${item.botElo}`)
      this.worker!.postMessage(`position fen ${item.fen}`)
      this.worker!.postMessage(`go movetime ${item.movetime}`)
    } else if (item.multiPV && item.multiPvResolve) {
      this.currentIsBotMove = false
      this.currentIsMultiPV = true
      this.currentMultiPvResolve = item.multiPvResolve
      this.currentMultiPvOnUpdate = item.multiPvOnUpdate ?? null
      this.lastEmittedMultiPvDepth = 0
      this.latestMultiPvLines = new Map()
      this.worker!.postMessage(`setoption name MultiPV value ${item.multiPV}`)
      this.worker!.postMessage(`position fen ${item.fen}`)
      this.worker!.postMessage(`go depth ${item.depth}`)
    } else {
      this.currentIsBotMove = false
      this.currentIsMultiPV = false
      this.latestScore = 0
      this.latestIsMate = false
      this.latestMateIn = null
      this.latestDepth = 0
      this.latestBestMove = ''
      this.latestPv = []
      this.pendingResolve = item.resolve
      this.worker!.postMessage(`position fen ${item.fen}`)
      this.worker!.postMessage(item.movetime ? `go depth ${item.depth} movetime ${item.movetime}` : `go depth ${item.depth}`)
    }
  }

  analyzePosition(fen: string, depth = 15, movetime?: number): Promise<EvalResult> {
    if (!this.worker) return Promise.reject(new Error('Engine not initialized'))

    return new Promise((resolve, reject) => {
      const item: QueueItem = { fen, depth, movetime, resolve, reject }
      if (this.busy) {
        this.queue.push(item)
      } else {
        this.dispatch(item)
      }
    })
  }

  analyzePositionMultiPV(
    fen: string,
    depth = 22,
    numLines = 3,
    onUpdate?: (lines: TopLine[], depth: number) => void,
  ): Promise<TopLine[]> {
    if (!this.worker) return Promise.reject(new Error('Engine not initialized'))

    return new Promise((resolve, reject) => {
      const item: QueueItem = {
        fen,
        depth,
        resolve: () => {},  // unused for multi-PV
        reject,
        multiPV: numLines,
        multiPvResolve: resolve,
        multiPvOnUpdate: onUpdate,
      }
      if (this.busy) {
        this.queue.push(item)
      } else {
        this.dispatch(item)
      }
    })
  }

  /** Stop any in-flight multi-PV position analysis and clear queued position analyses.
   *  Never interrupts full-game single-PV analysis. */
  stopPositionAnalysis(): void {
    // Remove only multi-PV items from the queue (leave full-game single-PV items)
    const retainedQueue: QueueItem[] = []
    for (const item of this.queue) {
      if (item.multiPV) {
        this.cancelQueueItem(item)
      } else {
        retainedQueue.push(item)
      }
    }
    this.queue = retainedQueue
    // Clear the onUpdate callback so no stale results can fire after stop
    this.currentMultiPvOnUpdate = null
    // Clear any pending multi-PV item waiting for readyok
    if (this.pendingQueueItem?.multiPV) {
      this.cancelQueueItem(this.pendingQueueItem)
    }
    this.pendingQueueItem = null
    // If currently running a multi-PV analysis, stop it immediately
    if (this.worker && this.busy && this.currentIsMultiPV) {
      this.worker.postMessage('stop')
    }
  }

  /** Send UCI 'stop' so Stockfish emits bestmove immediately. Clears pending queue.
   *  Use this when switching games so the abort loop exits fast instead of waiting
   *  for the current depth-15 analysis to finish (~3-5s per position). */
  stop(): void {
    for (const item of this.queue) this.cancelQueueItem(item)
    this.queue = []
    this.cancelQueueItem(this.pendingQueueItem)
    this.pendingQueueItem = null
    if (this.worker && this.busy) {
      this.worker.postMessage('stop')
    }
  }

  /** Get the best move for a position at limited strength (for bot play).
   *  Uses UCI_LimitStrength + UCI_Elo to simulate a weaker player.
   *  movetime in milliseconds. Returns the UCI move string e.g. "e2e4". */
  getBotMove(fen: string, elo: number, movetime: number): Promise<string> {
    if (!this.worker) return Promise.reject(new Error('Engine not initialized'))

    return new Promise((resolve, reject) => {
      const item: QueueItem = {
        fen,
        depth: 0,          // unused — go movetime is used instead
        resolve: () => {}, // unused — botMoveResolve handles resolution
        reject,
        botMoveResolve: resolve,
        botElo: elo,
        movetime,
      }
      if (this.busy) {
        this.queue.push(item)
      } else {
        this.dispatch(item)
      }
    })
  }

  terminate(): void {
    if (this._initTimeoutId !== null) {
      clearTimeout(this._initTimeoutId)
      this._initTimeoutId = null
    }
    for (const item of this.queue) this.cancelQueueItem(item)
    this.cancelQueueItem(this.pendingQueueItem)
    this.queue = []
    this.pendingQueueItem = null
    this.pendingResolve = null
    this.currentMultiPvResolve = null
    this.currentBotMoveResolve = null
    this.busy = false
    if (this.worker) {
      this.worker.postMessage('quit')
      this.worker.terminate()
      this.worker = null
    }
  }
}
