import type { MoveGrade } from '../engine/analysis'
import type { MoveTree } from '../chess/types'

interface PendingNodeOptions {
  allowMainLine?: boolean
}

function shouldTrackPendingNode(
  nodeId: string | null | undefined,
  tree: MoveTree,
  branchGrades: Map<string, MoveGrade>,
  options: PendingNodeOptions = {},
): nodeId is string {
  if (!nodeId) return false

  const node = tree[nodeId]
  return !!node
    && (options.allowMainLine === true || !node.isMainLine)
    && !branchGrades.has(nodeId)
}

export function shouldTrackReviewPendingNode(
  nodeId: string | null | undefined,
  tree: MoveTree,
  branchGrades: Map<string, MoveGrade>,
): nodeId is string {
  return shouldTrackPendingNode(nodeId, tree, branchGrades)
}

export function prunePendingNodes(
  pendingNodes: Set<string>,
  tree: MoveTree,
  branchGrades: Map<string, MoveGrade>,
  options: PendingNodeOptions = {},
): Set<string> {
  let changed = false
  const next = new Set<string>()

  for (const nodeId of pendingNodes) {
    if (shouldTrackPendingNode(nodeId, tree, branchGrades, options)) {
      next.add(nodeId)
      continue
    }

    changed = true
  }

  return changed ? next : pendingNodes
}

export function pruneReviewPendingNodes(
  pendingNodes: Set<string>,
  tree: MoveTree,
  branchGrades: Map<string, MoveGrade>,
): Set<string> {
  return prunePendingNodes(pendingNodes, tree, branchGrades)
}
