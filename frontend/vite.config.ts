import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// CRITICAL: Stockfish WASM requires SharedArrayBuffer, which requires these
// Cross-Origin isolation headers. Without them, Stockfish will fail to load.
// These must also be set in production (see vercel.json).
export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  // Stockfish WASM worker needs to be treated as an asset
  assetsInclude: ['**/*.wasm'],
  worker: {
    format: 'es',
  },
})
