// PlayerInfoBox.tsx — Professional player info display above/below board
// Shows: avatar, username, rating, flag, time remaining, pieces captured, material advantage
// Matches Chessigma/Lichess styling with dark background and clean layout

import { useEffect, useMemo, useState } from 'react'
import { getPlayerProfile as getChessComProfile } from '../../api/chesscom'
import { getPlayerProfile as getLichessProfile } from '../../api/lichess'
import type { ChessComPlayer } from '../../api/chesscom'
import type { LichessPlayer } from '../../api/lichess'

interface PlayerInfoBoxProps {
  username: string | null
  elo: string | null
  isWhite: boolean
  isToMove: boolean
  currentFen: string
  timeLeft?: number | null  // Time remaining in seconds (from PGN timestamps)
  platform?: 'chesscom' | 'lichess' | null  // For avatar fetching
}

interface PlayerProfile {
  avatar?: string
  country?: string
}

function getMaterialBalance(fen: string): number {
  // Calculate material advantage in pawns
  const pieceValues: Record<string, number> = {
    p: 1, n: 3, b: 3, r: 5, q: 9, k: 0
  }

  const board = fen.split(' ')[0]
  let whiteMaterial = 0
  let blackMaterial = 0

  for (const char of board) {
    if (char >= 'a' && char <= 'z') {
      blackMaterial += pieceValues[char] || 0
    } else if (char >= 'A' && char <= 'Z') {
      whiteMaterial += pieceValues[char.toLowerCase()] || 0
    }
    // Skip numbers (empty squares) and '/' (rank separators)
  }

  return whiteMaterial - blackMaterial
}

function getCapturedPieces(fen: string): { white: string[], black: string[] } {
  // Count pieces actually on the board
  const currentPieces = { white: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 }, black: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 } }

  const board = fen.split(' ')[0]

  for (const char of board) {
    if (char >= 'a' && char <= 'z') {
      const piece = char as keyof typeof currentPieces.black
      currentPieces.black[piece]++
    } else if (char >= 'A' && char <= 'Z') {
      const piece = char.toLowerCase() as keyof typeof currentPieces.white
      currentPieces.white[piece]++
    }
    // Skip numbers (empty squares) and '/' (rank separators)
  }

  // Starting position piece counts
  const startingPieces = {
    white: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 },
    black: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 }
  }

  const captured = { white: [] as string[], black: [] as string[] }

  // Find captured pieces (missing from starting position)
  Object.entries(startingPieces.white).forEach(([piece, startCount]) => {
    const currentCount = currentPieces.white[piece as keyof typeof currentPieces.white]
    const capturedCount = startCount - currentCount
    for (let i = 0; i < capturedCount; i++) {
      captured.white.push(piece.toUpperCase())
    }
  })

  Object.entries(startingPieces.black).forEach(([piece, startCount]) => {
    const currentCount = currentPieces.black[piece as keyof typeof currentPieces.black]
    const capturedCount = startCount - currentCount
    for (let i = 0; i < capturedCount; i++) {
      captured.black.push(piece)
    }
  })

  return captured
}

function formatTime(seconds: number | null): string {
  if (!seconds || seconds < 0) return '--:--'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function getCountryFlag(countryCode?: string): string {
  if (!countryCode) return ''
  
  // Handle Chess.com URLs like "https://api.chess.com/pub/country/US"
  if (countryCode.includes('chess.com') || countryCode.includes('https') || countryCode.includes('/')) {
    const match = countryCode.match(/\/([A-Z]{2})$/)
    if (match) countryCode = match[1]
    else return '' // Invalid format
  }
  
  // Only convert valid 2-letter country codes
  if (countryCode.length === 2 && /^[A-Z]{2}$/.test(countryCode)) {
    return countryCode.toUpperCase().split('').map(char =>
      String.fromCodePoint(127397 + char.charCodeAt(0))
    ).join('')
  }
  
  return '' // Invalid country code
}

export default function PlayerInfoBox({
  username,
  elo,
  isWhite,
  isToMove,
  currentFen,
  timeLeft,
  platform
}: PlayerInfoBoxProps) {
  const [profile, setProfile] = useState<PlayerProfile | null>(null)

  // Fetch player profile for avatar and country
  useEffect(() => {
    if (!username || !platform) return

    const fetchProfile = async () => {
      try {
        let playerProfile: ChessComPlayer | LichessPlayer | null = null

        if (platform === 'chesscom') {
          playerProfile = await getChessComProfile(username)
        } else if (platform === 'lichess') {
          playerProfile = await getLichessProfile(username)
        }

        if (playerProfile) {
          let avatarUrl: string | undefined
          
          if ('avatar' in playerProfile && playerProfile.avatar) {
            // Chess.com avatar - might be relative or full URL
            const avatar = playerProfile.avatar
            if (avatar.startsWith('http')) {
              avatarUrl = avatar
            } else {
              // Assume it's a Chess.com avatar path
              avatarUrl = `https://api.chess.com${avatar.startsWith('/') ? '' : '/'}${avatar}`
            }
          }
          
          setProfile({
            avatar: avatarUrl,
            country: 'country' in playerProfile ? playerProfile.country : ('profile' in playerProfile && playerProfile.profile?.country ? playerProfile.profile.country : undefined)
          })
        }
      } catch (error) {
        console.warn('Failed to fetch player profile:', error)
      }
    }

    fetchProfile()
  }, [username, platform])

  const materialBalance = useMemo(() => getMaterialBalance(currentFen), [currentFen])
  const capturedPieces = useMemo(() => getCapturedPieces(currentFen), [currentFen])
  const playerCaptured = isWhite ? capturedPieces.black : capturedPieces.white

  return (
    <div className={`player-info-box ${isWhite ? 'white' : 'black'}`}>
      <div className="player-avatar">
        {profile?.avatar && profile.avatar.startsWith('http') ? (
          <img
            src={profile.avatar}
            alt={`${username} avatar`}
            className="avatar-image"
            onError={(e) => {
              const target = e.target as HTMLImageElement
              target.style.display = 'none'
              const fallback = target.nextElementSibling as HTMLElement
              if (fallback) fallback.style.display = 'flex'
            }}
          />
        ) : null}
        <div 
          className="avatar-fallback"
          style={{ 
            display: (!profile?.avatar || !profile.avatar.startsWith('http')) ? 'flex' : 'none' 
          }}
        >
          {username ? username.charAt(0).toUpperCase() : '?'}
        </div>
      </div>

      <div className="player-details">
        <div className="player-header">
          <span className="player-name">{username || 'Unknown'}</span>
          {elo && <span className="player-rating">({elo})</span>}
          {profile?.country && (
            <span className="player-flag" title={profile.country}>
              {getCountryFlag(profile.country)}
            </span>
          )}
        </div>

        <div className="player-stats">
          <div className="time-display">
            {formatTime(timeLeft ?? null)}
          </div>

          <div className="material-info">
            <div className="captured-pieces">
              {playerCaptured.length > 0 ? playerCaptured.map((piece, i) => (
                <span key={i} className="captured-piece">{piece}</span>
              )) : null}
            </div>
            <div className="material-balance">
              {materialBalance > 0 && '+'}
              {materialBalance !== 0 ? materialBalance : ''}
            </div>
          </div>
        </div>
      </div>

      <div className={`to-move-indicator ${isToMove ? 'active' : ''}`} />
    </div>
  )
}