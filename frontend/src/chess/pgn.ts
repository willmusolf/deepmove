// pgn.ts — PGN cleaning utilities

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
  const times: (string | undefined)[] = []
  const regex = /\{\s*\[%clk\s+(\d+:\d{2}:\d{2}(?:\.\d+)?)\]\s*\}/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(rawPgn)) !== null) {
    times.push(match[1])
  }
  return times
}
