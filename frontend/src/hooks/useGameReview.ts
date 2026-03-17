// useGameReview.ts — Tree-based game navigation with branch/variation support
import { useState, useMemo, useCallback } from 'react'
import { Chess } from 'chess.js'
import { useGameStore } from '../stores/gameStore'
import { cleanPgn } from '../chess/pgn'
import type { MoveNode, MoveTree } from '../chess/types'
import type { MoveEval } from '../engine/analysis'

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

interface ParsedGame {
  tree: MoveTree
  rootId: string | null
  parseError: string | null
  headers: Record<string, string>
}

function buildTreeFromPgn(pgn: string): ParsedGame {
  const chess = new Chess()
  try {
    chess.loadPgn(cleanPgn(pgn))
  } catch {
    return { tree: {}, rootId: null, parseError: 'Invalid PGN.', headers: {} }
  }

  const history = chess.history({ verbose: true })
  const headers = chess.header() as Record<string, string>

  if (history.length === 0) {
    return { tree: {}, rootId: null, parseError: null, headers }
  }

  const tree: MoveTree = {}
  let prevId: string | null = null

  history.forEach((m, i) => {
    const id = `m${i}`
    const color: 'white' | 'black' = i % 2 === 0 ? 'white' : 'black'
    const moveNumber = Math.floor(i / 2) + 1
    const node: MoveNode = {
      id,
      san: m.san,
      from: m.from,
      to: m.to,
      fen: m.after,
      childIds: [],
      parentId: prevId,
      moveNumber,
      color,
      isMainLine: true,
    }
    tree[id] = node
    if (prevId) tree[prevId].childIds.push(id)
    prevId = id
  })

  return { tree, rootId: 'm0', parseError: null, headers }
}

/** Follow parentId chain to reconstruct full path to a node */
export function getPathToNode(id: string, tree: MoveTree): string[] {
  const path: string[] = []
  let current: string | null = id
  while (current !== null) {
    path.unshift(current)
    current = tree[current]?.parentId ?? null
  }
  return path
}

// ─── Branch state (auto-resets per game via pgnKey) ─────────────────────────
interface BranchState {
  pgnKey: string | null
  nodes: MoveTree                          // user-created branch nodes
  extraChildren: Record<string, string[]>  // parentId → extra child ids beyond base tree
  currentPath: string[]
}

const EMPTY_BRANCH: BranchState = {
  pgnKey: null, nodes: {}, extraChildren: {}, currentPath: [],
}

