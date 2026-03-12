# DeepMove — Chess Feature Extraction Engine Design

## Purpose

The feature extraction engine is the chess intelligence layer of DeepMove. It takes a FEN position and outputs structured, verified positional facts that the principle classifier and LLM use to generate coaching lessons.

**Critical rule:** This code must be correct. A wrong feature extraction leads to a wrong principle classification leads to a wrong coaching lesson. Every extractor must have comprehensive unit tests.

## Input/Output Contract

**Input:** A FEN string + the move played + the engine's preferred move + game metadata

```typescript
interface ExtractionInput {
  fen: string;              // Position before the move
  fenAfter: string;         // Position after the move was played
  movePlayed: string;       // The user's move in SAN (e.g., "a3")
  engineBest: string[];     // Stockfish top moves (e.g., ["Bg2", "d5"])
  evalBefore: number;       // Centipawn eval before move
  evalAfter: number;        // Centipawn eval after move
  moveNumber: number;
  color: "white" | "black"; // Which side the user was playing
  timeControl: string;      // e.g., "600" (10 min), "180" (3 min)
  userElo: number;
  opponentElo: number;
}
```

**Output:** Structured positional features

```typescript
interface PositionFeatures {
  // Material
  material: {
    white: MaterialCount;    // { pawns, knights, bishops, rooks, queens }
    black: MaterialCount;
    balance: number;         // Positive = white advantage in centipawns
    hasBishopPair: { white: boolean; black: boolean };
  };

  // Pawn Structure
  pawnStructure: {
    white: PawnAnalysis;
    black: PawnAnalysis;
    structureType: string;   // "open", "closed", "semi-open", "symmetrical"
    tension: TensionPoint[]; // Pawns that can capture each other
  };

  // King Safety
  kingSafety: {
    white: KingSafetyScore;
    black: KingSafetyScore;
  };

  // Piece Activity
  pieceActivity: {
    white: PieceActivityScore;
    black: PieceActivityScore;
    worstPiece: { color: string; piece: string; square: string; reason: string } | null;
  };

  // Development (opening/early middlegame)
  development: {
    white: DevelopmentStatus;
    black: DevelopmentStatus;
  };

  // Files
  files: {
    openFiles: string[];      // Files with no pawns (e.g., ["e"])
    halfOpenFiles: { white: string[]; black: string[] };
    controlledBy: Record<string, "white" | "black" | "contested" | "empty">;
  };

  // Game Phase
  gamePhase: "opening" | "early_middlegame" | "middlegame" | "late_middlegame" | "endgame";

  // What the user's move actually did
  moveImpact: {
    description: string;     // Human-readable: "moved the a-pawn forward with no clear purpose"
    pieceMoved: string;
    fromSquare: string;
    toSquare: string;
    wasCapture: boolean;
    wasCheck: boolean;
    changedKingSafety: boolean;
    changedPawnStructure: boolean;
    developedPiece: boolean;
    improvedPieceActivity: boolean;
    createdWeakness: boolean;
  };

  // What the engine's move would have done
  engineMoveImpact: {
    description: string;
    mainIdea: string;        // e.g., "places the bishop on the long diagonal for maximum activity"
  };
}
```

## Extractors (MVP)

### 1. Material Counter
**Difficulty:** Easy
**What it does:** Counts pieces for both sides, calculates material balance, detects bishop pair.

```
Standard values: P=100, N=320, B=330, R=500, Q=900
Bishop pair bonus: +50 centipawns
```

**Test cases:**
- Starting position: equal material
- Position after a piece sacrifice: detect the imbalance
- Endgame with R vs B+N: correctly evaluate

### 2. Pawn Structure Analyzer
**Difficulty:** Medium
**What it does:** Identifies pawn weaknesses and structure type.

