// useGameReview.ts — Tree-based game navigation with branch/variation support
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { Chess } from 'chess.js'
import { useGameStore } from '../stores/gameStore'
import { cleanPgn, extractClockTimes } from '../chess/pgn'
import { STARTING_FEN } from '../chess/constants'
import type { MoveNode, MoveTree } from '../chess/types'
import { readSessionJson, removeSessionValue, writeSessionJson } from '../utils/sessionStorage'
import { getAnalyzedGame, updateBranchState, type SerializedBranchState } from '../services/gameDB'


interface ParsedGame {
  tree: MoveTree
  rootId: string | null
  parseError: string | null
  headers: Record<string, string>
}

export function buildTreeFromPgn(pgn: string, rawPgn?: string): ParsedGame {
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

  const clockTimes = rawPgn ? extractClockTimes(rawPgn) : []

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
      clockTime: clockTimes[i],
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
  branchCounter: number
}

const EMPTY_BRANCH: BranchState = {
  pgnKey: null, nodes: {}, extraChildren: {}, currentPath: [], branchCounter: 0,
}

const REVIEW_BRANCH_SESSION_KEY = 'deepmove_reviewBranchState'

function sanitizeBranchNodes(value: unknown): MoveTree {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  return Object.fromEntries(
    Object.entries(value).flatMap(([id, rawNode]) => {
      if (!rawNode || typeof rawNode !== 'object' || Array.isArray(rawNode)) return []
      const node = rawNode as Partial<MoveNode>
      if (typeof node.san !== 'string') return []
      if (typeof node.from !== 'string' || typeof node.to !== 'string' || typeof node.fen !== 'string') return []
      if (!Array.isArray(node.childIds) || !node.childIds.every(childId => typeof childId === 'string')) return []
      if (node.parentId !== null && typeof node.parentId !== 'string') return []
      if (typeof node.moveNumber !== 'number') return []
      if (node.color !== 'white' && node.color !== 'black') return []
      if (typeof node.isMainLine !== 'boolean') return []

      return [[id, {
        id,
        san: node.san,
        from: node.from,
        to: node.to,
        fen: node.fen,
        childIds: node.childIds,
        parentId: node.parentId ?? null,
        moveNumber: node.moveNumber,
        color: node.color,
        isMainLine: node.isMainLine,
        ...(typeof node.grade === 'string' ? { grade: node.grade } : {}),
        ...(typeof node.clockTime === 'string' ? { clockTime: node.clockTime } : {}),
      } satisfies MoveNode]]
    }),
  )
}

function sanitizeExtraChildren(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  return Object.fromEntries(
    Object.entries(value).flatMap(([parentId, childIds]) => {
      if (!Array.isArray(childIds) || !childIds.every(childId => typeof childId === 'string')) return []
      return [[parentId, childIds]]
    }),
  )
}

function sanitizeCurrentPath(path: unknown, tree: MoveTree): string[] {
  if (!Array.isArray(path)) return []

  const safe: string[] = []
  for (const rawId of path) {
    if (typeof rawId !== 'string') break
    const node = tree[rawId]
    if (!node) break
    const expectedParent = safe[safe.length - 1] ?? null
    if (node.parentId !== expectedParent) break
    safe.push(rawId)
  }
  return safe
}

function sanitizeStoredPath(path: unknown): string[] {
  return Array.isArray(path) ? path.filter(id => typeof id === 'string') : []
}

function loadBranchState(pgn: string | null): BranchState {
  if (!pgn) return EMPTY_BRANCH

  const parsed = readSessionJson<Partial<BranchState>>(REVIEW_BRANCH_SESSION_KEY)
  if (!parsed || parsed.pgnKey !== pgn) {
    return { ...EMPTY_BRANCH, pgnKey: pgn }
  }

  const nodes = sanitizeBranchNodes(parsed.nodes)
  return {
    pgnKey: pgn,
    nodes,
    extraChildren: sanitizeExtraChildren(parsed.extraChildren),
    currentPath: sanitizeStoredPath(parsed.currentPath),
    branchCounter: typeof parsed.branchCounter === 'number' ? parsed.branchCounter : 0,
  }
}