export function useGameReview() {
  const pgn = useGameStore(s => s.pgn)

  // Base tree rebuilt synchronously whenever pgn changes
  const baseData = useMemo<ParsedGame>(() => {
    if (!pgn) return { tree: {}, rootId: null, parseError: null, headers: {} }
    return buildTreeFromPgn(pgn)
  }, [pgn])

  // All branch/navigation state in one object keyed by pgnKey
  const [branchState, setBranchState] = useState<BranchState>(EMPTY_BRANCH)

  // Synchronous reset when game changes — React re-renders immediately without flash
  let activeBranch = branchState
  if (branchState.pgnKey !== pgn) {
    const fresh: BranchState = { pgnKey: pgn, nodes: {}, extraChildren: {}, currentPath: [] }
    setBranchState(fresh)
    activeBranch = fresh
  }

  // Merge base + branch nodes, applying extra children to each parent
  const tree = useMemo<MoveTree>(() => {
    const result: MoveTree = {}
    for (const [id, node] of Object.entries(baseData.tree)) {
      const extra = activeBranch.extraChildren[id]
      result[id] = extra ? { ...node, childIds: [...node.childIds, ...extra] } : node
    }
    for (const [id, node] of Object.entries(activeBranch.nodes)) {
      const extra = activeBranch.extraChildren[id]
      result[id] = extra ? { ...node, childIds: [...node.childIds, ...extra] } : node
    }
    return result
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseData.tree, activeBranch.nodes, activeBranch.extraChildren])

  const { currentPath } = activeBranch
  const rootId = baseData.rootId

  // ── Derived values ──────────────────────────────────────────────────────────

  const currentFen: string = currentPath.length === 0
    ? STARTING_FEN
    : tree[currentPath[currentPath.length - 1]]?.fen ?? STARTING_FEN

  // Count consecutive main-line moves in path (for EvalGraph index)
  const currentMoveIndex = useMemo(() => {
    let count = 0
    for (const id of currentPath) {
      if (tree[id]?.isMainLine) count++
      else break
    }
    return count
  }, [currentPath, tree])

  const totalMoves = useMemo(() => {
    let count = 0
    let id: string | null = rootId
    while (id) { count++; id = tree[id]?.childIds[0] ?? null }
    return count
  }, [tree, rootId])

  // Flat SAN list of main line (for EvalGraph / backward compat)
  const moves = useMemo(() => {
    const result: string[] = []
    let id: string | null = rootId
    while (id) { result.push(tree[id].san); id = tree[id].childIds[0] ?? null }
    return result
  }, [tree, rootId])

  // The main-line's next node from current position (null if off main line or at end).
  // Uses the merged tree so branch nodes are handled correctly.
  const nextMainLineNode = useMemo((): MoveNode | null => {
    if (currentPath.length === 0) return tree[rootId ?? ''] ?? null
    const lastId = currentPath[currentPath.length - 1]
    const node = tree[lastId]
    if (!node) return null
    // Return the first child that belongs to the main line
    const mainLineChildId = node.childIds.find(id => tree[id]?.isMainLine)
    return mainLineChildId ? tree[mainLineChildId] ?? null : null
  }, [currentPath, tree, rootId])

  // ── Navigation ──────────────────────────────────────────────────────────────

  const setPath = useCallback((path: string[]) => {
    setBranchState(prev => ({ ...prev, currentPath: path }))
  }, [])

  const navigateTo = useCallback((path: string[]) => setPath(path), [setPath])

  const goForward = useCallback(() => {
    if (currentPath.length === 0) {
      if (rootId) setPath([rootId])
    } else {
      const firstChild = tree[currentPath[currentPath.length - 1]]?.childIds[0]
      if (firstChild) setPath([...currentPath, firstChild])
    }
  }, [currentPath, tree, rootId, setPath])

  const goBack = useCallback(() => {
    setBranchState(prev => {
      if (prev.currentPath.length === 0) return prev
      const newPath = prev.currentPath.slice(0, -1)
      return { ...prev, currentPath: newPath }
    })
  }, [])

  // Main-line-only navigation by index (EvalGraph clicks)
  const goToMove = useCallback((index: number) => {
    if (index === 0) { setPath([]); return }
    const path: string[] = []
    let id: string | null = rootId
    let count = 0
    while (id && count < index) {
      path.push(id)
      count++
      if (count < index) id = tree[id]?.childIds[0] ?? null
    }
    setPath(path)
  }, [tree, rootId, setPath])

  // ── Branch creation ─────────────────────────────────────────────────────────

  const addVariationMove = useCallback((
    from: string,
    to: string,
    san: string,
    newFen: string,
  ): string => {
    const parentId = currentPath.length > 0 ? currentPath[currentPath.length - 1] : null

    // Ensure parent exists in tree before proceeding
    if (parentId && !tree[parentId]) {
      return ''
    }

    // Re-use if this exact move already exists as a child here.
    // For root branches (parentId=null), search nodes with parentId===null.
    const existing = parentId
      ? tree[parentId]?.childIds.find(cid => tree[cid] && tree[cid]?.from === from && tree[cid]?.to === to)
      : Object.values(tree).find(n => n.parentId === null && n.from === from && n.to === to)?.id
    if (existing) {
      setBranchState(prev => ({ ...prev, currentPath: [...prev.currentPath, existing] }))
      return existing
    }

    // Derive color and move number from parent node's FEN.
    const colorFromFen = (fen: string): 'white' | 'black' =>
      fen.split(' ')[1] === 'w' ? 'white' : 'black'
    const parentNode = parentId ? tree[parentId] : null
    const color: 'white' | 'black' = parentNode ? colorFromFen(parentNode.fen) : 'white'
    const moveNumber: number = parentNode
      ? (color === 'white' ? parentNode.moveNumber + 1 : parentNode.moveNumber)
      : 1

    // Compute siblingCount: count only the BRANCH nodes (isMainLine=false) that are already children
    // Filter out main-line children which don't affect branch ID numbering
    const siblingCount = parentId
      ? (tree[parentId]?.childIds.filter(cid => !tree[cid]?.isMainLine).length ?? 0)
      : Object.values(tree).filter(n => n.parentId === null && !n.isMainLine).length
    const newId = parentId ? `${parentId}-b${siblingCount}` : `root-b${siblingCount}`


    const newNode: MoveNode = {
      id: newId, san, from, to, fen: newFen,
      childIds: [], parentId, moveNumber, color, isMainLine: false,
    }

    // Use '__root__' sentinel key for branches off the starting position so
    // the tree stays navigable and MoveList can render them.
    const extraKey = parentId ?? '__root__'

    setBranchState(prev => {
      return {
        ...prev,
        nodes: { ...prev.nodes, [newId]: newNode },
        extraChildren: {
          ...prev.extraChildren,
          [extraKey]: [...(prev.extraChildren[extraKey] ?? []), newId],
        },
        currentPath: [...prev.currentPath, newId],
      }
    })

    return newId
  }, [currentPath, tree])

  // ── Sync grade from full-game analysis back onto main-line tree nodes ───────
  // Called from App after moveEvals arrive; grades are stored on the MoveNode
  // so MoveList can read them directly from the tree.
  const syncGrades = useCallback((_evals: MoveEval[]) => {
    setBranchState(prev => {
      if (prev.pgnKey !== pgn) return prev
      // We don't mutate the base tree; grades are passed as a separate prop to MoveList
      return prev
    })
  }, [pgn])

  const isLoaded =
    pgn !== null && baseData.parseError === null && Object.keys(baseData.tree).length > 0

  return {
    moveTree: tree,
    currentPath,
    currentFen,
    currentMoveIndex,
    goToMove,
    goForward,
    goBack,
    navigateTo,
    addVariationMove,
    nextMainLineNode,
    isLoaded,
    parseError: baseData.parseError,
    whitePlayer: baseData.headers['White'] ?? null,
    blackPlayer: baseData.headers['Black'] ?? null,
    whiteElo: baseData.headers['WhiteElo'] ?? null,
    blackElo: baseData.headers['BlackElo'] ?? null,
    result: baseData.headers['Result'] ?? null,
    rootId,
    totalMoves,
    moves,
    syncGrades,
    rootBranchIds: activeBranch.extraChildren['__root__'] ?? [],
  }
}
