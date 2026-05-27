import { describe, expect, it, vi } from 'vitest'
import { StockfishEngine } from './stockfish'

function createEngine() {
  const engine = new StockfishEngine()
  ;(engine as any).worker = {
    postMessage: vi.fn(),
    terminate: vi.fn(),
  }
  return engine
}

// Helper: simulate engine init handshake and capture postMessage calls
function captureInitMessages(opts?: Parameters<StockfishEngine['initialize']>[0]): Promise<string[]> {
  const messages: string[] = []
  let onMessage: ((e: MessageEvent<string>) => void) | null = null

  class MockWorker {
    postMessage(msg: string) {
      messages.push(msg)
      if (msg === 'uci') {
        onMessage?.({ data: 'uciok' } as MessageEvent<string>)
      } else if (msg === 'isready') {
        onMessage?.({ data: 'readyok' } as MessageEvent<string>)
      }
    }
    set onmessage(handler: (e: MessageEvent<string>) => void) {
      onMessage = handler
    }
    onerror = null
    terminate = vi.fn()
  }

  vi.stubGlobal('Worker', MockWorker)

  const engine = new StockfishEngine()
  return engine.initialize(opts).then(() => {
    vi.unstubAllGlobals()
    return messages
  })
}

describe('StockfishEngine initialize hashMB option', () => {
  it('sends specified hashMB value during init', async () => {
    const messages = await captureInitMessages({ hashMB: 32 })
    expect(messages).toContain('setoption name Hash value 32')
  })

  it('uses default hash of 16 when hashMB is not provided', async () => {
    const messages = await captureInitMessages()
    expect(messages).toContain('setoption name Hash value 16')
  })

  it('always sends Threads value 1', async () => {
    const messages = await captureInitMessages({ hashMB: 64 })
    expect(messages).toContain('setoption name Threads value 1')
  })
})

describe('StockfishEngine single-PV normalization', () => {
  it('normalizes centipawn scores to white perspective', async () => {
    const engine = createEngine()
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1'

    const resultPromise = engine.analyzePosition(fen, 12)
    ;(engine as any).onUciLine('info depth 12 score cp 180 pv e7e5')
    ;(engine as any).onUciLine('bestmove e7e5')

    await expect(resultPromise).resolves.toMatchObject({
      fen,
      depth: 12,
      score: -180,
      isMate: false,
      mateIn: null,
      bestMove: 'e7e5',
      pv: ['e7e5'],
    })
  })

  it('normalizes mate scores and mate distance to white perspective', async () => {
    const engine = createEngine()
    const fen = 'rnb1kbnr/pppp1ppp/8/4p3/6q1/5P2/PPPPP1PP/RNBQKBNR b KQkq - 0 2'

    const resultPromise = engine.analyzePosition(fen, 14)
    ;(engine as any).onUciLine('info depth 14 score mate 3 pv g4h4')
    ;(engine as any).onUciLine('bestmove g4h4')

    await expect(resultPromise).resolves.toMatchObject({
      fen,
      depth: 14,
      score: -30000,
      isMate: true,
      mateIn: -3,
      bestMove: 'g4h4',
      pv: ['g4h4'],
    })
  })
})

describe('StockfishEngine multi-PV update gating', () => {
  it('waits until depth 12 before streaming lines to the UI', async () => {
    const engine = createEngine()
    const onUpdate = vi.fn()
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

    const resultPromise = engine.analyzePositionMultiPV(fen, 18, 2, onUpdate)
    ;(engine as any).onUciLine('info depth 11 multipv 1 score cp 30 pv e2e4 e7e5')
    ;(engine as any).onUciLine('info depth 11 multipv 2 score cp 22 pv d2d4 d7d5')
    expect(onUpdate).not.toHaveBeenCalled()

    ;(engine as any).onUciLine('info depth 12 multipv 1 score cp 35 pv e2e4 e7e5')
    expect(onUpdate).not.toHaveBeenCalled()
    ;(engine as any).onUciLine('info depth 12 multipv 2 score cp 24 pv d2d4 d7d5')

    expect(onUpdate).toHaveBeenCalledTimes(1)
    const [lines, streamedDepth] = onUpdate.mock.calls[0]
    expect(streamedDepth).toBe(12)
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rank: 1, depth: 12, pv: ['e2e4', 'e7e5'] }),
        expect.objectContaining({ rank: 2, pv: ['d2d4', 'd7d5'] }),
      ]),
    )

    ;(engine as any).onUciLine('bestmove e2e4')
    await expect(resultPromise).resolves.toHaveLength(2)
  })

  it('streams multi-PV updates only after every requested line reaches the depth', async () => {
    const engine = createEngine()
    const onUpdate = vi.fn()
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

    const resultPromise = engine.analyzePositionMultiPV(fen, 20, 3, onUpdate)

    ;(engine as any).onUciLine('info depth 20 multipv 1 score cp 30 pv e2e4 e7e5')
    ;(engine as any).onUciLine('info depth 20 multipv 2 score cp 22 pv d2d4 d7d5')
    expect(onUpdate).not.toHaveBeenCalled()

    ;(engine as any).onUciLine('info depth 20 multipv 3 score cp 16 pv g1f3 g8f6')

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate).toHaveBeenLastCalledWith(
      [
        expect.objectContaining({ rank: 1, depth: 20, pv: ['e2e4', 'e7e5'] }),
        expect.objectContaining({ rank: 2, depth: 20, pv: ['d2d4', 'd7d5'] }),
        expect.objectContaining({ rank: 3, depth: 20, pv: ['g1f3', 'g8f6'] }),
      ],
      20,
    )

    ;(engine as any).onUciLine('bestmove e2e4')
    await expect(resultPromise).resolves.toHaveLength(3)
  })

  it('rejects queued multi-PV requests when position analysis is cancelled', async () => {
    const engine = createEngine()
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

    const currentPromise = engine.analyzePositionMultiPV(fen, 18, 2)
    const queuedPromise = engine.analyzePositionMultiPV(fen, 18, 2)

    engine.stopPositionAnalysis()

    await expect(queuedPromise).rejects.toThrow('Stockfish analysis cancelled')

    ;(engine as any).onUciLine('bestmove e2e4')
    await expect(currentPromise).resolves.toEqual([])
  })

  it('rejects a pending readyok-guarded multi-PV request when cancelled', async () => {
    const engine = createEngine()
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

    const currentPromise = engine.analyzePositionMultiPV(fen, 18, 2)
    const pendingPromise = engine.analyzePositionMultiPV(fen, 18, 2)

    ;(engine as any).onUciLine('bestmove e2e4')
    engine.stopPositionAnalysis()

    await expect(pendingPromise).rejects.toThrow('Stockfish analysis cancelled')
    await expect(currentPromise).resolves.toEqual([])
  })
})
