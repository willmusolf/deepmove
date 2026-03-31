// types.ts — Shared TypeScript types for the chess analysis pipeline
// All types used across feature extraction, classification, and the coaching pipeline

export type Color = 'white' | 'black'
export type GamePhase = 'opening' | 'early_middlegame' | 'middlegame' | 'late_middlegame' | 'endgame'
export type PieceName = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king'
export type MistakeCategory =
  | 'hung_piece'
  | 'ignored_threat'
  | 'missed_tactic'
  | 'aimless_move'
  | 'didnt_develop'
  | 'didnt_castle'
  | 'unknown'
export type MistakeType = 'tactical' | 'strategic'

export interface MaterialCount {
  pawns: number
  knights: number
  bishops: number
  rooks: number
  queens: number
}

export interface PawnAnalysis {
  isolatedPawns: string[]    // square names, e.g. ["d4"]
  doubledPawns: string[]
  backwardPawns: string[]
  passedPawns: string[]
  pawnIslands: number
}

export interface KingSafetyScore {
  castled: 'kingside' | 'queenside' | 'none'
  pawnShieldIntegrity: number  // 0-3 (pawns in front of king)
  openFilesNearKing: string[]
  score: number                // 0 (safe) to 100 (critical danger)
}

export interface PieceActivityScore {
  totalMobility: number        // sum of legal moves across all pieces
  centralizedPieces: number
  passivePieces: string[]      // squares of passive/blocked pieces
  badBishop: string | null     // square of bad bishop, if present
}

export interface DevelopmentStatus {
  developedMinorPieces: number // 0-4 (N+B)
  undevelopedMinorPieces: number
  rooksConnected: boolean
  castled: boolean
  earlyQueenMove: boolean
  sameMovedTwice: boolean
}

export interface ThreatAnalysis {
  hangingPieces: { square: string; piece: string; attackedBy: string[] }[]
  piecesLeftUndefended: { square: string; piece: string; wasDefendedBy: string }[]
  threatsIgnored: { description: string; opponentMove: string; threat: string }[]
  threatsCreated: { square: string; type: string }[]
}

export interface MoveImpact {
  description: string
  pieceMoved: string
  fromSquare: string
  toSquare: string
  wasCapture: boolean
  wasCheck: boolean
  changedKingSafety: boolean
  changedPawnStructure: boolean
  developedPiece: boolean
  improvedPieceActivity: boolean
  createdWeakness: boolean
  hadClearPurpose: boolean
}

export interface PositionFeatures {
  material: {
    white: MaterialCount
    black: MaterialCount
    balance: number
    hasBishopPair: { white: boolean; black: boolean }
  }
  pawnStructure: {
    white: PawnAnalysis
    black: PawnAnalysis
    structureType: 'open' | 'closed' | 'semi-open' | 'symmetrical'
  }
  kingSafety: {
    white: KingSafetyScore
    black: KingSafetyScore
  }
  pieceActivity: {
    white: PieceActivityScore
    black: PieceActivityScore
    worstPiece: { color: Color; piece: string; square: string; reason: string } | null
  }
  development: {
    white: DevelopmentStatus
    black: DevelopmentStatus
  }
  files: {
    openFiles: string[]
    halfOpenFiles: { white: string[]; black: string[] }
  }
  gamePhase: GamePhase
  threats: ThreatAnalysis
  moveImpact: MoveImpact
  engineMoveImpact: {
    description: string
    mainIdea: string
    bestMoveSan: string | null
    isCapture: boolean
    givesCheck: boolean
    isCastle: boolean
    developsPiece: boolean
    isForcing: boolean
  }
}

export interface ExtractionInput {
  fen: string
  fenAfter: string
  movePlayed: string       // SAN notation
  engineBest: string[]     // Top engine moves in SAN
  evalBefore: number       // Centipawns (positive = white advantage)
  evalAfter: number
  moveNumber: number
  color: Color
  timeControl: string      // seconds, e.g. "600"
  userElo: number
  opponentElo: number
}

export interface ClassificationResult {
  principleId: string
  confidence: number       // 0-100
  eloGateMin: number
  eloGateMax: number
}

export interface AnalysisFacts {
  category: MistakeCategory
  categoryName: string
  mistakeType: MistakeType
  primaryIssue: string
  moveEffect: string
  missedResponsibility: string
  betterIdea: string
  consequence: string
  factList: string[]
}

export interface CriticalMoment {
  moveNumber: number
  color: Color
  fen: string
  fenAfter: string
  movePlayed: string
  engineBest: string[]
  evalBefore: number
  evalAfter: number
  evalSwing: number        // absolute centipawn swing
  features: PositionFeatures
  analysisFacts: AnalysisFacts | null
  classification: ClassificationResult | null
}

// ─── Move tree (variation support) ─────────────────────────────────────────

import type { MoveGrade } from '../engine/analysis'

/** One half-move node in the game tree */
export interface MoveNode {
  id: string            // "m0"…"mN" for main line; "m5-b1" style for branches
  san: string
  from: string
  to: string
  fen: string           // FEN after this move
  grade?: MoveGrade
  clockTime?: string  // time remaining for that player after this move, from PGN %clk
  childIds: string[]    // [0] = main line continuation, [1+] = branch alternatives
  parentId: string | null
  moveNumber: number    // chess move number (1-based)
  color: 'white' | 'black'
  isMainLine: boolean
}

/** Flat map of all nodes keyed by id */
export type MoveTree = Record<string, MoveNode>