**Detects:**
- Isolated pawns: no friendly pawns on adjacent files
- Doubled pawns: two+ pawns on the same file
- Backward pawns: pawn that cannot be supported by adjacent pawns and is on a half-open file
- Passed pawns: no opposing pawns can block or capture it on its way to promotion
- Pawn chains: connected diagonal pawn structures
- Pawn islands: groups of connected pawns (fewer = better)
- Structure type: open (few pawns, many open files), closed (locked pawn chains), semi-open

**Test cases:**
- Carlsbad structure (d4/c4 vs d5/e6): detect semi-open c-file, minority attack potential
- French structure (e5 vs d5/e6): detect closed center, space advantage
- Isolated queen pawn: detect the d4 isolani
- Symmetrical structure: detect no structural imbalances

### 3. King Safety Scorer
**Difficulty:** Medium
**What it does:** Evaluates king safety for both sides.

**Factors:**
- Has the king castled? (kingside/queenside/not castled)
- Pawn shield integrity: are the pawns in front of the castled king still there?
  - f2/g2/h2 pawns for white kingside castling
  - Score: 3 pawns intact = safe, 2 = slightly weakened, 1 = dangerous, 0 = very exposed
- Pawn storm: are enemy pawns advancing toward the king?
- Open files near the king: is there an open or half-open file adjacent to the king?
- Pieces aimed at the king: count enemy pieces with lines toward the king's area
- King exposure: is the king in the center with the position open? (very dangerous)

**Output:** Score from 0 (completely safe) to 100 (critical danger)

**Test cases:**
- Castled position with intact pawn shield: safe
- Castled with g-pawn pushed (g3/g6): slightly weakened
- Uncastled king with open center: dangerous
- Opposite side castling with pawn storms: both sides in danger

### 4. Piece Activity Evaluator
**Difficulty:** Medium-Hard
**What it does:** Assesses how active each piece is.

**For each piece, evaluate:**
- Number of squares it controls/attacks
- Is it centralized? (e4/d4/e5/d5 for knights are best)
- Is it blocked by own pawns? (bishops behind own pawn chain)
- Is it on a useful square? (rook on open file, knight on outpost)
- Is it doing anything? (a piece with no targets or influence)

**Special detection:**
- Bad bishop: bishop blocked by own pawns on its color
- Good bishop: bishop on the opposite color of its pawns, controlling open diagonals
- Knight outpost: knight on a square that can't be attacked by enemy pawns
- Rook on open/half-open file
- Rook on 7th rank (powerful in middlegame/endgame)

**Output:** Per-piece activity score + identification of "worst piece" for each side

**Test cases:**
- Bishop blocked by e3/d4/c5 pawn chain: detect bad bishop
- Knight on d5 with no opposing e/f pawns: detect outpost
- Rook on open e-file: detect active rook
- Piece on the back rank doing nothing: detect passive piece

### 5. Development Tracker
**Difficulty:** Easy
**What it does:** Counts developed pieces and assesses development status.

**Tracks:**
- How many minor pieces (N, B) are developed off back rank?
- Have rooks connected (no pieces between them on back rank)?
- Has the king castled?
- Have any pieces moved twice in the opening? (usually bad before development is complete)
- Is the queen developed early? (usually bad before minor pieces)

**Game phase:** Only relevant in opening/early middlegame (moves 1-15)

### 6. Game Phase Detector
**Difficulty:** Easy
**What it does:** Determines the current game phase.

```
Opening:          move 1-10 AND queens on board AND most pieces on board
Early middlegame: move 8-15 AND most pieces on board
Middlegame:       move 12-30 AND queens on board
Late middlegame:  move 20-35 AND reduced material
Endgame:          queens off board OR total material < threshold
```

Material threshold for endgame: less than queen + rook equivalent per side remaining (excluding kings and pawns).

### 7. Move Impact Analyzer
**Difficulty:** Medium
**What it does:** Describes what the user's move actually did and what changed.

