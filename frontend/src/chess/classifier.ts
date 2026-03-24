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
 * Build the verified_facts list sent to the LLM.
 * Translates features + classification into plain-English sentences the coach uses.
 */
export function buildVerifiedFacts(
  features: PositionFeatures,
  moment: Pick<CriticalMoment, 'evalSwing' | 'moveNumber' | 'color' | 'movePlayed'>,
  principleId: string | null | undefined,
): string[] {
  const facts: string[] = []
  const { threats, development, moveImpact, gamePhase, material } = features
  const userDev = moment.color === 'white' ? development.white : development.black

  facts.push(`Move ${moment.moveNumber}: ${moment.movePlayed} (eval swing: ${moment.evalSwing}cp)`)
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
