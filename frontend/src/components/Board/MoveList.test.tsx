import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MoveList from './MoveList'
import type { MoveTree } from '../../chess/types'

const tree: MoveTree = {
  m0: {
    id: 'm0',
    san: 'e4',
    from: 'e2',
    to: 'e4',
    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    childIds: [],
    parentId: null,
    moveNumber: 1,
    color: 'white',
    isMainLine: true,
  },
}

function renderMoveList(currentPath: string[]) {
  return render(
    <MoveList
      tree={tree}
      rootId="m0"
      currentPath={currentPath}
      moveGrades={[]}
      onNodeClick={() => {}}
    />
  )
}

describe('MoveList auto-follow', () => {
  const originalMatchMedia = window.matchMedia

  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it('skips auto-follow on phone widths so the page stays anchored on the board', () => {
    ;(window.matchMedia as unknown as ReturnType<typeof vi.fn>).mockImplementation((query: string) => ({
      matches: query === '(max-width: 639px)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))

    const { rerender, container } = renderMoveList([])
    const moveList = container.querySelector('.move-list') as HTMLDivElement
    moveList.scrollTo = vi.fn()

    rerender(
      <MoveList
        tree={tree}
        rootId="m0"
        currentPath={['m0']}
        moveGrades={[]}
        onNodeClick={() => {}}
      />
    )

    expect(moveList.scrollTo).not.toHaveBeenCalled()
  })

  it('keeps auto-follow on tablet and desktop widths within the move-list container', () => {
    const { rerender, container } = renderMoveList([])
    const moveList = container.querySelector('.move-list') as HTMLDivElement
    const activeMove = screen.getByText('e4')
    const scrollTo = vi.fn()

    moveList.scrollTo = scrollTo
    Object.defineProperty(moveList, 'scrollHeight', { configurable: true, value: 500 })
    Object.defineProperty(moveList, 'clientHeight', { configurable: true, value: 120 })
    Object.defineProperty(moveList, 'scrollTop', { configurable: true, value: 10, writable: true })
    moveList.getBoundingClientRect = () => ({
      x: 0,
      y: 100,
      top: 100,
      bottom: 220,
      left: 0,
      right: 200,
      width: 200,
      height: 120,
      toJSON: () => ({}),
    })
    activeMove.getBoundingClientRect = () => ({
      x: 0,
      y: 190,
      top: 190,
      bottom: 230,
      left: 0,
      right: 80,
      width: 80,
      height: 40,
      toJSON: () => ({}),
    })

    rerender(
      <MoveList
        tree={tree}
        rootId="m0"
        currentPath={['m0']}
        moveGrades={[]}
        onNodeClick={() => {}}
      />
    )

    expect(scrollTo).toHaveBeenCalledWith({ top: 32, behavior: 'smooth' })
  })
})
