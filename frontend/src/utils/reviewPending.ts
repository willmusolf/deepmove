import type { MoveGrade } from '../engine/analysis'
import type { MoveTree } from '../chess/types'

export function shouldTrackReviewPendingNode(
  nodeId: string | null | undefined,
  tree: MoveTree,
  branchGrades: Map<string, MoveGrade>,
): nodeId is string {
  if (!nodeId) return false

  const node = tree[nodeId]
  return !!node && !node.isMainLine && !branchGrades.has(nodeId)
}

export function pruneReviewPendingNodes(
  pendingNodes: Set<string>,
  tree: MoveTree,
  branchGrades: Map<string, MoveGrade>,
): Set<string> {
  let changed = false
  const next = new Set<string>()

  for (const nodeId of pendingNodes) {
    if (shouldTrackReviewPendingNode(nodeId, tree, branchGrades)) {
      next.add(nodeId)
      continue
    }

    changed = true
  }

  return changed ? next : pendingNodes
}
