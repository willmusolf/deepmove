import { cpSync, existsSync, mkdirSync } from 'node:fs'

mkdirSync('public/stockfish', { recursive: true })

const assetPairs = [
  ['node_modules/stockfish/src/stockfish-17.1-lite-single.js', 'public/stockfish/stockfish.js'],
  ['node_modules/stockfish/src/stockfish-17.1-lite-single.wasm', 'public/stockfish/stockfish.wasm'],
  ['node_modules/stockfish/src/stockfish-17.1-single.js', 'public/stockfish/stockfish.js'],
  ['node_modules/stockfish/src/stockfish-17.1-single.wasm', 'public/stockfish/stockfish.wasm'],
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
  console.warn('Stockfish WASM bundle not found; worker will fall back to the JS-only engine if supported')
}
