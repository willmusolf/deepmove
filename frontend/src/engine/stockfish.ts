// stockfish.ts — Web Worker manager for Stockfish WASM
//
// The worker IS /public/stockfish/stockfish.js (nmrugg build).
// It auto-detects worker context and speaks UCI over postMessage.
// We just send UCI strings in and parse UCI strings back out.

export interface EvalResult {
  fen: string
  depth: number
  score: number      // centipawns, positive = white advantage; ±30000 = forced mate
  isMate: boolean
  mateIn: number | null  // positive = white mates, negative = black mates
  bestMove: string
  pv: string[]
}

interface QueueItem {
  fen: string
  depth: number
  resolve: (result: EvalResult) => void
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

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.worker = new Worker('/stockfish/stockfish.js')

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
        if (!err.message) return  // ignore spurious non-fatal worker errors
        if (settled) return
        settled = true
        if (this._initTimeoutId) { clearTimeout(this._initTimeoutId); this._initTimeoutId = null }
        reject(new Error(`Stockfish worker error: ${err.message}`))
      }

      this.worker.postMessage('uci')
    })
  }

  private onUciLine(line: string) {
    // Parse eval info from 'info depth ...' lines
    if (line.startsWith('info')) {
      const depthMatch = line.match(/\bdepth (\d+)/)
      const cpMatch = line.match(/\bscore cp (-?\d+)/)
      const mateMatch = line.match(/\bscore mate (-?\d+)/)
      const pvMatch = line.match(/ pv (.+)$/)

      if (depthMatch) this.latestDepth = parseInt(depthMatch[1], 10)

      if (mateMatch) {
        const m = parseInt(mateMatch[1], 10)
        this.latestIsMate = true
        this.latestMateIn = m
        this.latestScore = m > 0 ? 30_000 : -30_000
      } else if (cpMatch) {
        this.latestIsMate = false
        this.latestMateIn = null
        this.latestScore = parseInt(cpMatch[1], 10)
      }

      if (pvMatch) this.latestPv = pvMatch[1].trim().split(' ')
      return
    }

    // 'bestmove e2e4 ponder e7e5'
    if (line.startsWith('bestmove')) {
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

  private drainQueue() {
    if (this.busy || this.queue.length === 0) return
    const next = this.queue.shift()!
    this.dispatch(next)
  }

  private dispatch(item: QueueItem) {
    this.busy = true
    this.currentFen = item.fen
    this.latestScore = 0
    this.latestIsMate = false
    this.latestMateIn = null
    this.latestDepth = 0
    this.latestBestMove = ''
    this.latestPv = []
    this.pendingResolve = item.resolve
    this.worker!.postMessage(`position fen ${item.fen}`)
    this.worker!.postMessage(`go depth ${item.depth}`)
  }

  analyzePosition(fen: string, depth = 15): Promise<EvalResult> {
    if (!this.worker) return Promise.reject(new Error('Engine not initialized'))

    return new Promise((resolve) => {
      const item: QueueItem = { fen, depth, resolve }
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
    this.queue = []
    this.pendingResolve = null
    this.busy = false
    if (this.worker) {
      this.worker.postMessage('quit')
      this.worker.terminate()
      this.worker = null
    }
  }
}
