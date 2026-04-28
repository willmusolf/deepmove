import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const commitSha =
  process.env.VITE_COMMIT_SHA ??
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.GITHUB_SHA ??
  'dev'

const buildTime = process.env.VITE_BUILD_TIME ?? new Date().toISOString()

export default defineConfig({
  plugins: [react()],
  assetsInclude: ['**/*.wasm'],
  define: {
    __DEEPMOVE_COMMIT_SHA__: JSON.stringify(commitSha),
    __DEEPMOVE_BUILD_TIME__: JSON.stringify(buildTime),
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'vendor-react'
          }
          if (id.includes('node_modules/chess.js')) {
            return 'vendor-chess'
          }
          if (id.includes('node_modules/chessground')) {
            return 'vendor-chessground'
          }
          return undefined
        },
      },
    },
  },
})
