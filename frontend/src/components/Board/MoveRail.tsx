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

  // Auto-scroll active chip into view
  const activeId = currentPath[currentPath.length - 1]
  useEffect(() => {
    const rail = railRef.current
    if (!rail || !activeId) return
    const el = rail.querySelector<HTMLElement>(`[data-node-id="${activeId}"]`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [activeId])

  if (!rootId) return <div className="move-rail" />

  return (
    <div className="move-rail" ref={railRef}>
      {nodes.map((node) => {
        const active = activeId === node.id
        const isFirstOfPair = node.color === 'white'
        const mainIdx = node.isMainLine ? parseInt(node.id.slice(1), 10) : -1

        // Grade resolution — same logic as MoveList's MoveToken
        let grade: MoveGrade | undefined
        if (!isAnalyzing) {
          if (branchGrades?.has(node.id)) {
            grade = branchGrades.get(node.id)
          } else if (mainIdx >= 0) {
            grade = moveGrades[mainIdx]
          }
        }
        const gradeColor = getGradeColor(grade)
        const pending = pendingBranchNodes?.has(node.id) ?? false

        // Move number label
        const numLabel = isFirstOfPair
          ? `${node.moveNumber}.`
          : (nodes[0] === node && node.color === 'black' ? `${node.moveNumber}…` : null)

        const chipClass = [
          'move-rail__chip',
          active ? 'move-rail__chip--active' : '',
          pending ? 'move-rail__chip--pending' : '',
        ].filter(Boolean).join(' ')

        const chipStyle = gradeColor && !active
          ? { borderBottomColor: gradeColor }
          : undefined

        return (
          <span key={node.id} className="move-rail__pair">
            {numLabel && <span className="move-rail__num">{numLabel}</span>}
            <span
              className={chipClass}
              style={chipStyle}
              data-node-id={node.id}
              onClick={() => onNodeClick(getPathToNode(node.id, tree))}
            >
              {node.san}
            </span>
          </span>
        )
      })}
    </div>
  )
}
