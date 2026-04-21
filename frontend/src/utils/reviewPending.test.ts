import { describe, expect, it } from 'vitest'
import { pruneReviewPendingNodes, shouldTrackReviewPendingNode } from './reviewPending'
import type { MoveTree } from '../chess/types'

const tree: MoveTree = {
  m0: {
    id: 'm0',
    san: 'e4',
    from: 'e2',
    to: 'e4',
    fen: 'after-e4',
    childIds: ['m1', 'm0-b0'],
    parentId: null,
    moveNumber: 1,
    color: 'white',
    isMainLine: true,
  },
  m1: {
    id: 'm1',
    san: 'e5',
    from: 'e7',
    to: 'e5',
    fen: 'after-e5',
    childIds: [],
    parentId: 'm0',
    moveNumber: 1,
    color: 'black',
    isMainLine: true,
  },
  'm0-b0': {
    id: 'm0-b0',
    san: 'c5',
    from: 'c7',
    to: 'c5',
    fen: 'after-c5',
    childIds: [],
    parentId: 'm0',
    moveNumber: 1,
    color: 'black',
    isMainLine: false,
  },
}

describe('reviewPending', () => {
  it('tracks pending review nodes only for branch moves', () => {
    expect(shouldTrackReviewPendingNode('m0-b0', tree, new Map())).toBe(true)
    expect(shouldTrackReviewPendingNode('m0', tree, new Map())).toBe(false)
    expect(shouldTrackReviewPendingNode('missing', tree, new Map())).toBe(false)
  })

  it('clears a stuck main-line pending marker after backing out of a branch', () => {
    const pendingAfterBack = new Set(['m0'])

    expect(pruneReviewPendingNodes(pendingAfterBack, tree, new Map())).toEqual(new Set())
  })

  it('prunes main-line and graded nodes from review pending state', () => {
    const pending = new Set(['m0', 'm0-b0', 'missing'])
    const graded = new Map([['m0-b0', 'good' as const]])

    expect(pruneReviewPendingNodes(pending, tree, graded)).toEqual(new Set())
  })

  it('returns the same set when every pending node is still valid', () => {
    const pending = new Set(['m0-b0'])

    expect(pruneReviewPendingNodes(pending, tree, new Map())).toBe(pending)
  })
})
