// useAnalysisBoard.ts — Branching move-tree for the free-play analysis board
import { useState, useMemo, useCallback } from 'react'
import { STARTING_FEN } from '../chess/constants'
import type { MoveNode, MoveTree } from '../chess/types'

interface AnalysisBoardState {
  tree: MoveTree
  rootId: string | null
  // IDs of alternative first moves (parentId=null, not the rootId)
  rootBranchIds: string[]
  currentPath: string[]
  branchCounter: number
  startFen: string
}

const EMPTY_STATE: AnalysisBoardState = {
  tree: {},
  rootId: null,
  rootBranchIds: [],
  currentPath: [],
  branchCounter: 0,
  startFen: STARTING_FEN,
}

const colorFromFen = (fen: string): 'white' | 'black' =>
  fen.split(' ')[1] === 'w' ? 'white' : 'black'

export function useAnalysisBoard() {
  const [state, setState] = useState<AnalysisBoardState>(EMPTY_STATE)

  // ── Derived values ────────────────────────────────────────────────────────

  const currentFen: string = state.currentPath.length === 0
    ? state.startFen
    : state.tree[state.currentPath[state.currentPath.length - 1]]?.fen ?? state.startFen

  // Main-line SAN list (walk childIds[0] chain) — used for opening detection
  const mainLineSans = useMemo<string[]>(() => {
    const result: string[] = []
    let id: string | null = state.rootId
    while (id) {
      result.push(state.tree[id].san)
      id = state.tree[id].childIds[0] ?? null
    }
    return result
  }, [state.tree, state.rootId])

  // ── Mutations ─────────────────────────────────────────────────────────────

  const addMove = useCallback((from: string, to: string, san: string, newFen: string) => {
    setState(prev => {
      const parentId = prev.currentPath.length > 0
        ? prev.currentPath[prev.currentPath.length - 1]
        : null

      // Sit B: re-enter an existing child (same from/to/san)
      if (parentId !== null) {
        const existingId = prev.tree[parentId]?.childIds.find(cid => {
          const n = prev.tree[cid]
          return n && n.from === from && n.to === to && n.san === san
        })
        if (existingId) {
          return { ...prev, currentPath: [...prev.currentPath, existingId] }
        }
      } else {
        // Root-level re-entry: check if rootId's move matches
        if (prev.rootId) {
          const root = prev.tree[prev.rootId]
          if (root && root.from === from && root.to === to && root.san === san) {
            return { ...prev, currentPath: [prev.rootId] }
          }
        }
        // Also check existing root branches
        const existingRootBranch = prev.rootBranchIds.find(bid => {
          const n = prev.tree[bid]
          return n && n.from === from && n.to === to && n.san === san
        })
        if (existingRootBranch) {
          return { ...prev, currentPath: [existingRootBranch] }
        }
      }

      // Derive color and moveNumber from parent's FEN
      const parentNode = parentId ? prev.tree[parentId] : null
      const parentFen = parentNode ? parentNode.fen : prev.startFen
      const color = colorFromFen(parentFen)
      const moveNumber: number = parentNode
        ? (color === 'white' ? parentNode.moveNumber + 1 : parentNode.moveNumber)
        : 1

      // Sit A: first move ever → becomes the main line root
      const isFirstMove = prev.rootId === null && parentId === null

      // Sit C: branching — parent already has children, or root already exists
      const parentHasChildren = parentId !== null
        ? (prev.tree[parentId]?.childIds.length ?? 0) > 0
        : prev.rootId !== null
      const isMainLine = !parentHasChildren

      const newId = `n${prev.branchCounter}`

      const newNode: MoveNode = {
        id: newId,
        san, from, to,
        fen: newFen,
        childIds: [],
        parentId,
        moveNumber,
        color,
        isMainLine,
      }

      const newTree = { ...prev.tree, [newId]: newNode }

      // Wire parent's childIds (only for non-root nodes)
      if (parentId !== null) {
        newTree[parentId] = {
          ...newTree[parentId],
          childIds: [...newTree[parentId].childIds, newId],
        }
      }

      // Track root-level alternative first moves separately
      const newRootBranchIds = (!isFirstMove && parentId === null)
        ? [...prev.rootBranchIds, newId]
        : prev.rootBranchIds

      return {
        tree: newTree,
        rootId: isFirstMove ? newId : prev.rootId,
        rootBranchIds: newRootBranchIds,
        currentPath: [...prev.currentPath, newId],
        branchCounter: prev.branchCounter + 1,
        startFen: prev.startFen,
      }
    })
  }, [])

  const goBack = useCallback(() => {
    setState(prev => {
      if (prev.currentPath.length === 0) return prev
      return { ...prev, currentPath: prev.currentPath.slice(0, -1) }
    })
  }, [])

  const goForward = useCallback(() => {
    setState(prev => {
      if (prev.rootId === null) return prev
      if (prev.currentPath.length === 0) {
        return { ...prev, currentPath: [prev.rootId] }
      }
      const lastId = prev.currentPath[prev.currentPath.length - 1]
      const firstChild = prev.tree[lastId]?.childIds[0]
      if (!firstChild) return prev
      return { ...prev, currentPath: [...prev.currentPath, firstChild] }
    })
  }, [])

  const navigateTo = useCallback((path: string[]) => {
    setState(prev => ({ ...prev, currentPath: path }))
  }, [])

  const resetBoard = useCallback((startFen?: string) => {
    setState({ ...EMPTY_STATE, startFen: startFen ?? STARTING_FEN })
  }, [])

  return {
    tree: state.tree,
    rootId: state.rootId,
    currentPath: state.currentPath,
    rootBranchIds: state.rootBranchIds,
    currentFen,
    mainLineSans,
    addMove,
    goBack,
    goForward,
    navigateTo,
    resetBoard,
  }
}
