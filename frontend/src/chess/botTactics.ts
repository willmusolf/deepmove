import { Chess, type Square } from 'chess.js'
import { PIECE_VALUES } from './material'

interface VerboseMove {
  from: string
  to: string
  piece: string
  captured?: string
  promotion?: string
  san: string
}

export interface ObviousCaptureCandidate {
  uci: string
  san: string
  targetValue: number
  attackerValue: number
  score: number
}

function moveToUci(move: Pick<VerboseMove, 'from' | 'to' | 'promotion'>): string {
  return `${move.from}${move.to}${move.promotion ?? ''}`
}

function getMinimumTargetValue(botElo: number): number {
  if (botElo < 800) return 5
  if (botElo <= 1200) return 3
  return 1
}

function parseMoveMeta(fen: string, uci: string): { isCapture: boolean; givesCheck: boolean } | null {
  try {
    const chess = new Chess(fen)
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4] ?? 'q',
    })
    if (!move) return null
    return {
      isCapture: Boolean(move.captured),
      givesCheck: move.san.includes('+') || move.san.includes('#'),
    }
  } catch {
    return null
  }
}

export function findObviousCapture(fen: string, botElo: number): ObviousCaptureCandidate | null {
  const chess = new Chess(fen)
  const ourColor = chess.turn()
  const oppColor = ourColor === 'w' ? 'b' : 'w'
  const minTargetValue = getMinimumTargetValue(botElo)

  const legalMoves = chess.moves({ verbose: true }) as VerboseMove[]
  const candidates = legalMoves.flatMap((move) => {
    if (!move.captured) return []

    const targetValue = PIECE_VALUES[move.captured] ?? 0
    const attackerValue = PIECE_VALUES[move.piece] ?? 0
    if (targetValue < minTargetValue) return []

    const targetSquare = move.to as Square
    const targetIsLoose = !chess.isAttacked(targetSquare, oppColor)

    const after = new Chess(fen)
    const applied = after.move({
      from: move.from,
      to: move.to,
      promotion: move.promotion ?? 'q',
    })
    if (!applied) return []

    const destinationSafe = !after.isAttacked(targetSquare, oppColor)
    const destinationDefended = after.isAttacked(targetSquare, ourColor)
    const favorableEvenIfRecaptured = targetValue - attackerValue >= 2
    const isObviousWin =
      (targetIsLoose && (destinationSafe || destinationDefended || targetValue >= attackerValue))
      || favorableEvenIfRecaptured

    if (!isObviousWin) return []

    const score =
      targetValue * 100
      + (targetIsLoose ? 120 : 0)
      + (destinationSafe ? 70 : 0)
      + (destinationDefended ? 35 : 0)
      + Math.max(0, targetValue - attackerValue) * 45

    return [{
      uci: moveToUci(move),
      san: move.san,
      targetValue,
      attackerValue,
      score,
    }]
  })

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (b.targetValue !== a.targetValue) return b.targetValue - a.targetValue
    return a.attackerValue - b.attackerValue
  })

  return candidates[0] ?? null
}

export function chooseMaterialAwareBotMove(fen: string, engineMove: string, botElo: number): string {
  const candidate = findObviousCapture(fen, botElo)
  if (!candidate || candidate.uci === engineMove) return engineMove

  const engineMoveMeta = parseMoveMeta(fen, engineMove)
  if (engineMoveMeta?.isCapture || engineMoveMeta?.givesCheck) return engineMove

  return candidate.uci
}