**Compares the position before and after the move:**
- Which piece moved and where?
- Was it a capture? What was captured?
- Did it change the pawn structure? (pawn move or capture involving pawns)
- Did it affect king safety? (pawn in front of king moved, or piece defending king moved)
- Did it develop a piece? (piece moved off back rank for first time)
- Did it improve or worsen piece activity?
- Did it create a weakness? (left a square undefended, created an isolated pawn)
- Was it a "nothing move"? (no clear purpose — common in sub-1400 games)

### 8. Threat Analyzer
**Difficulty:** Medium
**What it does:** Detects hanging pieces, ignored threats, and threat creation. CRITICAL for sub-1400 coaching — this is the "leaky roof" detector.

**Detects:**
- Hanging pieces: pieces that are attacked by opponent and not defended (or defended by fewer pieces than attacking)
- Pieces that BECAME undefended after the user's move (user moved a defender away)
- Opponent threats ignored: opponent's last move attacked something, and user's response didn't address it
- Threats created by the user's move (checks, attacks on higher-value pieces)
- Newly undefended squares near the king

**Output:**
```typescript
interface ThreatAnalysis {
  hangingPieces: { square: string; piece: string; attackedBy: string[] }[];
  piecesLeftUndefended: { square: string; piece: string; wasDefendedBy: string }[];
  threatsIgnored: { description: string; opponentMove: string; threat: string }[];
  threatsCreated: { square: string; type: string }[];
}
```

**Test cases:**
- Position where knight is attacked by bishop and undefended: detect hanging knight
- User moved a rook that was defending a pawn: detect pawn left undefended
- Opponent played Bb5 attacking knight on c6, user played h3 ignoring it: detect ignored threat
- Clean position with no hanging pieces: return empty arrays

### 9. Basic Tactical Pattern Detector
**Difficulty:** Medium-Hard
**What it does:** Detects simple tactical motifs that the engine's preferred move exploits.

**Detects:**
- Forks: one piece attacking two or more enemy pieces simultaneously
- Pins: piece can't move because it would expose a more valuable piece behind it
- Skewers: attack on a valuable piece that, when moved, exposes a less valuable piece
- Discovered attacks: moving one piece reveals an attack from another piece behind it

**Why this matters:** When Stockfish prefers a move that involves a tactic, the coach should teach the tactical pattern, not just say "this move was better." Saying "there was a knight fork available on d5" is far more instructive than "Nd5 was better."

## Principle Classifier Design

The classifier takes the extracted features + the context (what move was played vs. what was best) and outputs the principle being violated **along with a confidence score (0-100)**.

### Confidence Scoring

Each classification rule computes a confidence based on how clearly the features match:
- **90-100:** One clear principle violated, strong feature signals (e.g., piece literally hanging)
- **70-89:** Likely principle identified but position is somewhat complex
- **50-69:** Multiple principles could apply — use simplified fallback lesson
- **Below 50:** Too ambiguous — describe what changed without asserting a principle

### Classification Rules (examples)

```typescript
// Rule: If the user's move didn't develop a piece and it's still the opening
// and they have undeveloped pieces → "Complete Development First"
if (gamePhase === "opening" && !moveImpact.developedPiece &&
    development[userColor].undevelopedMinorPieces > 0 &&
    !movePlayed.includes("O-O")) {
  return { principle: "complete_development_first", confidence: 92 };
}

// Rule: If user ignored an opponent threat detected by Threat Analyzer
// → "Don't Ignore Opponent's Threats"
if (threats.threatsIgnored.length > 0 &&
    evalSwing > 100) {
  return { principle: "check_opponent_threats", confidence: 95 };
}

// Rule: If a hanging piece was left by the user's move
// → "Blunder Check Habit"
if (threats.piecesLeftUndefended.length > 0 &&
    evalSwing > 200) {
  return { principle: "blunder_check", confidence: 97 };
}

// Rule: If king safety dropped significantly after the move
// → "Don't Weaken Your King's Pawn Shield"
if (moveImpact.changedKingSafety &&
    kingSafety[userColor].score > kingSafety[userColor].previousScore + 20) {
  return { principle: "king_pawn_shield", confidence: 85 };
}

// Rule: If the user traded pieces but had a space advantage
// → "Don't Trade With a Space Advantage"
if (moveImpact.wasCapture && material.balance changed toward equal &&
    pawnStructure.spaceAdvantage(userColor) > threshold) {
  return { principle: "dont_trade_with_space_advantage", confidence: 72 };
}

// Rule: If the worst piece wasn't improved and the move was passive
// → "Improve Your Worst Piece"
if (pieceActivity.worstPiece?.color === userColor &&
    !moveImpact.improvedPieceActivity &&
    moveImpact.description.includes("passive")) {
  return { principle: "improve_worst_piece", confidence: 75 };
}

// Rule: If material was hung (eval dropped > 200cp and it was a simple piece loss)
// → "Blunder Check: Look Before You Move"
if (evalSwing > 200 && simpleHangingPiece) {
  return "blunder_check";
}
```

