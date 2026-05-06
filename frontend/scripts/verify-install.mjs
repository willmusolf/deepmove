import { readFileSync } from 'node:fs'

function parseNodeVersion(rawVersion) {
  const [major = '0', minor = '0', patch = '0'] = rawVersion.replace(/^v/, '').split('.')
  return {
    major: Number.parseInt(major, 10),
    minor: Number.parseInt(minor, 10),
    patch: Number.parseInt(patch, 10),
  }
}

function isSupportedNodeVersion(version) {
  if (version.major > 20) return true
  if (version.major < 20) return false
  if (version.minor > 19) return true
  if (version.minor < 19) return false
  return version.patch >= 0
}

function verifyNodeVersion() {
  const version = parseNodeVersion(process.version)
  if (isSupportedNodeVersion(version)) return

  throw new Error(
    `DeepMove frontend requires Node 20.19+ or newer. Current version: ${process.version}.`,
  )
}

async function verifyRolldownBinding() {
  try {
    await import('rolldown')
  } catch (error) {
    throw new Error(
      'Rolldown native binding is unavailable. Repair the frontend install with `npm install` in `frontend/`.',
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
