import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { MoveEval } from '../../engine/analysis'
import EvalGraph from './EvalGraph'

function makeEval(
  moveNumber: number,
  color: 'white' | 'black',
  score: number,
  san: string,
): MoveEval {
  return {
    moveNumber,
    color,
    san,
    fen: 'stub-fen',
    eval: {
      score,
      depth: 18,
      fen: 'stub-fen',
      isMate: false,
      mateIn: null,
      bestMove: '',
      pv: [],
    },
    grade: null,
  }
}

function mockRect(width: number): DOMRect {
  return {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: width,
    bottom: 120,
    width,
    height: 120,
    toJSON: () => ({}),
  } as DOMRect
}

describe('EvalGraph touch interaction', () => {
  const moveEvals: MoveEval[] = [
    makeEval(1, 'white', 30, 'e4'),
    makeEval(1, 'black', 10, 'e5'),
    makeEval(2, 'white', 80, 'Nf3'),
    makeEval(2, 'black', 0, 'Nc6'),
  ]

  it('scrubs through moves on touch drag', () => {
    const onNavigate = vi.fn()
    const { container } = render(
      <EvalGraph
        moveEvals={moveEvals}
        totalMoves={4}
        currentMoveIndex={0}
        onNavigate={onNavigate}
      />
    )

    const svg = container.querySelector('.eval-graph-svg') as SVGSVGElement
    svg.getBoundingClientRect = () => mockRect(600)

    fireEvent.touchStart(svg, {
      touches: [{ clientX: 8, clientY: 40 }],
    })
    fireEvent.touchMove(svg, {
      touches: [{ clientX: 302, clientY: 40 }],
    })

    expect(onNavigate).toHaveBeenNthCalledWith(1, 0)
    expect(onNavigate).toHaveBeenLastCalledWith(2)
  })

  it('suppresses the synthetic click after a touch scrub', () => {
    const onNavigate = vi.fn()
    const { container } = render(
      <EvalGraph
        moveEvals={moveEvals}
        totalMoves={4}
        currentMoveIndex={0}
        onNavigate={onNavigate}
      />
    )

    const svg = container.querySelector('.eval-graph-svg') as SVGSVGElement
    svg.getBoundingClientRect = () => mockRect(600)

    fireEvent.touchStart(svg, {
      touches: [{ clientX: 160, clientY: 40 }],
    })
    fireEvent.touchEnd(svg)
    fireEvent.click(svg, { clientX: 160, clientY: 40 })

    expect(onNavigate).toHaveBeenCalledTimes(1)
    expect(onNavigate).toHaveBeenCalledWith(1)
  })
})
