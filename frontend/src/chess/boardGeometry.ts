import type { CSSProperties } from 'react'

export function getSquareOverlayPosition(
  square: string,
  orientation: 'white' | 'black',
): CSSProperties {
  const file = square.charCodeAt(0) - 97
  const rank = parseInt(square[1], 10) - 1
  const leftCell = orientation === 'white' ? file : (7 - file)
  const topCell = orientation === 'white' ? (7 - rank) : rank

  return {
    left: `calc(${(leftCell + 1) * 12.5}% - var(--board-badge-inset-x))`,
    top: `calc(${topCell * 12.5}% + var(--board-badge-inset-y))`,
  }
}
