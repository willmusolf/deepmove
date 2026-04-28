import { cpSync, existsSync, mkdirSync } from 'node:fs'

mkdirSync('public/stockfish', { recursive: true })

// Use the asm.js build — self-contained, no companion .wasm file needed.
// The npm `stockfish` package does not ship .wasm binaries, so WASM loader
// variants (stockfish-18-lite-single.js etc.) will always fail at runtime.
const assetPairs = [
  ['node_modules/stockfish/bin/stockfish-18-asm.js', 'public/stockfish/stockfish.js'],
]

for (const [src, dst] of assetPairs) {
  if (!existsSync(src)) continue
  cpSync(src, dst)
  console.log(`${src} -> ${dst}`)
}

if (!existsSync('public/stockfish/stockfish.js')) {
  throw new Error('Stockfish JavaScript bundle was not found in node_modules/stockfish')
}
