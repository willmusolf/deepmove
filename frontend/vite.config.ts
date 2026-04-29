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
    hmr: {
      port: 5174,
    },
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
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-chess': ['chess.js'],
          'vendor-chessground': ['chessground'],
        },
      },
    },
  },
})
