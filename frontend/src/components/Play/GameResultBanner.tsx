import type { GameResult, GameEndReason } from '../../stores/playStore'

interface Props {
  result: GameResult
  reason: GameEndReason
  onReview: () => void
  onNewGame: () => void
}

function getOutcomeLabel(result: GameResult): string {
  if (result === 'user-win') return 'Victory'
  if (result === 'user-loss') return 'Defeat'
  if (result === 'draw') return 'Draw'
  return 'Finished'
}

function getIcon(result: GameResult): string {
  if (result === 'user-win') return '✦'
  if (result === 'user-loss') return '•'
  return '½'
}

function getHeadline(result: GameResult, reason: GameEndReason): string {
  if (reason === 'checkmate') return result === 'user-win' ? 'Checkmate' : 'Checkmated'
  if (reason === 'stalemate') return 'Stalemate'
  if (reason === 'insufficient-material') return 'Drawn Position'
  if (reason === 'threefold') return 'Threefold Repetition'
  if (reason === 'fifty-move') return 'Fifty-Move Rule'
  if (reason === 'user-time') return 'Flagged'
  if (reason === 'bot-time') return 'Time Win'
  if (reason === 'resigned') return result === 'user-loss' ? 'Resigned' : 'Resignation'
  if (result === 'user-win') return 'You Win'
  if (result === 'user-loss') return 'You Lose'
  if (result === 'draw') return 'Draw'
  return 'Game Over'
}

function getDetail(result: GameResult, reason: GameEndReason): string {
  if (reason === 'checkmate') {
    return result === 'user-win'
      ? 'You converted the attack and finished the game cleanly.'
      : 'Stockfish found mate. Review the finish to see where it turned.'
  }
  if (reason === 'stalemate') return 'No legal moves remain, and the king is safe.'
  if (reason === 'insufficient-material') return 'Neither side had enough material to force mate.'
  if (reason === 'threefold') return 'The same position appeared three times.'
  if (reason === 'fifty-move') return 'Fifty moves passed without a pawn move or capture.'
  if (reason === 'user-time') return 'Your clock hit zero before you could finish the game.'
  if (reason === 'bot-time') return 'Stockfish ran out of time and you got the full point.'
  if (reason === 'resigned') {
    return result === 'user-loss'
      ? 'You ended the game by resignation.'
      : 'The game ended by resignation.'
  }
  return result === 'draw'
    ? 'A balanced finish.'
    : 'Game complete.'
}

export default function GameResultBanner({ result, reason, onReview, onNewGame }: Props) {
  const outcomeLabel = getOutcomeLabel(result)
  const title = getHeadline(result, reason)
  const detail = getDetail(result, reason)
  const icon = getIcon(result)
  const isWin = result === 'user-win'
  const isDraw = result === 'draw'
  const isLoss = result === 'user-loss'

  return (
    <div className={`game-result-banner${isWin ? ' game-result-banner--win' : isDraw ? ' game-result-banner--draw' : ' game-result-banner--loss'}`}>
      <div className="game-result-badge-row">
        <div className="game-result-icon-shell">
          <div className="game-result-icon">{icon}</div>
        </div>
        <div className="game-result-badge">{outcomeLabel}</div>
      </div>
      <div className="game-result-title">{title}</div>
      <div className="game-result-copy">{detail}</div>
      <div className="game-result-actions">
        <button
          className={`game-result-btn ${isLoss ? 'game-result-btn--primary' : 'game-result-btn--secondary'}`}
          onClick={onReview}
        >
          Review This Game
        </button>
        <button
          className={`game-result-btn ${isLoss ? 'game-result-btn--secondary' : 'game-result-btn--primary'}`}
          onClick={onNewGame}
        >
          Play Again
        </button>
      </div>
    </div>
  )
}
