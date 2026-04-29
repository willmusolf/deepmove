import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ChessBoard, { getLegalDests, getTurnColor } from './ChessBoard'

const redrawAll = vi.fn()
const cancelMove = vi.fn()
const setApi = vi.fn()
const draggableCurrent = { started: false, orig: 'e2' }

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
    set: setApi,
    cancelMove,
    redrawAll,
    getKeyAtDomPos: vi.fn(() => 'e4'),
    state: {
      draggable: { current: draggableCurrent },
      dom: {
        bounds: () => ({ left: 0, top: 0, width: 320, height: 320 }),
      },
    },
    destroy: vi.fn(),
  })),
}))

describe('ChessBoard component', () => {
  it('defers drawable updates until drag ends when shapes change mid-drag', () => {
    const originalRaf = window.requestAnimationFrame
    window.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
      cb(0)
      return 1
    })
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 320,
      bottom: 320,
      width: 320,
      height: 320,
      toJSON: () => ({}),
    } as DOMRect)

    draggableCurrent.started = false
    setApi.mockClear()
    const { rerender } = render(<ChessBoard shapes={[]} />)
    setApi.mockClear()

    draggableCurrent.started = true
    const moveEvent = new Event('pointermove')
    Object.defineProperty(moveEvent, 'clientX', { configurable: true, value: 40 })
    Object.defineProperty(moveEvent, 'clientY', { configurable: true, value: 40 })

    act(() => {
      window.dispatchEvent(moveEvent)
    })

    rerender(<ChessBoard shapes={[{ orig: 'e2', dest: 'e4', brush: 'green' }]} />)

    expect(setApi).not.toHaveBeenCalled()

    const upEvent = new Event('pointerup')
    act(() => {
      window.dispatchEvent(upEvent)
    })

    expect(setApi).toHaveBeenCalledWith({
      drawable: { autoShapes: [{ orig: 'e2', dest: 'e4', brush: 'green' }] },
    })

    draggableCurrent.started = false
    rectSpy.mockRestore()
    window.requestAnimationFrame = originalRaf
  })

  it('defers board redraw until drag ends when resize fires mid-drag', () => {
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

    draggableCurrent.started = false
    redrawAll.mockClear()
    render(<ChessBoard />)
    redrawAll.mockClear()

    draggableCurrent.started = true
    const moveEvent = new Event('pointermove')
    Object.defineProperty(moveEvent, 'clientX', { configurable: true, value: 40 })
    Object.defineProperty(moveEvent, 'clientY', { configurable: true, value: 40 })

    act(() => {
      window.dispatchEvent(moveEvent)
    })

    act(() => {
      resizeCallback?.([{ contentRect: { width: 321, height: 320 } } as ResizeObserverEntry], {} as ResizeObserver)
    })

    expect(redrawAll).not.toHaveBeenCalled()

    const upEvent = new Event('pointerup')
    act(() => {
      window.dispatchEvent(upEvent)
    })

    expect(redrawAll).toHaveBeenCalledTimes(1)
    draggableCurrent.started = false
    window.requestAnimationFrame = originalRaf
  })

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
