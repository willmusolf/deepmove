import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGameReview, buildTreeFromPgn, getPathToNode } from './useGameReview'
import { useGameStore } from '../stores/gameStore'

// Simple 4-half-move PGN: m0=e4(white), m1=e5(black), m2=Nf3(white), m3=Nc6(black)
const TEST_PGN = '1. e4 e5 2. Nf3 Nc6'

// FEN after d4 from start — alternative first move
const AFTER_D4 = 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 1'
// FEN after e4,d5 (instead of e5)
const AFTER_D5 = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2'

function setPgn(pgn: string | null) {
  useGameStore.setState({ pgn })
}

beforeEach(() => { act(() => { setPgn(TEST_PGN) }) })
afterEach(() => { act(() => { setPgn(null) }) })

// Helper: advance forward N times sequentially
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function goForwardN(result: any, n: number) {
  for (let i = 0; i < n; i++) {
    act(() => result.current.goForward())
  }
}

describe('useGameReview — navigation', () => {
  it('starts at empty path (starting position)', () => {
    const { result } = renderHook(() => useGameReview())
    expect(result.current.currentPath).toEqual([])
  })

  it('goForward from [] moves to m0', () => {
    const { result } = renderHook(() => useGameReview())
    act(() => result.current.goForward())
    expect(result.current.currentPath).toEqual(['m0'])
  })

  it('goForward steps through main line', () => {
    const { result } = renderHook(() => useGameReview())
    goForwardN(result, 2)
    expect(result.current.currentPath).toEqual(['m0', 'm1'])
  })

  it('goForward at end of game does nothing', () => {
    const { result } = renderHook(() => useGameReview())
    goForwardN(result, 10) // more than 4 moves
    expect(result.current.currentPath).toHaveLength(4)
  })

  it('goBack from single-element path returns to []', () => {
    const { result } = renderHook(() => useGameReview())
    act(() => result.current.goForward())
    act(() => result.current.goBack())
    expect(result.current.currentPath).toEqual([])
  })

  it('goBack from [] does not crash and stays at []', () => {
    const { result } = renderHook(() => useGameReview())
    act(() => result.current.goBack())
    expect(result.current.currentPath).toEqual([])
  })

  it('goToMove(0) returns to starting position', () => {
    const { result } = renderHook(() => useGameReview())
    goForwardN(result, 2)
    act(() => result.current.goToMove(0))
    expect(result.current.currentPath).toEqual([])
  })

  it('goToMove(2) sets path of length 2', () => {
    const { result } = renderHook(() => useGameReview())
    act(() => result.current.goToMove(2))
    expect(result.current.currentPath).toEqual(['m0', 'm1'])
  })

  it('goToMove(4) reaches end of 4-move game', () => {
    const { result } = renderHook(() => useGameReview())
    act(() => result.current.goToMove(4))
    expect(result.current.currentPath).toHaveLength(4)
  })
})

describe('useGameReview — branching', () => {
  it('addVariationMove from [] creates root-b0', () => {
    const { result } = renderHook(() => useGameReview())
    act(() => result.current.addVariationMove('d2', 'd4', 'd4', AFTER_D4))
    expect(result.current.currentPath).toEqual(['root-b0'])
    expect(result.current.moveTree['root-b0']?.parentId).toBeNull()
  })

  it('addVariationMove from [m0] creates m0-b0', () => {
    const { result } = renderHook(() => useGameReview())
    act(() => result.current.goForward()) // path = ['m0']
    act(() => result.current.addVariationMove('e7', 'd5', 'd5', AFTER_D5))
    expect(result.current.currentPath).toEqual(['m0', 'm0-b0'])
    expect(result.current.moveTree['m0-b0']?.parentId).toBe('m0')
  })

  it('go back 1 from [m0,m1] then branch creates variation off m0', () => {
    const { result } = renderHook(() => useGameReview())
    goForwardN(result, 2) // ['m0','m1']
    act(() => result.current.goBack()) // ['m0']
    expect(result.current.currentPath).toEqual(['m0']) // verify we're at m0
    act(() => result.current.addVariationMove('e7', 'd5', 'd5', AFTER_D5))
    expect(result.current.currentPath).toEqual(['m0', 'm0-b0'])
    expect(result.current.moveTree['m0-b0']?.parentId).toBe('m0')
  })

  it('re-uses existing branch node instead of creating duplicate', () => {
    const { result } = renderHook(() => useGameReview())
    act(() => result.current.goForward()) // ['m0']
    act(() => result.current.addVariationMove('e7', 'd5', 'd5', AFTER_D5))
    act(() => result.current.goBack())    // ['m0']
    act(() => result.current.addVariationMove('e7', 'd5', 'd5', AFTER_D5))
    expect(result.current.currentPath).toEqual(['m0', 'm0-b0'])
    expect(Object.keys(result.current.moveTree).filter(k => k.startsWith('m0-b'))).toHaveLength(1)
  })

  it('two different branches off same parent get distinct ids', () => {
    const { result } = renderHook(() => useGameReview())
    act(() => result.current.goForward()) // ['m0']
    act(() => result.current.addVariationMove('e7', 'd5', 'd5', AFTER_D5))
    act(() => result.current.goBack())    // ['m0']
    // c5 is a different square from d5 and also not the main line e5
    const AFTER_C5 = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2'
    act(() => result.current.addVariationMove('c7', 'c5', 'c5', AFTER_C5))
    const branchIds = Object.keys(result.current.moveTree).filter(k => k.startsWith('m0-b'))
    expect(branchIds).toHaveLength(2)
    expect(branchIds).toContain('m0-b0')
    expect(branchIds).toContain('m0-b1')
  })
})

