import { useEffect, useRef, useMemo } from 'react'
import type { ChessComGame } from '../../api/chesscom'
import type { LichessGame } from '../../api/lichess'
import { useGameStore } from '../../stores/gameStore'
import { cleanPgn } from '../../chess/pgn'

interface GameSelectorProps {
  games: ChessComGame[] | LichessGame[]
  username: string
  platform: 'chesscom' | 'lichess'
  onGameLoaded: () => void
}

function formatTimestamp(ms: number): string {
  const d = new Date(ms)
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${date} - ${time}`
}

function formatTimeControl(tc: string): string {
  // Chess.com: "600" → "10 min", "300+3" → "5+3"
  // Lichess: already "5+3" style from clock
  if (tc.includes('+')) return tc
  const secs = parseInt(tc, 10)
  if (isNaN(secs)) return tc
  const mins = Math.round(secs / 60)
  return `${mins} min`
}

function isChessComGame(g: ChessComGame | LichessGame): g is ChessComGame {
  return 'end_time' in g
}

interface NormalizedGame {
  pgn: string
  opponent: string
  opponentRating: number
  userRating: number
  result: 'W' | 'L' | 'D'
  timeControl: string
  date: string
  isWhite: boolean
}

export function normalizeChessCom(game: ChessComGame, username: string): NormalizedGame {
  const isWhite = game.white.username.toLowerCase() === username.toLowerCase()
  const opponent = isWhite ? game.black : game.white
  const myResult = isWhite ? game.white.result : game.black.result

  let result: 'W' | 'L' | 'D'
  if (myResult === 'win') result = 'W'
  else if (['checkmated', 'resigned', 'timeout', 'abandoned', 'lose'].includes(myResult)) result = 'L'
  else result = 'D'

  return {
    pgn: game.pgn,
    opponent: opponent.username,
    opponentRating: opponent.rating,
    userRating: (isWhite ? game.white : game.black).rating,
    result,
    timeControl: formatTimeControl(game.time_control),
    date: formatTimestamp(game.end_time * 1000),
    isWhite,
  }
}

export function normalizeLichess(game: LichessGame, username: string): NormalizedGame {
  const isWhite = game.players.white.user?.name?.toLowerCase() === username.toLowerCase()
  const opponent = isWhite ? game.players.black : game.players.white

  // Lichess result from status + winner field isn't always present, infer from status
  let result: 'W' | 'L' | 'D' = 'D'
  if ((game as unknown as Record<string, unknown>).winner === (isWhite ? 'white' : 'black')) result = 'W'
  else if ((game as unknown as Record<string, unknown>).winner === (isWhite ? 'black' : 'white')) result = 'L'
  else if (game.status === 'draw' || game.status === 'stalemate') result = 'D'

  const clock = game.clock
  const timeControl = clock ? `${Math.round(clock.initial / 60)}+${clock.increment}` : game.speed

  const userPlayer = isWhite ? game.players.white : game.players.black
  return {
    pgn: game.pgn,
    opponent: opponent.user?.name ?? '?',
    opponentRating: opponent.rating,
    userRating: userPlayer.rating,
    result,
    timeControl,
    date: formatTimestamp(game.createdAt),
    isWhite,
  }
}

export default function GameSelector({ games, username, platform, onGameLoaded }: GameSelectorProps) {
  const setPgn = useGameStore(s => s.setPgn)
  const setUserColor = useGameStore(s => s.setUserColor)
  const setUserElo = useGameStore(s => s.setUserElo)
  const setPlatform = useGameStore(s => s.setPlatform)
  const reset = useGameStore(s => s.reset)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0
  }, [games])

  const normalized = useMemo(() => games.map(g =>
    isChessComGame(g)
      ? normalizeChessCom(g, username)
      : normalizeLichess(g as LichessGame, username)
  ), [games, username])

  if (games.length === 0) {
    return <div className="game-list-empty">No games found.</div>
  }

  function handleSelect(rawPgn: string, isWhite: boolean, userRating?: number) {
    reset()
    setUserColor(isWhite ? 'white' : 'black')
    if (userRating && userRating > 0) setUserElo(userRating)
    setPlatform(platform)
    setPgn(cleanPgn(rawPgn))
    onGameLoaded()
  }

  return (
    <>
    <div className="game-list-count">{games.length} game{games.length !== 1 ? 's' : ''}</div>
    <div className="game-list" ref={listRef}>
      {normalized.map((g) => (
        <button
          key={g.opponent + g.date}
          className="game-row"
          onClick={() => handleSelect(g.pgn, g.isWhite, g.userRating)}
        >
          <span className="game-row__players">
            <span className="game-row__color-dot" data-color={g.isWhite ? 'white' : 'black'} />
            <span className="game-row__username">{username}</span>
            <span className="game-row__vs">vs</span>
            <span className="game-row__color-dot" data-color={g.isWhite ? 'black' : 'white'} />
            <span className="game-row__opponent">{g.opponent}<span className="game-row__rating"> ({g.opponentRating})</span></span>
          </span>
          <span className={`game-row__result game-row__result--${g.result.toLowerCase()}`}>
            {g.result}
          </span>
          <span className="game-row__meta">{g.timeControl}</span>
          <span className="game-row__meta">{g.date}</span>
        </button>
      ))}
    </div>
    </>
  )
}
