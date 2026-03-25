// classifier.ts — Rules-based principle classifier
// Input: PositionFeatures + context
// Output: ClassificationResult with principle ID + confidence score (0-100)
//
// PRIORITY QUEUE RULE (from CLAUDE.md):
//   If TACTICAL_01 or TACTICAL_02 triggers → suppress ALL other classifications.
//   A hanging piece is always the lesson. Never also mention pawn structure.
//
// Confidence scoring:
//   90-100: One clear principle, strong signals (e.g. piece literally hanging)
//   70-89:  Likely principle, somewhat complex position
//   50-69:  Multiple principles could apply → use simplified fallback lesson
//   <50:    Too ambiguous → describe what changed without asserting a principle
//
// Classifier evaluates rules in this priority order:
//   1. TACTICAL_01 — blunder check (hanging piece created by user's move)
//   2. TACTICAL_02 — ignored opponent threat (threat existed before, user didn't respond)
//   3. OPENING_02  — castle early
//   4. OPENING_01  — complete development
//   5. OPENING_05  — don't move same piece twice
//   6. Fallback    — null (no confident principle)
//
// Tests: frontend/src/chess/__tests__/classifier.test.ts

import type { PositionFeatures, ClassificationResult, CriticalMoment } from './types'
import { PRINCIPLES } from './taxonomy'

/** Check if a principle is appropriate for the user's Elo */
export function isInEloGate(principleId: string, userElo: number): boolean {
  const principle = PRINCIPLES[principleId]
  if (!principle) return false
  return userElo >= principle.eloMin && userElo <= principle.eloMax
}

function makeResult(principleId: string, confidence: number): ClassificationResult {
  const { eloMin = 0, eloMax = 9999 } = PRINCIPLES[principleId] ?? {}
  return { principleId, confidence, eloGateMin: eloMin, eloGateMax: eloMax }
}

export function classifyPrinciple(
  features: PositionFeatures,
  moment: Pick<CriticalMoment, 'evalSwing' | 'moveNumber' | 'color'>,
  userElo: number,
): ClassificationResult | null {
  const { threats, development, gamePhase } = features
  const cpLoss = moment.evalSwing
  const moveNumber = moment.moveNumber

  // ── 1. TACTICAL_01 — Blunder Check (hanging piece after user's move) ────────
  // A piece is now hanging that wasn't necessarily hanging before.
  // The user's move created or exposed a hanging piece.
  if (
    isInEloGate('TACTICAL_01', userElo) &&
    threats.hangingPieces.length > 0 &&
    cpLoss >= 150
  ) {
    const confidence = Math.min(95, 70 + Math.floor(cpLoss / 10))
    return makeResult('TACTICAL_01', confidence)
  }

  // ── 2. TACTICAL_02 — Ignored Opponent Threat ────────────────────────────────
  // The piece was already threatened before the user's move, and user ignored it.
  if (
    isInEloGate('TACTICAL_02', userElo) &&
    threats.threatsIgnored.length > 0 &&
    cpLoss >= 100
  ) {
    const confidence = Math.min(90, 65 + Math.floor(cpLoss / 8))
    return makeResult('TACTICAL_02', confidence)
  }

  // ── 3. OPENING_02 — Castle Early ────────────────────────────────────────────
  // In opening, king still uncastled after move 10.
  const userDev = moment.color === 'white' ? development.white : development.black
  if (
    isInEloGate('OPENING_02', userElo) &&
    (gamePhase === 'opening' || gamePhase === 'early_middlegame') &&
    !userDev.castled &&
    moveNumber > 10
  ) {
    return makeResult('OPENING_02', 75)
  }

  // ── 4. OPENING_01 — Complete Development ────────────────────────────────────
  // Still has 2+ minor pieces undeveloped in opening phase.
  if (
    isInEloGate('OPENING_01', userElo) &&
    (gamePhase === 'opening' || gamePhase === 'early_middlegame') &&
    userDev.undevelopedMinorPieces >= 2
  ) {
    return makeResult('OPENING_01', 72)
  }

  // ── 5. OPENING_05 — Don't Move Same Piece Twice ─────────────────────────────
  if (
    isInEloGate('OPENING_05', userElo) &&
    gamePhase === 'opening' &&
    userDev.sameMovedTwice
  ) {
    return makeResult('OPENING_05', 78)
  }

  // ── Fallback: no confident principle ────────────────────────────────────────
  return null
}

/**
 * Parse a FEN string and return the piece on a given square, or null.
 * Returns { type: 'p'|'n'|'b'|'r'|'q'|'k', color: 'w'|'b' } or null.
 */