describe('useGameReview — game switch', () => {
  it('switching pgn resets currentPath to []', () => {
    const { result } = renderHook(() => useGameReview())
    goForwardN(result, 2)
    act(() => { setPgn('1. d4 d5') })
    expect(result.current.currentPath).toEqual([])
  })

  it('branch nodes from old game do not persist after game switch', () => {
    const { result } = renderHook(() => useGameReview())
    act(() => result.current.addVariationMove('d2', 'd4', 'd4', AFTER_D4))
    act(() => { setPgn('1. d4 d5') })
    expect(result.current.currentPath).toEqual([])
    expect(result.current.moveTree['root-b0']).toBeUndefined()
  })
})


// ─── Pure function tests ─────────────────────────────────────────────────────

describe('buildTreeFromPgn', () => {
  it('returns parseError for invalid PGN', () => {
    const result = buildTreeFromPgn('not a pgn !!!')
    expect(result.parseError).toBe('Invalid PGN.')
    expect(result.rootId).toBeNull()
  })

  it('returns empty tree with no error for header-only PGN (0 moves)', () => {
    // chess.js accepts a PGN with only headers and no moves
    const result = buildTreeFromPgn('[White "Alice"][Black "Bob"] *')
    expect(result.parseError).toBeNull()
    expect(result.rootId).toBeNull()
    expect(Object.keys(result.tree)).toHaveLength(0)
  })

  it('builds single-node tree for 1-move PGN', () => {
    const result = buildTreeFromPgn('1. e4')
    expect(result.parseError).toBeNull()
    expect(result.rootId).toBe('m0')
    expect(Object.keys(result.tree)).toHaveLength(1)
    expect(result.tree['m0'].san).toBe('e4')
    expect(result.tree['m0'].parentId).toBeNull()
    expect(result.tree['m0'].childIds).toHaveLength(0)
  })

  it('links nodes correctly in a 4-move game', () => {
    const result = buildTreeFromPgn('1. e4 e5 2. Nf3 Nc6')
    expect(result.rootId).toBe('m0')
    expect(result.tree['m0'].childIds).toContain('m1')
    expect(result.tree['m1'].parentId).toBe('m0')
    expect(result.tree['m2'].parentId).toBe('m1')
    expect(result.tree['m3'].parentId).toBe('m2')
    expect(result.tree['m3'].childIds).toHaveLength(0)
  })

  it('assigns correct color to each node', () => {
    const result = buildTreeFromPgn('1. e4 e5')
    expect(result.tree['m0'].color).toBe('white')
    expect(result.tree['m1'].color).toBe('black')
  })

  it('marks all main-line nodes as isMainLine=true', () => {
    const result = buildTreeFromPgn('1. e4 e5 2. Nf3')
    for (const node of Object.values(result.tree)) {
      expect(node.isMainLine).toBe(true)
    }
  })

  it('parses headers', () => {
    const result = buildTreeFromPgn('[White "Alice"][Black "Bob"] 1. e4 *')
    expect(result.headers['White']).toBe('Alice')
    expect(result.headers['Black']).toBe('Bob')
  })
})

describe('getPathToNode', () => {
  it('returns single-element path for root node', () => {
    const { tree } = buildTreeFromPgn('1. e4 e5 2. Nf3 Nc6')
    expect(getPathToNode('m0', tree)).toEqual(['m0'])
  })

  it('returns full path from root to given node', () => {
    const { tree } = buildTreeFromPgn('1. e4 e5 2. Nf3 Nc6')
    expect(getPathToNode('m2', tree)).toEqual(['m0', 'm1', 'm2'])
  })

  it('returns full path to last node', () => {
    const { tree } = buildTreeFromPgn('1. e4 e5 2. Nf3 Nc6')
    expect(getPathToNode('m3', tree)).toEqual(['m0', 'm1', 'm2', 'm3'])
  })
})
