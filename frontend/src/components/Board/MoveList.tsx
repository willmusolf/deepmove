// MoveList.tsx — Lichess-style pair-per-row move list
// Each full-move (white + black) appears on one row.
// Variation blocks are indented divs beneath the pair row they branch from.

import { useEffect, useRef } from 'react'
import type { MoveGrade } from '../../engine/analysis'
import type { MoveNode, MoveTree } from '../../chess/types'
import { getPathToNode } from '../../hooks/useGameReview'

// ─── Grade badge ─────────────────────────────────────────────────────────────

const GRADE_CONFIG: Record<NonNullable<MoveGrade>, { label: string; cls: string }> = {
  brilliant:  { label: '!!', cls: 'grade-brilliant' },
  great:      { label: '!',  cls: 'grade-great' },
  best:       { label: '★',  cls: 'grade-best' },
  excellent:  { label: '✓',  cls: 'grade-excellent' },
  good:       { label: '·',  cls: 'grade-good' },
  inaccuracy: { label: '?!', cls: 'grade-inaccuracy' },
  mistake:    { label: '?',  cls: 'grade-mistake' },
  blunder:    { label: '??', cls: 'grade-blunder' },
  miss:       { label: '✗',  cls: 'grade-miss' },
  forced:     { label: '→',  cls: 'grade-forced' },
}

function GradeBadge({ grade, pending }: { grade: MoveGrade | undefined; pending?: boolean }) {
  if (pending) return <span className="grade-pending" />
  if (!grade) return <span className="grade-placeholder" />
  const cfg = GRADE_CONFIG[grade]
  return <span className={`move-grade ${cfg.cls}`}>{cfg.label}</span>
}

// ─── Shared context passed through all renderers ──────────────────────────────

interface RenderCtx {
  tree: MoveTree
  currentPath: string[]
  moveGrades: (MoveGrade | undefined)[]
  branchGrades?: Map<string, MoveGrade>
  pendingBranchNodes?: Set<string>
  onNodeClick: (path: string[]) => void
  isAnalyzing: boolean
}

// ─── Single move token ────────────────────────────────────────────────────────

function MoveToken({ node, ctx }: { node: MoveNode; ctx: RenderCtx }) {
  const { currentPath, moveGrades, onNodeClick, isAnalyzing, tree } = ctx
  const active = currentPath[currentPath.length - 1] === node.id
  const inPath = currentPath.includes(node.id)
  const mainIdx = node.isMainLine ? parseInt(node.id.slice(1), 10) : -1
  const grade = (!isAnalyzing && mainIdx >= 0)
    ? moveGrades[mainIdx]
    : (!isAnalyzing ? ctx.branchGrades?.get(node.id) : undefined)

  const isPending = !node.isMainLine && ctx.pendingBranchNodes?.has(node.id)

  return (
    <span className="move-cell">
      <GradeBadge grade={isAnalyzing ? undefined : grade} pending={isPending} />
      <span
        className={['move-san', active ? 'move-active' : '', inPath && !active ? 'move-in-path' : ''].filter(Boolean).join(' ')}
        data-node-id={node.id}
        onClick={() => onNodeClick(getPathToNode(node.id, tree))}
      >
        {node.san}
      </span>
    </span>
  )
}

// ─── Pair-based line renderer ─────────────────────────────────────────────────
// Walks the line collecting moves in pairs (white, black).
// Renders each pair as one flex row, then appends variation blocks below the row.

function PairLine({ startId, ctx, depth }: { startId: string; ctx: RenderCtx; depth: number }) {
  const { tree } = ctx

  // Collect nodes along childIds[0] — stay within the same isMainLine lane
  const lineIsMainLine = tree[startId]?.isMainLine ?? true
  const nodes: MoveNode[] = []
  let id: string | null = startId
  while (id !== null) {
    const node: MoveNode | undefined = tree[id]
    if (!node) break
    nodes.push(node)
    const nextId: string | null = node.childIds[0] ?? null
    id = (nextId && tree[nextId]?.isMainLine === lineIsMainLine) ? nextId : null
  }
  if (nodes.length === 0) return null

  // Group into pairs.
  // If the line starts with a black move (variation after a white move), emit a
  // partial row "N… black" first, then continue with white-led pairs.
  type Pair = { primary: MoveNode; secondary: MoveNode | null }
  const pairs: Pair[] = []
  let i = 0

  if (nodes[0].color === 'black') {
    pairs.push({ primary: nodes[0], secondary: null })
    i = 1
  }

  while (i < nodes.length) {
    const white = nodes[i]
    const black: MoveNode | null = nodes[i + 1] ?? null
    pairs.push({ primary: white, secondary: black })
    i += black ? 2 : 1
  }

  return (
    <>
      {pairs.map(({ primary, secondary }) => {
        const numLabel = primary.color === 'white'
          ? `${primary.moveNumber}.`
          : `${primary.moveNumber}…`

        // Collect all branches: from primary (white or partial-black) + from secondary (black)
        const branches = [
          ...(depth === 0 ? primary.childIds.filter(id => !tree[id]?.isMainLine) : primary.childIds.slice(1)),
          ...(secondary ? (depth === 0 ? secondary.childIds.filter(id => !tree[id]?.isMainLine) : secondary.childIds.slice(1)) : []),
        ]

        return (
          <div key={primary.id} className="move-full-row">
            <div className="move-pair-row">
              <span className="move-number">{numLabel}</span>
              <MoveToken node={primary} ctx={ctx} />
              {secondary && <MoveToken node={secondary} ctx={ctx} />}
            </div>

            {branches.length > 0 && (
              <div className="variation-blocks">
                {branches.map(bid => {
                  const bn = tree[bid]
                  if (!bn) return null
                  return (
                    <div key={bid} className={`variation-block variation-depth-${Math.min(depth + 1, 3)}`}>
                      <PairLine startId={bid} ctx={ctx} depth={depth + 1} />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

interface MoveListProps {
  tree: MoveTree
  rootId: string | null
  currentPath: string[]
  moveGrades: (MoveGrade | undefined)[]
  branchGrades?: Map<string, MoveGrade>
  pendingBranchNodes?: Set<string>
  onNodeClick: (path: string[]) => void
  isAnalyzing?: boolean
  rootBranchIds?: string[]
}

export default function MoveList({
  tree,
  rootId,
  currentPath,
  moveGrades,
  branchGrades,
  pendingBranchNodes,
  onNodeClick,
  isAnalyzing = false,
  rootBranchIds = [],
}: MoveListProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const activeId = currentPath[currentPath.length - 1]
    if (!activeId) return
    const el = containerRef.current.querySelector<HTMLElement>(`[data-node-id="${activeId}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [currentPath])

  if (!rootId) return <div className="move-list" />

  const ctx: RenderCtx = { tree, currentPath, moveGrades, branchGrades, pendingBranchNodes, onNodeClick, isAnalyzing }

  return (
    <div className="move-list" ref={containerRef}>
      {rootBranchIds.length > 0 && (
        <div className="variation-blocks">
          {rootBranchIds.map(bid => {
            const bn = tree[bid]
            if (!bn) return null
            return (
              <div key={bid} className="variation-block variation-depth-1">
                <PairLine startId={bid} ctx={ctx} depth={1} />
              </div>
            )
          })}
        </div>
      )}
      <PairLine startId={rootId} ctx={ctx} depth={0} />
    </div>
  )
}