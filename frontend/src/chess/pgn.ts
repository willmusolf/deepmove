// pgn.ts — PGN cleaning utilities

const CLOCK_COMMENT_REGEX = /\{\s*\[%clk\s+(\d+:\d{2}:\d{2}(?:\.\d+)?)\]\s*\}/g
const CLOCK_COMMENT_CONTENT_REGEX = /^\s*\[%clk\s+(\d+:\d{2}:\d{2}(?:\.\d+)?)\]\s*$/
const HEADER_LINE_REGEX = /^\s*\[[^\]\r\n]*\]\s*$/gm
const RESULT_TOKEN_REGEX = /^(?:1-0|0-1|1\/2-1\/2|\*)$/

function normalizeMainlineToken(token: string): string | null {
  const trimmed = token.trim()
  if (!trimmed || trimmed.startsWith('$')) return null

  const withoutMoveNumber = trimmed.replace(/^\d+\.(?:\.\.)?/, '')
  if (!withoutMoveNumber || RESULT_TOKEN_REGEX.test(withoutMoveNumber)) return null

  return withoutMoveNumber
}

/**
 * Strip all {...} comments from a PGN string before passing to chess.js.
 * Chess.com embeds clock times, move effects, and other metadata in comments:
 *   {[%clk 0:09:57.2]}
 *   {[%c_effect d6;square;d6;type;Inaccuracy;size;100%;...]}
 * These are optional metadata — removing them lets chess.js parse moves cleanly.
 * Also collapses extra whitespace left behind.
 */
export function cleanPgn(pgn: string): string {
  let s = pgn
    .replace(/\{[^}]*\}/gs, '')   // strip {...} comments (clk, c_effect, etc.)
    .replace(/\$\d+/g, '')         // strip $N NAGs (inaccuracy, blunder annotations)
  // Strip (...) variation groups — loop until all nesting levels are removed
  while (s.includes('(')) {
    const prev = s
    s = s.replace(/\([^()]*\)/g, '')
    if (s === prev) break  // safety: no progress (malformed PGN), exit
  }
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * Extract move clock times from raw PGN (before cleanPgn strips comments).
 * Parses { [%clk H:MM:SS] } annotations in move order.
 * Returns an array indexed by half-move (0 = white move 1, 1 = black move 1, ...).
 * Entries are clock strings like "0:09:45" or undefined if no clock for that move.
 */
export function extractClockTimes(rawPgn: string): (string | undefined)[] {
  const mainlinePgn = rawPgn.replace(HEADER_LINE_REGEX, ' ')
  const times: (string | undefined)[] = []
  let halfMoveIndex = -1
  let variationDepth = 0
  let foundClock = false

  for (let i = 0; i < mainlinePgn.length;) {
    const char = mainlinePgn[i]

    if (variationDepth > 0) {
      if (char === '(') {
        variationDepth++
        i++
        continue
      }
      if (char === ')') {
        variationDepth--
        i++
        continue
      }
      if (char === '{') {
        const end = mainlinePgn.indexOf('}', i + 1)
        i = end === -1 ? mainlinePgn.length : end + 1
        continue
      }
      if (char === ';') {
        const end = mainlinePgn.indexOf('\n', i + 1)
        i = end === -1 ? mainlinePgn.length : end + 1
        continue
      }
      i++
      continue
    }

    if (/\s/.test(char)) {
      i++
      continue
    }

    if (char === ';') {
      const end = mainlinePgn.indexOf('\n', i + 1)
      i = end === -1 ? mainlinePgn.length : end + 1
      continue
    }

    if (char === '(') {
      variationDepth = 1
      i++
      continue
    }

    if (char === '{') {
      const end = mainlinePgn.indexOf('}', i + 1)
      const comment = end === -1 ? mainlinePgn.slice(i + 1) : mainlinePgn.slice(i + 1, end)
      const match = comment.match(CLOCK_COMMENT_CONTENT_REGEX)
      if (match && halfMoveIndex >= 0) {
        foundClock = true
        times[halfMoveIndex] = match[1]
      }
      i = end === -1 ? mainlinePgn.length : end + 1
      continue
    }

    if (char === ')') {
      i++
      continue
    }

    let end = i + 1
    while (end < mainlinePgn.length && !/[\s{}();]/.test(mainlinePgn[end])) {
      end++
    }

    const token = normalizeMainlineToken(mainlinePgn.slice(i, end))
    if (token !== null) {
      halfMoveIndex++
      times[halfMoveIndex] = undefined
    }
    i = end
  }

  return foundClock ? times : []
}

export function hasClockAnnotations(rawPgn: string): boolean {
  CLOCK_COMMENT_REGEX.lastIndex = 0
  return CLOCK_COMMENT_REGEX.test(rawPgn)
}