### Elo-Gated Principles

Some principles are only taught at certain Elo ranges:

```typescript
const ELO_GATES: Record<string, { min: number; max: number }> = {
  "blunder_check":              { min: 0,    max: 1400 },
  "complete_development_first": { min: 0,    max: 1600 },
  "dont_trade_with_space":      { min: 1200, max: 2500 },
  "prophylaxis":                { min: 1400, max: 2500 },
  "improve_worst_piece":        { min: 1200, max: 2500 },
  "principle_of_two_weaknesses":{ min: 1600, max: 2500 },
};
```

If a principle is detected but outside the user's Elo gate, we either skip it or simplify it dramatically.

## Validation Strategy

### Manual Validation Protocol

For each feature extractor:
1. Find 10 well-known positions where the feature is clearly present
2. Find 10 positions where the feature is clearly absent
3. Find 5 edge cases
4. Run extractor on all 25 positions
5. Verify output matches expected result
6. Write these as automated test cases

### Known Test Positions

Keep a file of canonical test positions (FENs) with expected features:

```typescript
const TEST_POSITIONS = {
  // Isolated queen pawn
  "isolani_white": {
    fen: "r1bq1rk1/pp3ppp/2n1pn2/3p4/3P4/2N2N2/PP2PPPP/R1BQKB1R w KQ - 0 7",
    expected: {
      pawnStructure: {
        white: { isolatedPawns: ["d4"] },
        black: { isolatedPawns: [] }
      }
    }
  },
  // Bad bishop
  "bad_bishop_white": {
    fen: "r1bqk2r/pp3ppp/2n1pn2/3pP3/1b1P4/2N2N2/PP3PPP/R1BQKB1R w KQkq - 0 7",
    expected: {
      pieceActivity: {
        white: { badBishop: "c1" }  // blocked by e5/d4 pawn chain
      }
    }
  },
  // Unsafe king
  "exposed_king": {
    fen: "rnbq1rk1/pp3p1p/6p1/3pp3/8/5N2/PPPP1PPP/RNBQK2R w KQ - 0 7",
    expected: {
      kingSafety: {
        white: { castled: false, exposure: "high" }
      }
    }
  }
};
```

## Implementation Priority

1. **Material counter** — Simplest, needed for everything else
2. **Game phase detector** — Determines which other extractors matter
3. **Threat analyzer** — HIGHEST coaching value for sub-1400. Build early. Detects hanging pieces, ignored threats, undefended squares. This is the "leaky roof" detector.
4. **Pawn structure analyzer** — Foundation for many principles
5. **King safety scorer** — Critical for blunder analysis
6. **Piece activity evaluator** — Most complex but high teaching value
7. **Development tracker** — Only needed for opening phase
8. **Move impact analyzer** — Ties everything together, compares before/after
9. **Basic tactical pattern detector** — Forks, pins, skewers. Improves lesson specificity.

## Libraries and Dependencies

- **chess.js** — Already gives us: legal moves, piece positions, FEN parsing, check/checkmate detection, move history. We build ON TOP of this.
- No additional chess libraries needed. All feature extraction is custom code using chess.js's board state access.
