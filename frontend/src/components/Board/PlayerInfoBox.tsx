// PlayerInfoBox.tsx — Chess.com-style player info bar
// Two-line layout: [avatar] [name (rating) flag] / [captured pieces +N]  [clock]

import { useEffect, useMemo, useState } from 'react'
import { getPlayerProfile as getChessComProfile } from '../../api/chesscom'
import { getPlayerProfile as getLichessProfile } from '../../api/lichess'
import type { ChessComPlayer } from '../../api/chesscom'
import type { LichessPlayer } from '../../api/lichess'

import { getPieceImage } from '../../chess/pieceImages'

interface PlayerInfoBoxProps {
  username: string | null
  elo: string | null
  isWhite: boolean
  isToMove: boolean
  currentFen: string
  clockTime?: string
  platform?: 'chesscom' | 'lichess' | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 }
const START_COUNTS = { p: 8, n: 2, b: 2, r: 2, q: 1 }
const PIECE_ORDER = ['q', 'r', 'b', 'n', 'p']
function getCapturedPieces(fen: string): { white: string[]; black: string[] } {
  const board = fen.split(' ')[0]
  const current = { white: { p: 0, n: 0, b: 0, r: 0, q: 0 }, black: { p: 0, n: 0, b: 0, r: 0, q: 0 } }
  for (const ch of board) {
    if (ch >= 'a' && ch <= 'z' && ch !== 'k') {
      const k = ch as keyof typeof current.black
      if (k in current.black) current.black[k]++
    } else if (ch >= 'A' && ch <= 'Z' && ch !== 'K') {
      const k = ch.toLowerCase() as keyof typeof current.white
      if (k in current.white) current.white[k]++
    }
  }
  // Returns piece type chars ('q','r','b','n','p') — caller resolves to images
  const captured = { white: [] as string[], black: [] as string[] }
  for (const piece of PIECE_ORDER) {
    const k = piece as keyof typeof START_COUNTS
    const wLost = START_COUNTS[k] - current.white[k]
    const bLost = START_COUNTS[k] - current.black[k]
    for (let i = 0; i < wLost; i++) captured.white.push(piece)
    for (let i = 0; i < bLost; i++) captured.black.push(piece)
  }
  return captured
}

function getMaterialBalance(fen: string): number {
  const board = fen.split(' ')[0]
  let w = 0, b = 0
  for (const ch of board) {
    if (ch >= 'a' && ch <= 'z') b += PIECE_VALUES[ch] ?? 0
    else if (ch >= 'A' && ch <= 'Z') w += PIECE_VALUES[ch.toLowerCase()] ?? 0
  }
  return w - b
}

function getCountryFlag(raw?: string): string {
  if (!raw) return ''
  let code = raw
  if (raw.includes('/')) {
    const m = raw.match(/\/([A-Z]{2})$/)
    if (m) code = m[1]
    else return ''
  }
  if (code.length === 2 && /^[A-Z]{2}$/.test(code))
    return code.split('').map(c => String.fromCodePoint(127397 + c.charCodeAt(0))).join('')
  return ''
}

/** Format clock string for display.
 *  Input: "H:MM:SS" or "H:MM:SS.d" from PGN %clk
 *  Rules: strip leading "0:", show decimal only if total ≤ 60s */
function formatClock(raw: string): string {
  const parts = raw.split(':')
  if (parts.length < 3) return raw

  const h = parseInt(parts[0], 10)
  const m = parseInt(parts[1], 10)
  const sRaw = parts[2]  // may contain decimal e.g. "42.3"
  const s = parseFloat(sRaw)
  const totalSecs = h * 3600 + m * 60 + s

  if (totalSecs < 60) {
    // Show decimal: "0:42.3"
    return `0:${sRaw.padStart(4, '0')}`
  }
  // No decimal
  const sInt = Math.floor(s)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sInt).padStart(2, '0')}`
  return `${m}:${String(sInt).padStart(2, '0')}`
}

// ── Component ────────────────────────────────────────────────────────────────

export default function PlayerInfoBox({
  username, elo, isWhite, isToMove, currentFen, clockTime, platform
}: PlayerInfoBoxProps) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarFailed, setAvatarFailed] = useState(false)
  const [countryCode, setCountryCode] = useState<string | undefined>()

  useEffect(() => {
    if (!username || !platform) return
    setAvatarFailed(false)
    setAvatarUrl(null)
    setCountryCode(undefined)
    let cancelled = false

    ;(async () => {
      try {
        let profile: ChessComPlayer | LichessPlayer | null = null
        if (platform === 'chesscom') profile = await getChessComProfile(username)
        else if (platform === 'lichess') profile = await getLichessProfile(username)
        if (cancelled || !profile) return

        if ('avatar' in profile && profile.avatar) {
          const av = profile.avatar
          setAvatarUrl(av.startsWith('http') ? av : `https://api.chess.com${av.startsWith('/') ? '' : '/'}${av}`)
        }
        if ('country' in profile) setCountryCode(profile.country)
        else if ('profile' in profile && profile.profile?.country) setCountryCode(profile.profile.country)
      } catch { /* silently fail */ }
    })()

    return () => { cancelled = true }
  }, [username, platform])

  const materialBalance = useMemo(() => getMaterialBalance(currentFen), [currentFen])
  const capturedPieces = useMemo(() => getCapturedPieces(currentFen), [currentFen])
  // Show pieces that THIS player lost (captured by opponent)
  // Show pieces this player CAPTURED (opponent's pieces taken as trophies)
  const playerCaptured = isWhite ? capturedPieces.black : capturedPieces.white
  const advantage = isWhite ? materialBalance : -materialBalance

  const flag = getCountryFlag(countryCode)

  return (
    <div className={`player-info-box${isToMove ? ' to-move' : ''}`}>
      {/* Avatar */}
      <div className="player-avatar">
        {avatarUrl && !avatarFailed ? (
          <img
            src={avatarUrl}
            alt={`${username}`}
            className="avatar-image"
            onError={() => setAvatarFailed(true)}
          />
        ) : (
          <div className="avatar-fallback">
            {username ? username.charAt(0).toUpperCase() : '?'}
          </div>
        )}
      </div>

      {/* Name + captured pieces (two lines) */}
      <div className="player-info-lines">
        <div className="player-line-1">
          <span className="player-name">{username || 'Unknown'}</span>
          {elo && <span className="player-rating">({elo})</span>}
          {flag && <span className="player-flag">{flag}</span>}
        </div>
        <div className="player-line-2">
          {playerCaptured.length > 0 && (
            <span className="captured-pieces">
              {playerCaptured.map((pieceType, i) => (
                <img
                  key={i}
                  src={getPieceImage(isWhite ? 'b' : 'w', pieceType)}
                  alt={pieceType}
                  className="captured-piece-img"
                />
              ))}
            </span>
          )}
          {advantage > 0 && <span className="material-advantage">+{advantage}</span>}
        </div>
      </div>

      {/* Clock */}
      {clockTime && (
        <div className={`clock-box${isToMove ? ' clock-box--active' : ''}`}>
          <span className="clock-value">{formatClock(clockTime)}</span>
        </div>
      )}
    </div>
  )
}
