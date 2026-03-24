import type { GameResult, GameEndReason } from '../../stores/playStore'

interface Props {
  result: GameResult
  reason: GameEndReason
  onReview: () => void
  onNewGame: () => void
}

function getTitle(result: GameResult): string {
  if (result === 'user-win') return 'You Win!'
  if (result === 'user-loss') return 'You Lose.'
  if (result === 'draw') return 'Draw'
  return 'Game Over'
}

function getIcon(result: GameResult): string {
  if (result === 'user-win') return '✓'
  if (result === 'user-loss') return '✗'
  return '—'
}

function getSubtitle(reason: GameEndReason): string {
  if (reason === 'checkmate') return 'by checkmate'
  if (reason === 'stalemate') return 'by stalemate'
  if (reason === 'insufficient-material') return 'insufficient material'
  if (reason === 'threefold') return 'by threefold repetition'
  if (reason === 'fifty-move') return 'by fifty-move rule'
  if (reason === 'user-time') return 'you ran out of time'
  if (reason === 'bot-time') return 'bot ran out of time'
  if (reason === 'resigned') return 'you resigned'
  return ''
}

export default function GameResultBanner({ result, reason, onReview, onNewGame }: Props) {
  const title = getTitle(result)
  const subtitle = getSubtitle(reason)
  const icon = getIcon(result)
  const isWin = result === 'user-win'
  const isDraw = result === 'draw'

  return (
    <div className={`game-result-banner${isWin ? ' game-result-banner--win' : isDraw ? ' game-result-banner--draw' : ' game-result-banner--loss'}`}>
      <div className="game-result-icon">{icon}</div>
      <div className="game-result-title">{title}</div>
      {subtitle && <div className="game-result-subtitle">{subtitle}</div>}
      <div className="game-result-actions">
        <button className="game-result-btn game-result-btn--primary" onClick={onReview}>
          Review This Game
        </button>
        <button className="game-result-btn game-result-btn--secondary" onClick={onNewGame}>
          New Game
        </button>
      </div>
    </div>
  )
}
