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
  it('waits until depth 10 before streaming lines to the UI', async () => {
    const engine = createEngine()
    const onUpdate = vi.fn()
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

    const resultPromise = engine.analyzePositionMultiPV(fen, 18, 2, onUpdate)
    ;(engine as any).onUciLine('info depth 9 multipv 1 score cp 30 pv e2e4 e7e5')
    ;(engine as any).onUciLine('info depth 9 multipv 2 score cp 22 pv d2d4 d7d5')
    expect(onUpdate).not.toHaveBeenCalled()

    ;(engine as any).onUciLine('info depth 10 multipv 1 score cp 35 pv e2e4 e7e5')
    ;(engine as any).onUciLine('info depth 10 multipv 2 score cp 24 pv d2d4 d7d5')

    expect(onUpdate).toHaveBeenCalledTimes(1)
    const [lines, streamedDepth] = onUpdate.mock.calls[0]
    expect(streamedDepth).toBe(10)
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rank: 1, depth: 10, pv: ['e2e4', 'e7e5'] }),
        expect.objectContaining({ rank: 2, pv: ['d2d4', 'd7d5'] }),
      ]),
    )

    ;(engine as any).onUciLine('bestmove e2e4')
    await expect(resultPromise).resolves.toHaveLength(2)
  })
})