function persistBranchState(state: BranchState) {
  if (!state.pgnKey) {
    removeSessionValue(REVIEW_BRANCH_SESSION_KEY)
    return
  }

  writeSessionJson(REVIEW_BRANCH_SESSION_KEY, state)
}

function serializeBranch(state: BranchState): SerializedBranchState | null {
  if (!state.pgnKey) return null
  return {
    pgnKey: state.pgnKey,
    nodes: state.nodes,
    extraChildren: state.extraChildren,
    currentPath: state.currentPath,
    branchCounter: state.branchCounter,
  }
}

function hasAnyBranches(state: BranchState): boolean {
  return Object.keys(state.nodes).length > 0
    || Object.keys(state.extraChildren).length > 0
    || state.branchCounter > 0
}

export function useGameReview() {
  const pgn = useGameStore(s => s.pgn)
  const rawPgn = useGameStore(s => s.rawPgn)
  const currentGameId = useGameStore(s => s.currentGameId)

  // Base tree rebuilt synchronously whenever pgn changes
  const baseData = useMemo<ParsedGame>(() => {
    if (!pgn) return { tree: {}, rootId: null, parseError: null, headers: {} }
    return buildTreeFromPgn(pgn, rawPgn ?? undefined)
  }, [pgn, rawPgn])

  // All branch/navigation state in one object keyed by pgnKey
  const [branchState, setBranchState] = useState<BranchState>(() => loadBranchState(pgn))

  // Ref to the most recently added branch node ID (set synchronously in addVariationMove)
  const lastAddedNodeIdRef = useRef<string | null>(null)

  // Synchronous reset when game changes — React re-renders immediately without flash
  let activeBranch = branchState
  if (branchState.pgnKey !== pgn) {
    const restored = loadBranchState(pgn)
    setBranchState(restored)
    activeBranch = restored
    lastAddedNodeIdRef.current = null
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
  }, [baseData.tree, activeBranch.nodes, activeBranch.extraChildren])

  const rootId = baseData.rootId

  const currentPath = useMemo(() => {
    const merged: MoveTree = {}
    for (const [id, node] of Object.entries(baseData.tree)) merged[id] = node
    for (const [id, node] of Object.entries(activeBranch.nodes)) merged[id] = node
    return sanitizeCurrentPath(activeBranch.currentPath, merged)
  }, [activeBranch.currentPath, activeBranch.nodes, baseData.tree])

  useEffect(() => {
    if (activeBranch.currentPath.length === currentPath.length) return
    setBranchState(prev => ({ ...prev, currentPath }))
  }, [activeBranch.currentPath, currentPath])

  useEffect(() => {
    persistBranchState({ ...activeBranch, currentPath })
  }, [activeBranch, currentPath])

  // Hydrate variations from IndexedDB on game load.
  // Runs after the synchronous sessionStorage hydrate above. If the session
  // already has matching branches (same-tab refresh) we still merge, but the
  // IndexedDB copy wins as the authoritative store for cross-session restore.
  useEffect(() => {
    if (!pgn || !currentGameId) return
    let cancelled = false
    void (async () => {
      try {
        const record = await getAnalyzedGame(currentGameId)
        if (cancelled) return
        const stored = record?.branchState
        if (!stored || stored.pgnKey !== pgn) return
        // Only overwrite if the in-memory state for this pgn is empty —
        // otherwise we'd clobber a session that has fresher edits than the
        // last debounced write.
        setBranchState(prev => {
          if (prev.pgnKey !== pgn) return prev
          if (hasAnyBranches(prev)) return prev
          return {
            pgnKey: pgn,
            nodes: sanitizeBranchNodes(stored.nodes),
            extraChildren: sanitizeExtraChildren(stored.extraChildren),
            currentPath: sanitizeStoredPath(stored.currentPath),
            branchCounter: typeof stored.branchCounter === 'number' ? stored.branchCounter : 0,
          }
        })
      } catch {
        // IndexedDB unavailable — silent fallback to session-only persistence
      }
    })()
    return () => { cancelled = true }
  }, [pgn, currentGameId])

  // Debounced write to IndexedDB so explored branches survive across sessions.
  // sessionStorage above already handles same-tab refresh; this covers the
  // come-back-later case for games imported into the IndexedDB store.
  useEffect(() => {
    if (!pgn || !currentGameId) return
    if (activeBranch.pgnKey !== pgn) return
    const handle = setTimeout(() => {
      const payload = serializeBranch({ ...activeBranch, currentPath })
      if (!payload) return
      void updateBranchState(currentGameId, payload).catch(() => { /* silent */ })
    }, 500)
    return () => clearTimeout(handle)
  }, [activeBranch, currentPath, pgn, currentGameId])

  // Reset all user-explored variations for the current game.
  // Clears in-memory tree, sessionStorage, and the IndexedDB record's branchState.
  // Main-line grades/deltas are untouched (they live in separate sessionStorage keys).
  const resetBranches = useCallback(() => {
    setBranchState(prev => {
      if (!prev.pgnKey) return prev
      // Trim currentPath to the leading mainline prefix so the user doesn't get
      // teleported to the start — branch nodes always have "-b" in their id.
      const trimmedPath: string[] = []
      for (const id of prev.currentPath) {
        if (id.includes('-b')) break
        trimmedPath.push(id)
      }
      return {
        pgnKey: prev.pgnKey,
        nodes: {},
        extraChildren: {},
        currentPath: trimmedPath,
        branchCounter: 0,
      }
    })
    lastAddedNodeIdRef.current = null
    removeSessionValue(REVIEW_BRANCH_SESSION_KEY)
    if (currentGameId) {
      void updateBranchState(currentGameId, null).catch(() => { /* silent */ })
    }
  }, [currentGameId])

  // ── Derived values ──────────────────────────────────────────────────────────

  const currentFen: string = currentPath.length === 0
    ? STARTING_FEN
    : tree[currentPath[currentPath.length - 1]]?.fen ?? STARTING_FEN

  const treeRef = useRef(tree)
  const currentPathRef = useRef(currentPath)
  const rootIdRef = useRef(rootId)
  treeRef.current = tree
  currentPathRef.current = currentPath
  rootIdRef.current = rootId

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
    while (id) {
      count++
      const next = tree[id]?.childIds[0] ?? null
      id = next && tree[next]?.isMainLine ? next : null
    }
    return count
  }, [tree, rootId])

  // Denominator for the display counter: path depth + remaining forward chain from current node.
  // Unlike totalMoves (which only walks childIds[0] from root), this stays correct when the user
  // is on a non-first-child variation branch and continues adding moves.
  const displayTotalDepth = useMemo(() => {
    const lastId = currentPath[currentPath.length - 1]
    let depth = currentPath.length
    let id: string | null = lastId != null
      ? (tree[lastId]?.childIds[0] ?? null)
      : (rootId ?? null)
    while (id) { depth++; id = tree[id]?.childIds[0] ?? null }
    return depth
  }, [currentPath, tree, rootId])

  // Flat SAN list of main line (for EvalGraph / backward compat)
  const moves = useMemo(() => {
    const result: string[] = []
    let id: string | null = rootId
    while (id) {
      result.push(tree[id].san)
      const next = tree[id].childIds[0] ?? null
      id = next && tree[next]?.isMainLine ? next : null
    }
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
    const latestPath = currentPathRef.current
    const latestTree = treeRef.current
    const latestRootId = rootIdRef.current

    if (latestPath.length === 0) {
      if (latestRootId) setPath([latestRootId])
    } else {
      const firstChild = latestTree[latestPath[latestPath.length - 1]]?.childIds[0]
      if (firstChild) setPath([...latestPath, firstChild])
    }
  }, [setPath])

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
  ): void => {
    const parentId = currentPath.length > 0 ? currentPath[currentPath.length - 1] : null

    // Ensure parent exists in tree before proceeding
    if (parentId && !tree[parentId]) {
      return
    }

    // Re-use if this exact move already exists as a child here.
    // For root branches (parentId=null), search nodes with parentId===null.
    const existing = parentId
      ? tree[parentId]?.childIds.find(cid => tree[cid] && tree[cid]?.from === from && tree[cid]?.to === to && tree[cid]?.san === san)
      : Object.values(tree).find(n => n.parentId === null && n.from === from && n.to === to && n.san === san)?.id
    if (existing) {
      lastAddedNodeIdRef.current = existing
      setBranchState(prev => ({ ...prev, currentPath: [...prev.currentPath, existing] }))
      return
    }

    // Derive color and move number from parent node's FEN.
    const colorFromFen = (fen: string): 'white' | 'black' =>
      fen.split(' ')[1] === 'w' ? 'white' : 'black'
    const parentNode = parentId ? tree[parentId] : null
    const color: 'white' | 'black' = parentNode ? colorFromFen(parentNode.fen) : 'white'
    const moveNumber: number = parentNode
      ? (color === 'white' ? parentNode.moveNumber + 1 : parentNode.moveNumber)
      : 1

    // Use a monotonic counter from branchState to generate a unique ID.
    // This avoids stale-closure issues where siblingCount derived from `tree`
    // could produce duplicate IDs if two branches are added before a re-render.
    const extraKey = parentId ?? '__root__'
    // Compute newId ahead of setBranchState so we can expose it synchronously via ref.
    // We read branchState.branchCounter directly here (safe: addVariationMove only runs in event handlers).
    const nextId = parentId
      ? `${parentId}-b${branchState.branchCounter}`
      : `root-b${branchState.branchCounter}`
    lastAddedNodeIdRef.current = nextId
    setBranchState(prev => {
      const newId = parentId ? `${parentId}-b${prev.branchCounter}` : `root-b${prev.branchCounter}`
      // Override ref with the authoritative ID from prev.branchCounter — mirrors useAnalysisBoard.ts.
      // Guards against stale-closure mismatch where nextId (closure counter) !== newId (prev counter).
      lastAddedNodeIdRef.current = newId
      const newNode: MoveNode = {
        id: newId, san, from, to, fen: newFen,
        childIds: [], parentId, moveNumber, color, isMainLine: false,
      }
      return {
        ...prev,
        branchCounter: prev.branchCounter + 1,
        nodes: { ...prev.nodes, [newId]: newNode },
        extraChildren: {
          ...prev.extraChildren,
          [extraKey]: [...(prev.extraChildren[extraKey] ?? []), newId],
        },
        currentPath: [...prev.currentPath, newId],
      }
    })

  }, [branchState.branchCounter, currentPath, tree])

  const isLoaded =
    pgn !== null && baseData.parseError === null && Object.keys(baseData.tree).length > 0

  return {
    moveTree: tree,
    currentPath,
    currentFen,
    currentMoveIndex,
    pathDepth: currentPath.length,
    displayTotalDepth,
    goToMove,
    goForward,
    goBack,
    navigateTo,
    addVariationMove,
    resetBranches,
    lastAddedNodeIdRef,
    nextMainLineNode,
    isLoaded,
    parseError: baseData.parseError,
    whitePlayer: baseData.headers['White'] ?? null,
    blackPlayer: baseData.headers['Black'] ?? null,
    whiteElo: baseData.headers['WhiteElo'] ?? null,
    blackElo: baseData.headers['BlackElo'] ?? null,
    result: baseData.headers['Result'] ?? null,
    headers: baseData.headers,
    rootId,
    totalMoves,
    moves,
    hasVariations: hasAnyBranches(activeBranch),
    rootBranchIds: activeBranch.extraChildren['__root__'] ?? [],
  }
}
