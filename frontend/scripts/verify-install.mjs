import { readFileSync } from 'node:fs'
import { verifyNodeVersion } from './check-node-version.mjs'

async function verifyRolldownBinding() {
  try {
    await import('rolldown')
  } catch (error) {
    throw new Error(
      'Rolldown native binding is unavailable. Repair the frontend install with `npm install --include=optional` in `frontend/` after confirming `nvm use` is active.',
      { cause: error },
    )
  }
}

function verifyChessgroundPatch() {
  const svgPath = new URL('../node_modules/chessground/dist/svg.js', import.meta.url)
  const svgSource = readFileSync(svgPath, 'utf8')

  const requiredMarkers = [
    '.filter(s => s.dest)',
    'originM = 6 / 64',
    'x1: from[0] + xi',
    'y1: from[1] + yi',
  ]

  for (const marker of requiredMarkers) {
    if (!svgSource.includes(marker)) {
      throw new Error(
        `Expected patched chessground install is missing marker: ${marker}. Reinstall frontend dependencies.`,
      )
    }
  }
}

verifyNodeVersion()
await verifyRolldownBinding()
verifyChessgroundPatch()
