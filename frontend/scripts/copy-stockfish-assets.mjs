import { cpSync, existsSync, mkdirSync } from 'node:fs'

mkdirSync('public/stockfish', { recursive: true })

// Prefer the lite single-threaded WASM build: much faster than asm.js while
// staying small enough for browser delivery and not depending on SAB threads.
const assetPairs = [
  ['node_modules/stockfish/bin/stockfish-18-lite-single.js', 'public/stockfish/stockfish.js'],
  ['node_modules/stockfish/bin/stockfish-18-lite-single.wasm', 'public/stockfish/stockfish.wasm'],
]

for (const [src, dst] of assetPairs) {
  if (!existsSync(src)) continue
  cpSync(src, dst)
  console.log(`${src} -> ${dst}`)
}

if (!existsSync('public/stockfish/stockfish.js')) {
  throw new Error('Stockfish JavaScript bundle was not found in node_modules/stockfish')
}

if (!existsSync('public/stockfish/stockfish.wasm')) {
  throw new Error('Stockfish WASM binary was not found in node_modules/stockfish')
}