function getPieceOnSquare(fen: string, square: string): { type: string; color: 'w' | 'b' } | null {
  const boardPart = fen.split(' ')[0]
  const ranks = boardPart.split('/')
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0)   // 0-7
  const rank = 8 - parseInt(square[1], 10)                  // 0-7 (rank 8 = index 0)
  if (rank < 0 || rank > 7 || file < 0 || file > 7) return null
  const rankStr = ranks[rank]
  let col = 0
  for (const ch of rankStr) {
    if (ch >= '1' && ch <= '8') {
      col += parseInt(ch, 10)
    } else {
      if (col === file) {
        return { type: ch.toLowerCase(), color: ch === ch.toUpperCase() ? 'w' : 'b' }
      }
      col++
    }
  }
  return null
}

/**
 * Build the verified_facts list sent to the LLM.
 * Translates features + classification into plain-English sentences the coach uses.
 */
export function buildVerifiedFacts(
  features: PositionFeatures,
  moment: Pick<CriticalMoment, 'evalSwing' | 'moveNumber' | 'color' | 'movePlayed' | 'fen' | 'fenAfter'>,
  principleId: string | null | undefined,
): string[] {
  const facts: string[] = []
  const { threats, development, moveImpact, gamePhase, material } = features

  // Derive factual outcome of the move: was the destination square piece captured?
  // Parse fenAfter to check if the moved piece is still on its destination square.
  // moveImpact.toSquare tells us where it landed; if opponent's fenAfter shows a
  // different piece there (or nothing), the piece was captured in response.
  // We use the fenAfter's side-to-move: if it's now the opponent's turn and the
  // piece is on toSquare, it was NOT captured yet.
  const destSquare = moveImpact.toSquare
  const pieceOnDest = destSquare ? getPieceOnSquare(moment.fenAfter, destSquare) : null
  const movedPieceType = moveImpact.pieceMoved   // 'p','n','b','r','q','k'
  const movedPieceColor = moment.color === 'white' ? 'w' : 'b'
  // In fenAfter it's opponent's turn, but the piece we moved should still be there
  // (it won't be captured until the NEXT move). So "still on dest" is almost always true
  // right after the move — but we can detect if it was en-passant capture gone or similar.
  const movedPieceStillOnDest = pieceOnDest !== null &&
    pieceOnDest.type === movedPieceType &&
    pieceOnDest.color === movedPieceColor

  // Was check given? The fenAfter string after the board has a check marker in SAN,
  // but we can also detect from fenAfter whether the opponent's king is in check.
  const gaveCheck = moment.movePlayed.includes('+') || moment.movePlayed.includes('#')
  const userDev = moment.color === 'white' ? development.white : development.black

  facts.push(`Move ${moment.moveNumber}: ${moment.movePlayed} (eval swing: ${moment.evalSwing}cp)`)
  if (gaveCheck) {
    facts.push(`This move gave CHECK — the opponent's king was under attack and had to respond to the check (NOT capture the moved piece)`)
  }
  // Critical fact: prevent LLM from assuming the piece was captured after the move
  if (destSquare) {
    if (movedPieceStillOnDest) {
      if (!gaveCheck) {
        facts.push(`After this move, the ${PIECE_NAME_MAP[movedPieceType] ?? movedPieceType} is still on ${destSquare} — it was NOT immediately captured by the opponent`)
      }
    }
  }
  facts.push(`Game phase: ${gamePhase}`)

  const balanceStr = material.balance === 0
    ? 'material is equal'
    : material.balance > 0
      ? `white is ahead by ${material.balance} material points`
      : `black is ahead by ${Math.abs(material.balance)} material points`
  facts.push(`Material: ${balanceStr}`)

  if (threats.hangingPieces.length > 0) {
    for (const hp of threats.hangingPieces) {
      const name = PIECE_NAME_MAP[hp.piece] ?? hp.piece
      const attackers = hp.attackedBy.length > 0 ? ` (attacked from ${hp.attackedBy.join(', ')})` : ''
      facts.push(`${name} on ${hp.square} is hanging — undefended and under attack${attackers}`)
    }
  }

  if (principleId === 'TACTICAL_01' && threats.hangingPieces.length > 0) {
    const hp = threats.hangingPieces[0]
    const name = PIECE_NAME_MAP[hp.piece] ?? hp.piece
    facts.push(`The ${name} on ${hp.square} has no defender — opponent can take it for free next move`)
    if (threats.piecesLeftUndefended.length > 0) {
      const pu = threats.piecesLeftUndefended[0]
      const defName = PIECE_NAME_MAP[pu.piece] ?? pu.piece
      facts.push(`The moved piece was the only defender of the ${defName} on ${pu.square}`)
    }
  }

  if (threats.threatsIgnored.length > 0) {
    for (const ti of threats.threatsIgnored) {
      facts.push(`Threat ignored: ${ti.description}`)
    }
  }

  if (principleId === 'TACTICAL_02' && threats.threatsIgnored.length > 0) {
    const ti = threats.threatsIgnored[0]
    facts.push(`Opponent's move (${ti.opponentMove}) created a direct threat: ${ti.description}`)
    facts.push(`User's move (${moment.movePlayed}) did not address this — attack succeeded`)
  }

  if (threats.piecesLeftUndefended.length > 0) {
    for (const pu of threats.piecesLeftUndefended) {
      const name = PIECE_NAME_MAP[pu.piece] ?? pu.piece
      facts.push(`${name} on ${pu.square} became undefended after this move`)
    }
  }

  if (principleId === 'OPENING_01' || principleId === 'OPENING_02' || principleId === 'OPENING_05') {
    const opponentDev = moment.color === 'white' ? development.black : development.white
    facts.push(`Minor pieces still undeveloped: ${userDev.undevelopedMinorPieces} of 4`)
    facts.push(`Castled: ${userDev.castled ? 'yes' : 'no'}`)
    // Compare to opponent development — helps the coach paint a contrast
    if (opponentDev.undevelopedMinorPieces < userDev.undevelopedMinorPieces) {
      facts.push(`Opponent has ${opponentDev.undevelopedMinorPieces} undeveloped minor pieces — better developed than you`)
    }
    if (opponentDev.castled && !userDev.castled) {
      facts.push(`Opponent has already castled — their king is safe while yours is exposed`)
    }
    if (userDev.earlyQueenMove) facts.push('Early queen move detected in this game')
    if (userDev.sameMovedTwice) facts.push('Same piece moved twice in the opening — costs a tempo, opponent gets free development')
    if (userDev.undevelopedMinorPieces >= 2)
      facts.push(`With ${userDev.undevelopedMinorPieces} pieces not yet off the back rank, coordination is impossible`)
    if (!userDev.castled && moment.moveNumber > 10)
      facts.push(`King still uncastled on move ${moment.moveNumber} — exposed in the center`)
  }

  const pieceName = PIECE_NAME_MAP[moveImpact.pieceMoved] ?? moveImpact.pieceMoved
  facts.push(`User's move: ${moveImpact.description}`)
  facts.push(`Piece moved: ${pieceName} from ${moveImpact.fromSquare} to ${moveImpact.toSquare}`)
  if (!moveImpact.hadClearPurpose) facts.push(`This move achieved nothing concrete — no capture, check, development, or castling. It was a "nothing move."`)
  if (moveImpact.developedPiece) facts.push(`This move developed a piece off the back rank`)
  if (moveImpact.wasCapture) facts.push(`This move was a capture`)
  if (moveImpact.wasCheck) facts.push(`This move gave check`)
  if (moveImpact.createdWeakness) facts.push(`This move created a weakness in the pawn structure or king safety`)
  if (moveImpact.changedPawnStructure) facts.push(`This move changed the pawn structure`)

  // King safety context — useful for middlegame lessons
  const userKS = moment.color === 'white' ? features.kingSafety.white : features.kingSafety.black
  const opponentKS = moment.color === 'white' ? features.kingSafety.black : features.kingSafety.white
  if (userKS.castled === 'none' && features.gamePhase !== 'endgame') {
    facts.push(`User's king has not castled (still in the center)`)
  }
  if (userKS.score >= 60) {
    facts.push(`User's king safety is poor (score ${userKS.score}/100) — ${userKS.openFilesNearKing.length > 0 ? 'open files near king' : 'weak pawn shield'}`)
  }
  if (opponentKS.score >= 60) {
    facts.push(`Opponent's king is also vulnerable (score ${opponentKS.score}/100)`)
  }

  // Piece activity context — passive pieces are coaching gold
  const userActivity = moment.color === 'white' ? features.pieceActivity.white : features.pieceActivity.black
  if (userActivity.passivePieces.length > 0) {
    facts.push(`User has passive pieces on: ${userActivity.passivePieces.join(', ')}`)
  }
  if (userActivity.badBishop) {
    facts.push(`User has a bad bishop on ${userActivity.badBishop} (blocked by own pawns)`)
  }

  // Pawn structure context
  const userPawns = moment.color === 'white' ? features.pawnStructure.white : features.pawnStructure.black
  if (userPawns.isolatedPawns.length > 0) {
    facts.push(`User has isolated pawns on: ${userPawns.isolatedPawns.join(', ')}`)
  }
  if (userPawns.passedPawns.length > 0) {
    facts.push(`User has passed pawns on: ${userPawns.passedPawns.join(', ')}`)
  }

  // Engine move idea — what the better move would have achieved
  if (features.engineMoveImpact.description) {
    facts.push(features.engineMoveImpact.description)
  }
  if (features.engineMoveImpact.mainIdea) {
    facts.push(features.engineMoveImpact.mainIdea)
  }

  return facts
}

const PIECE_NAME_MAP: Record<string, string> = {
  p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King',
}
