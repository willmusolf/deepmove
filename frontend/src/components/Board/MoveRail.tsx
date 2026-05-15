// MoveRail.tsx — Phone-only horizontal transcript rail
// Flat horizontal scroll of move chips. Drop-in replacement for MoveList in Play mode.
// No variation support — walks childIds[0] for main-line only.

import { useEffect, useRef, useMemo, useState } from 'react'
import type { MoveGrade } from '../../engine/analysis'
import type { MoveNode, MoveTree } from '../../chess/types'
import { getPathToNode } from '../../hooks/useGameReview'
import { GRADE_BADGE_CONFIG } from './gradeBadges'
import type { KnownMoveGrade } from './gradeBadges'

const PHONE_QUERY = '(max-width: 639px)'

// ─── Shared hook: is the viewport phone-sized? ─────────────────────────────

export function useIsPhone(): boolean {
  const [isPhone, setIsPhone] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(PHONE_QUERY).matches
  )
  useEffect(() => {
    const mql = window.matchMedia(PHONE_QUERY)
    const handler = (e: MediaQueryListEvent) => setIsPhone(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])
  return isPhone
}

// ─── Grade color lookup ─────────────────────────────────────────────────────

function getGradeColor(grade: MoveGrade | undefined): string | undefined {
  if (!grade) return undefined
  return (grade in GRADE_BADGE_CONFIG)
    ? GRADE_BADGE_CONFIG[grade as KnownMoveGrade].boardColor
    : undefined
}

// ─── Component ──────────────────────────────────────────────────────────────

interface MoveRailProps {
  tree: MoveTree
  rootId: string | null
  currentPath: string[]
  moveGrades: (MoveGrade | undefined)[]
  moveDeltas?: (number | undefined)[]
  branchGrades?: Map<string, MoveGrade>
  pendingBranchNodes?: Set<string>
  onNodeClick: (path: string[]) => void
  isAnalyzing?: boolean
  rootBranchIds?: string[]
}

type MovePair = {
  key: string
  moveNumber: number
  firstIsBlack: boolean
  first?: MoveNode   // white (or black if game starts with black)
  second?: MoveNode  // black (or missing if game ends on white)
}

export default function MoveRail({
  tree,
  rootId,
  currentPath,
  moveGrades,
  branchGrades,
  pendingBranchNodes,
  onNodeClick,
  isAnalyzing = false,
}: MoveRailProps) {
  const railRef = useRef<HTMLDivElement>(null)

  // Flatten main line into an array of nodes
  const nodes = useMemo(() => {
    const result: MoveNode[] = []
    if (!rootId) return result
    let id: string | null = rootId
    while (id !== null) {
      const node: MoveNode | undefined = tree[id]
      if (!node) break
      result.push(node)
      id = node.childIds[0] ?? null
    }
    return result
  }, [tree, rootId])

  // Group nodes into pairs (white + black per full move)
  const pairs = useMemo((): MovePair[] => {
    const result: MovePair[] = []
    if (nodes.length === 0) return result
    let i = 0
    // Handle game starting with black move
    if (nodes[0].color === 'black') {
      result.push({ key: nodes[0].id, moveNumber: nodes[0].moveNumber, firstIsBlack: true, second: nodes[0] })
      i = 1
    }
    while (i < nodes.length) {
      const w = nodes[i]
      const b: MoveNode | undefined = nodes[i + 1]
      result.push({ key: w.id, moveNumber: w.moveNumber, firstIsBlack: false, first: w, second: b })
      i += 2
    }
    return result
  }, [nodes])

  const mainLineIdSet = useMemo(() => new Set(nodes.map(node => node.id)), [nodes])

  // Auto-scroll active chip into view
  const activeId = useMemo(() => {
    for (let i = currentPath.length - 1; i >= 0; i -= 1) {
      const id = currentPath[i]
      if (mainLineIdSet.has(id)) return id
    }
    return currentPath[currentPath.length - 1]
  }, [currentPath, mainLineIdSet])

  useEffect(() => {
    const rail = railRef.current
    if (!rail || !activeId) return
    const el = rail.querySelector<HTMLElement>(`[data-node-id="${activeId}"]`)
    if (!el) return

    const maxScrollLeft = Math.max(0, rail.scrollWidth - rail.clientWidth)
    const targetLeft = el.offsetLeft - ((rail.clientWidth - el.offsetWidth) / 2)
    const clampedLeft = Math.max(0, Math.min(maxScrollLeft, targetLeft))
    if (Math.abs(rail.scrollLeft - clampedLeft) < 1) return
    rail.scrollTo({ left: clampedLeft, behavior: 'smooth' })
  }, [activeId])

  if (!rootId) return <div className="move-rail" />

  function chipClass(node: MoveNode, pending: boolean): string {
    const active = activeId === node.id
    return [
      'move-rail__chip',
      active ? 'move-rail__chip--active' : '',
      pending ? 'move-rail__chip--pending' : '',
    ].filter(Boolean).join(' ')
  }

  function resolveGrade(node: MoveNode): MoveGrade | undefined {
    if (isAnalyzing) return undefined
    if (branchGrades?.has(node.id)) return branchGrades.get(node.id)
    const mainIdx = node.isMainLine ? parseInt(node.id.slice(1), 10) : -1
    return mainIdx >= 0 ? moveGrades[mainIdx] : undefined
  }

  function renderChip(node: MoveNode) {
    const grade = resolveGrade(node)
    const gradeColor = getGradeColor(grade)
    const active = activeId === node.id
    const pending = pendingBranchNodes?.has(node.id) ?? false
    const chipStyle = gradeColor && !active ? { borderBottomColor: gradeColor } : undefined
    return (
      <span
        key={node.id}
        className={chipClass(node, pending)}
        style={chipStyle}
        data-node-id={node.id}
        onClick={() => onNodeClick(getPathToNode(node.id, tree))}
      >
        {node.san}
      </span>
    )
  }

  return (
    <div className="move-rail" ref={railRef}>
      {pairs.map((pair) => {
        const numLabel = pair.firstIsBlack ? `${pair.moveNumber}…` : `${pair.moveNumber}.`
        return (
          <span key={pair.key} className="move-rail__pair">
            <span className="move-rail__num">{numLabel}</span>
            {pair.first && renderChip(pair.first)}
            {pair.second && renderChip(pair.second)}
          </span>
        )
      })}
    </div>
  )
}
