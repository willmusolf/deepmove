import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ChessBoard, { getLegalDests, getTurnColor } from './ChessBoard'

const redrawAll = vi.fn()
const cancelMove = vi.fn()

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn((query: string) => ({
    matches: query === '(pointer: coarse)',
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

vi.mock('chessground', () => ({
  Chessground: vi.fn(() => ({
    set: vi.fn(),
    cancelMove,
    redrawAll,
    destroy: vi.fn(),
  })),
}))

describe('ChessBoard component', () => {
  it('renders the board container', () => {
    render(<ChessBoard />)
    const board = screen.getByRole('region')
    expect(board).toBeInTheDocument()
  })

  it('redraws the board when ResizeObserver reports a new size', () => {
    let resizeCallback: ResizeObserverCallback | null = null
    ;(globalThis as any).ResizeObserver = class ResizeObserver {
      constructor(cb: ResizeObserverCallback) {
        resizeCallback = cb
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    const originalRaf = window.requestAnimationFrame
    window.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
      cb(0)
      return 1
    })

    redrawAll.mockClear()
    render(<ChessBoard />)

    act(() => {
      resizeCallback?.([{ contentRect: { width: 320, height: 320 } } as ResizeObserverEntry], {} as ResizeObserver)
    })

    expect(redrawAll).toHaveBeenCalled()
    window.requestAnimationFrame = originalRaf
  })

  it('cancels board drag state when a pinch gesture starts', () => {
    cancelMove.mockClear()
    render(<ChessBoard />)

    const event = new Event('touchstart')
    Object.defineProperty(event, 'touches', {
      configurable: true,
      value: [{ clientX: 20, clientY: 20 }, { clientX: 80, clientY: 80 }],
    })

    act(() => {
      window.dispatchEvent(event)
    })

    expect(cancelMove).toHaveBeenCalled()
  })

  it('does not enable pinch-cancel handling for fine pointers', () => {
    const matchMediaMock = vi.mocked(window.matchMedia)
    matchMediaMock.mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))

    cancelMove.mockClear()
    render(<ChessBoard />)

    const event = new Event('touchstart')
    Object.defineProperty(event, 'touches', {
      configurable: true,
      value: [{ clientX: 20, clientY: 20 }, { clientX: 80, clientY: 80 }],
    })

    act(() => {
      window.dispatchEvent(event)
    })

    expect(cancelMove).not.toHaveBeenCalled()
  })
})

describe('chess helpers', () => {
  it('returns the correct turn color from FEN', () => {
    expect(getTurnColor('8/8/8/8/8/8/8/K6k w - - 0 1')).toBe('white')
    expect(getTurnColor('8/8/8/8/8/8/8/K6k b - - 0 1')).toBe('black')
  })

  it('computes legal destinations for starting position', () => {
    const dests = getLegalDests('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
    // Pawn moves from the initial position should include forward one and two squares.
    expect(dests.get('e2')).toEqual(expect.arrayContaining(['e3', 'e4']))
  })
})
