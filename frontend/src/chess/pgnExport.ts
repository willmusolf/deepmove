// pgnExport.ts — Serialize a MoveTree (including user-explored variations)
// to standard PGN with `(...)` sub-variations, compatible with Lichess / chess.com.

import type { MoveTree } from './types'

const STANDARD_HEADER_ORDER = [
  'Event', 'Site', 'Date', 'Round', 'White', 'Black',
  'Result', 'WhiteElo', 'BlackElo', 'TimeControl', 'ECO', 'Opening',
] as const

function formatHeaders(headers: Record<string, string>): string {
  const known = STANDARD_HEADER_ORDER
    .filter(tag => typeof headers[tag] === 'string' && headers[tag].length > 0)
    .map(tag => `[${tag} "${escapePgnValue(headers[tag])}"]`)

  const extras = Object.entries(headers)
    .filter(([tag, val]) => !STANDARD_HEADER_ORDER.includes(tag as typeof STANDARD_HEADER_ORDER[number])
      && typeof val === 'string' && val.length > 0)
    .map(([tag, val]) => `[${tag} "${escapePgnValue(val)}"]`)

  return [...known, ...extras].join('\n')
}

function escapePgnValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/** Prefix a node's SAN with its move number ("12." for white, "12..." for black-after-variation). */
function moveNumberPrefix(moveNumber: number, color: 'white' | 'black', forceBlack: boolean): string {
  if (color === 'white') return `${moveNumber}.`
  if (forceBlack) return `${moveNumber}...`
  return ''
}

/** Recursive walker: emit main-line continuation followed by `(...)` blocks for siblings. */
function walk(
  tree: MoveTree,
  nodeId: string,
  // True when the previous token was an opening parenthesis or the start of a
  // sub-variation, meaning a black move needs an explicit "N..." prefix.
  forceBlackPrefix: boolean,
  out: string[],
): void {
  const node = tree[nodeId]
  if (!node) return

  const prefix = moveNumberPrefix(node.moveNumber, node.color, forceBlackPrefix)
  out.push(`${prefix}${node.san}`)

  // Sub-variations for siblings (childIds[1+] from PARENT, but here we look at
  // CURRENT node — siblings are accessed via parent's childIds).
  if (node.parentId !== null) {
    const parent = tree[node.parentId]
    if (parent) {
      const siblings = parent.childIds.slice(1)
      for (const siblingId of siblings) {
        if (siblingId === nodeId) continue
        out.push('(')
        walk(tree, siblingId, true, out)
        out.push(')')
      }
    }
  }

  // Continue down the main child (first child).
  const next = node.childIds[0]
  if (next) {
    // After a closing parenthesis, the next black move needs "N..." prefix.
    // Heuristic: if this node had siblings emitted, force prefix on next call.
    const hadSiblings = (() => {
      const parent = node.parentId !== null ? tree[node.parentId] : null
      if (!parent) return false
      return parent.childIds.length > 1
    })()
    walk(tree, next, hadSiblings, out)
  }
}

/** Emit sibling variations branching from the root itself (rare: pre-move-1 variation). */
function emitRootBranchVariations(
  tree: MoveTree,
  rootId: string,
  rootBranchIds: string[],
  out: string[],
): void {
  for (const branchId of rootBranchIds) {
    if (branchId === rootId) continue
    out.push('(')
    walk(tree, branchId, true, out)
    out.push(')')
  }
}

export interface PgnExportInput {
  tree: MoveTree
  rootId: string | null
  rootBranchIds?: string[]
  headers: Record<string, string>
}

/** Build a PGN string from the merged move tree, including all user variations. */
export function exportPgnWithVariations({
  tree,
  rootId,
  rootBranchIds = [],
  headers,
}: PgnExportInput): string {
  const headerBlock = formatHeaders(headers)
  const result = headers['Result'] ?? '*'

  if (!rootId) {
    return `${headerBlock}\n\n${result}`
  }

  const tokens: string[] = []
  walk(tree, rootId, false, tokens)
  emitRootBranchVariations(tree, rootId, rootBranchIds, tokens)
  tokens.push(result)

  // Join with spaces but keep "(" and ")" snug against their content.
  const body = tokens.reduce((acc, tok, i) => {
    if (i === 0) return tok
    const prev = tokens[i - 1]
    if (tok === ')' || prev === '(') return `${acc}${tok}`
    if (tok === '(') return `${acc} ${tok}`
    return `${acc} ${tok}`
  }, '')

  return `${headerBlock}\n\n${body}`
}
