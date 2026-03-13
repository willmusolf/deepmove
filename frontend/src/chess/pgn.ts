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
  // Strip (...) variation groups — apply twice to handle one level of nesting
  s = s.replace(/\([^()]*\)/g, '')
  s = s.replace(/\([^()]*\)/g, '')
  return s.replace(/\s+/g, ' ').trim()
}
