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

export function verifyNodeVersion() {
  const version = parseNodeVersion(process.version)
  if (isSupportedNodeVersion(version)) return

  throw new Error(
    `DeepMove frontend requires Node 20.19+ or newer. Current version: ${process.version}. Run \`nvm use\` from the repo root before installing or building.`,
  )
}

verifyNodeVersion()
