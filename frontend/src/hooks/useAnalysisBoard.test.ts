import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { act } from 'react'
import { useAnalysisBoard } from './useAnalysisBoard'

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
const AFTER_E4_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'
const AFTER_D4 = 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 1'

describe('useAnalysisBoard', () => {
  it('sets lastAddedNodeIdRef synchronously when re-entering the root move', () => {
    const { result } = renderHook(() => useAnalysisBoard())

    act(() => result.current.addMove('e2', 'e4', 'e4', AFTER_E4))
    act(() => result.current.goBack())

    act(() => {
      result.current.addMove('e2', 'e4', 'e4', AFTER_E4)
      expect(result.current.lastAddedNodeIdRef.current).toBe('n0')
    })

    expect(result.current.currentPath).toEqual(['n0'])
  })

  it('sets lastAddedNodeIdRef synchronously when re-entering an existing child move', () => {
    const { result } = renderHook(() => useAnalysisBoard())

    act(() => result.current.addMove('e2', 'e4', 'e4', AFTER_E4))
    act(() => result.current.addMove('e7', 'e5', 'e5', AFTER_E4_E5))
    act(() => result.current.goBack())

    act(() => {
      result.current.addMove('e7', 'e5', 'e5', AFTER_E4_E5)
      expect(result.current.lastAddedNodeIdRef.current).toBe('n1')
    })

    expect(result.current.currentPath).toEqual(['n0', 'n1'])
  })

  it('sets lastAddedNodeIdRef synchronously when re-entering an existing root branch', () => {
    const { result } = renderHook(() => useAnalysisBoard())

    act(() => result.current.addMove('e2', 'e4', 'e4', AFTER_E4))
    act(() => result.current.goBack())
    act(() => result.current.addMove('d2', 'd4', 'd4', AFTER_D4))
    act(() => result.current.goBack())

    act(() => {
      result.current.addMove('d2', 'd4', 'd4', AFTER_D4)
      expect(result.current.lastAddedNodeIdRef.current).toBe('n1')
    })

    expect(result.current.currentPath).toEqual(['n1'])
  })
})
