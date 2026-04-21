# CLAUDE.md — DeepMove

## Git Workflow Guardrails

- Prefer a clean sibling worktree per task: `scripts/new-worktree.sh codex-fix-short-description`
- Use `scripts/ship-pr.sh` to publish scoped work instead of ad hoc `git add -A`
- Refuse to publish mixed-scope work from a dirty checkout
- If the local tree is already mixed, snapshot it to a `wip-*` branch first, then split focused PRs from clean worktrees

## What Is DeepMove?

DeepMove is a free AI chess coaching web app. It provides game review (interactive board, eval bar, move-by-move analysis) with a GM-level coaching layer that teaches chess PRINCIPLES derived from the user's own games.

**Core philosophy:** "Every chess app tells you WHAT to play. DeepMove teaches you WHY."

The coach NEVER says "the engine says Rd1 is better." It says "your rook belongs on the open file — in positions like this, the player who controls the open file usually wins." The coaching blends grandmaster understanding with engine accuracy: the engine finds WHERE things went wrong, GM-style thinking explains WHY and WHAT TO LEARN.

Built on the training methodologies of: Dvoretsky (diagnostic coaching, deliberate practice), Botvinnik (think first, engine second), GM Noël Studer (Pareto principle, leaky roof concept, accuracy scores are misleading), Yusupov (critical moments analysis), GM Ramesh / Indian school (thinking process over memorization).

## Architecture: Hybrid Chess Intelligence

DeepMove uses a HYBRID architecture. Chess intelligence comes from deterministic code. The LLM only handles natural language lesson generation.

```
PGN Input
  → Stockfish WASM (client-side, runs in a WEB WORKER — never on main thread)
  → Critical Moment Detection (client-side, finds 2-3 key moments per game)
  → Feature Extraction Engine (client-side, extracts verified positional facts)
  → Category Classifier (rules-based, maps features → 1 of 6 mistake categories)
      hung_piece | ignored_threat | missed_tactic | aimless_move | didnt_develop | didnt_castle
  → Analysis Facts Builder (builds 5 verified fact sentences for the LLM)
  → LLM Lesson Generation (server-side, Claude API — writes 2-4 sentence coaching lesson)
  → MoveCoachComment box (Coach tab — updates per move, shows lesson at critical moments)
  → MoveList transcript (shared between Analysis + Coach tabs)
```

**PERFORMANCE RULE:** Stockfish MUST run in a Web Worker. Never on the main thread. The UI must never freeze during analysis. Use `new Worker()` with the Stockfish WASM binary. Analysis runs in background; results stream to the UI progressively.

**CATEGORY CLASSIFICATION:** The classifier maps features → 1 of 6 mistake categories (hung_piece, ignored_threat, missed_tactic, aimless_move, didnt_develop, didnt_castle) plus a confidence score. The category drives which facts are extracted and how the LLM lesson is framed. If no category fits (confidence too low), the lesson falls back to a general observation.

**CRITICAL RULES:**
1. The LLM NEVER analyzes chess positions directly. It receives pre-verified facts only.
2. The LLM NEVER tells the student to play the engine's exact move. It teaches the CONCEPT behind why the engine's move is better.
3. Every factual chess claim in a lesson must trace back to Stockfish eval or feature extraction output.
4. The coach sees the mistake BEHIND the mistake — not "you blundered on move 23" but "you started attacking with three pieces undeveloped, and by move 23 your position was already falling apart."
5. If the principle classifier isn't confident, the coach MUST NOT teach confidently. Better to say "this position got worse because your pieces became passive" than to incorrectly teach "you violated king safety principles."

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | React 18 + TypeScript + Vite | Main application |
| Board | chessground | Lichess's open-source board library |
| Chess Logic | chess.js | PGN parsing, move validation, FEN |
| Engine | Stockfish WASM | Client-side, zero server cost |
| Feature Extraction | Custom TypeScript | Positional analysis from board state |
| Principle Classifier | Rules-based TypeScript | Maps features → principles |
| Backend | Python + FastAPI | Auth, DB, LLM calls only |
| Database | PostgreSQL | Users, games, lessons, principles |
| Cache | In-memory LRU (cachetools) | LLM response cache (no Redis for MVP — see ADR-004) |
| LLM | Claude API (Haiku) | Haiku for both classification and lessons (Sonnet was too slow) |
| Auth | Email/password + OAuth | |
| Payments | Stripe | Premium ($4/mo, may increase) |
| Ads | Carbon Ads / EthicalAds | Single banner, free tier only |

## Project Structure

```
deepmove/
├── CLAUDE.md
├── TODO.md
├── docs/
│   ├── product-spec.md            # Business/marketing reference, competitive landscape
│   ├── feature-extraction.md      # Feature extraction engine design spec
│   ├── principle-taxonomy.md      # All 19 coaching principles with Elo gates
│   ├── setup.md                   # Developer setup guide
│   └── decisions.md               # ADRs — log every major decision
│
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   ├── public/
│   │   ├── stockfish/             # stockfish.js (asm.js) + worker.js wrapper
│   │   └── sounds/                # Chess sound files
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── components/
│       │   ├── Auth/              # AuthModal, UserMenu
│       │   ├── Board/
│       │   │   ├── ChessBoard.tsx
│       │   │   ├── EvalBar.tsx
│       │   │   ├── EvalGraph.tsx
│       │   │   ├── MoveList.tsx
│       │   │   ├── BestLines.tsx
│       │   │   └── PlayerInfoBox.tsx
│       │   ├── Coach/             # Track C — coaching UI (live)
│       │   │   ├── MoveCoachComment.tsx  # per-move coach box above MoveList
│       │   │   ├── LessonNav.tsx         # compact lesson dot indicators
│       │   │   ├── LessonCard.tsx
│       │   │   ├── SocraticPrompt.tsx    # stub
│       │   │   └── GameSummary.tsx       # stub
│       │   ├── Import/
│       │   │   ├── GameSelector.tsx
│       │   │   ├── AccountLink.tsx
│       │   │   ├── ImportPanel.tsx
│       │   │   └── normalizeGame.ts  # game normalization + rating cache
│       │   ├── Layout/
│       │   │   ├── NavSidebar.tsx
│       │   │   ├── ResponsiveLayout.tsx  # responsive wrapper (mobile + desktop)
│       │   │   ├── Header.tsx
│       │   │   └── Footer.tsx
│       │   ├── Play/              # Bot play mode
│       │   │   ├── BotPlayPage.tsx
│       │   │   ├── PlaySetupPanel.tsx
│       │   │   └── GameResultBanner.tsx
│       │   └── Profile/           # Settings / profile page
│       │       ├── ProfilePage.tsx
│       │       ├── PrincipleTracker.tsx
│       │       └── WeaknessProfile.tsx
│       ├── engine/
│       │   ├── stockfish.worker.ts  # Stockfish runs in Web Worker — NEVER main thread
│       │   ├── stockfish.ts         # Web Worker manager / message interface
│       │   ├── analysis.ts
│       │   └── criticalMoments.ts
│       ├── chess/
│       │   ├── features.ts         # Master feature extraction orchestrator
│       │   ├── threats.ts          # CRITICAL: hanging pieces, ignored threats, undefended squares
│       │   ├── pawnStructure.ts
│       │   ├── kingSafety.ts
│       │   ├── pieceActivity.ts
│       │   ├── development.ts
│       │   ├── openFiles.ts
│       │   ├── moveImpact.ts       # What did the user's move actually do/change?
│       │   ├── tactics.ts          # Basic fork/pin/skewer/discovered attack detection
│       │   ├── classifier.ts       # Rules-based: features → 6 mistake categories (hung_piece etc)
│       │   ├── taxonomy.ts         # Principle definitions + Elo mappings
│       │   ├── eloConfig.ts        # Elo-specific thresholds, priorities, language
│       │   ├── pgn.ts
│       │   └── types.ts
│       ├── api/
│       │   ├── client.ts
│       │   ├── chesscom.ts
│       │   └── lichess.ts
│       ├── hooks/
│       │   ├── useStockfish.ts
│       │   ├── useGameReview.ts
│       │   ├── useAnalysisBoard.ts  # free-play/sandbox board state
│       │   ├── useBotPlay.ts
│       │   ├── useCoaching.ts
│       │   └── useSound.ts
│       ├── services/
│       │   ├── gameDB.ts           # IndexedDB persistence (idb package)
│       │   ├── identity.ts
│       │   └── syncService.ts
│       ├── stores/
│       │   ├── gameStore.ts        # Zustand — game state
│       │   └── authStore.ts        # Zustand — auth state
│       └── styles/
│           ├── board.css
│           └── global.css
│
├── backend/
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── alembic/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── dependencies.py
│   │   ├── models/
│   │   │   ├── user.py
│   │   │   ├── game.py
│   │   │   ├── lesson.py
│   │   │   └── principle.py
│   │   ├── schemas/
│   │   │   ├── game.py
│   │   │   ├── coaching.py
│   │   │   └── user.py
│   │   ├── routes/
│   │   │   ├── auth.py
│   │   │   ├── games.py
│   │   │   ├── coaching.py
│   │   │   └── users.py
│   │   ├── services/
│   │   │   ├── coaching.py         # LLM pipeline
│   │   │   ├── cache.py
│   │   │   ├── chesscom.py
│   │   │   └── lichess.py
│   │   ├── prompts/
│   │   │   ├── system.py
│   │   │   ├── lesson.py
│   │   │   └── socratic.py
│   │   └── utils/
│   └── tests/
│
├── scripts/
│   ├── slideshow_generator.py  # daily TikTok/Instagram slideshow generator (Claude + DALL-E 3)
│   ├── requirements_slideshow.txt  # pip deps for slideshow_generator.py
│   ├── test_prompts.py
│   ├── pull_games.py
│   ├── validate_features.py
│   └── seed_principles.py
│
├── .env.example
├── .gitignore
└── Makefile
```

## The Coaching Philosophy (What Makes Us Different)

### The Coach's Thought Process

When reviewing a student's game, the coach asks:
1. "What was this position about?" — Not what the engine says, but what the themes are
2. "Did the student understand what it was about?" — Conceptual misunderstanding vs tactical blunder
3. "Where did the critical misunderstanding happen?" — Usually 3-5 moves before the actual blunder
4. "What does this student need to learn?" — ONE principle, calibrated to their Elo
5. "How do I explain it so it sticks?" — Using THEIR position, in language THEY understand

### What Makes the Coach Great
- Never says "engine says X is better" — explains the CONCEPT behind why
- Knows what matters at each Elo — doesn't lecture a 1200 about pawn structure theory
- Sees the mistake behind the mistake — traces back to the root cause
- Gives ONE thing to focus on — not five principles, one actionable takeaway
- Talks like a human coach — warm, direct, occasionally tough, never robotic
- Understands that engine best moves aren't always human-relevant — teaches the human-applicable concept

### The "Leaky Roof" Principle
From GM Studer: You can study openings and endgames all you want, but if you keep hanging pieces (the leaky roof), nothing else matters until you fix that. The coach identifies the user's "leaky roof" first.

**CLASSIFIER PRIORITY QUEUE RULE:** If TACTICAL_01 (Blunder Check) or TACTICAL_02 (Ignored Threat) triggers at a critical moment, it SUPPRESSES all other principle classifications for that moment. A hanging piece is always the lesson — never also mention pawn structure or piece activity. One lesson, the most urgent one. The coach should acknowledge: "There's more to discuss in this position, but we need to fix the big problem first."

### The Pareto Principle
80% of chess improvement comes from 20% of training. For most players under 1600, that 20% is: stop blundering, learn basic tactics, and understand what your moves are trying to achieve.

### LLM Response Caching
Cache key structure: `{principle_id}:{game_phase}:{elo_band}:{position_similarity_hash}`
- Elo bands: 0-800, 800-1200, 1200-1400, 1400-1600, 1600-1800, 1800+
- A lesson cached for a 1200 player must NEVER be served to an 1800 player
- Same principle + same game phase + same Elo band + similar position = cache hit
- This will cut LLM API costs by 40-60%
- **MVP:** In-memory LRU cache (`cachetools.LRUCache`). Resets on server restart — acceptable for now. Upgrade path: swap for Upstash Redis (single service change).

## Elo-Aware Coaching System

### Critical Moment Detection Thresholds
- Below 1200: eval swing > 1.5 pawns (only big blunders matter)
- 1200-1600: eval swing > 1.0 pawns
- 1600+: eval swing > 0.6 pawns (subtler errors become important)

### What to Teach at Each Level

**Below 1000:**
- Priority: Don't hang pieces, develop all pieces, castle, don't bring queen out early
- Language: Simple, concrete, action-oriented
- Example: "Before every move, scan the board: is anything you have undefended?"

**1000-1200:**
- Priority: Blunder check habit, basic tactical patterns (forks/pins/skewers), play with a purpose
- Language: Concrete with beginning conceptual framing
- Example: "You moved your knight but left your bishop undefended. The one-second habit that fixes this: before clicking your move, ask 'what can my opponent capture now?'"

**1200-1400 (project creator's range):**
- Priority: What to do after development, basic strategic concepts, converting advantages, not trading aimlessly
- Language: Conceptual but accessible
- Example: "After developing all your pieces, the next question is: where is the fight? Your pawn structure points toward the kingside, so that's where your pieces should be heading."

**1400-1600:**
- Priority: Piece activity over material, strategic pawn decisions, prophylaxis, endgame technique
- Language: Strategic with concrete examples
- Example: "You traded your active bishop for your opponent's passive knight. In an open position like this, bishops are usually stronger than knights because of the long diagonals. Before trading, ask: which piece is more useful?"

**1600-1800:**
- Priority: Deep calculation, positional sacrifices, pawn structure plans, complex endgames
- Language: Nuanced and strategic
- Example: "This Carlsbad structure calls for a minority attack — you should be pushing a4-a5 to create a weakness on b5 or c6. Instead, you played on the kingside, which is Black's side of the board in this structure."

**1800+:**
- Fully personalized based on weakness profile data
- No generic advice — every lesson addresses a specific demonstrated gap

### Time Control Awareness
- Bullet/Blitz (< 5 min): "In fast games, this kind of oversight is normal. Build the habit: even in blitz, take 2 seconds before each move to scan for hanging pieces."
- Rapid (10-15 min): "You had time to see this. This is a genuine gap in your thinking process, not a time pressure issue."
- Classical (30+ min): "In a slow game, this suggests you either lost focus or didn't have a clear plan for this phase of the game."

## Feature Extraction Engine (MVP Scope)

The feature extraction engine analyzes the board position and outputs VERIFIED facts. These feed into the principle classifier and then the LLM.

### MVP Extractors (Build These First)
1. **Material Counter** — piece counts, balance, bishop pair detection
2. **Game Phase Detector** — opening / middlegame / endgame based on material + move number
3. **Threat Analyzer** — CRITICAL for sub-1400 coaching. Detects:
   - Hanging pieces (undefended and attackable)
   - Pieces that became undefended AFTER the user's move
   - Opponent threats that the user ignored (opponent's last move attacked something and user didn't respond)
   - New threats the user's move created (or failed to create)
   - Output: `{ hangingPieces: [], attackedUndefended: [], threatsIgnored: [], threatsCreated: [] }`
   - This is the foundation for the blunder check habit — the #1 thing that improves sub-1400 play
4. **Pawn Structure Analyzer** — isolated, doubled, backward, passed pawns; pawn islands; open/closed structure
5. **King Safety Scorer** — castled status, pawn shield integrity, open files near king, pieces aimed at king
6. **Piece Activity Evaluator** — mobility per piece, centralization, bad bishop detection, passive pieces
7. **Development Tracker** — pieces developed off back rank, connected rooks, early queen moves
8. **Move Impact Analyzer** — what the user's move actually changed about the position (most important for coaching)
9. **Basic Tactical Pattern Detector** — detect simple forks, pins, skewers, and discovered attacks. Even basic detection here massively improves lesson quality for the 1000-1600 range.

### V2 Extractors (Add Later)
- Pawn structure pattern classifier (Carlsbad, French, Sicilian, etc.) with associated plans
- Weak square detection
- Advanced tactical motif detection (overloaded defenders, deflection, interference)
- Space advantage measurement
- Endgame-specific evaluation
- Plan consistency detection (did the user abandon a plan midway?)

### Key Principle: What Did the Move CHANGE?

The most important analysis for coaching is comparing the position BEFORE and AFTER the user's move:
- Did it develop a piece? (good in opening)
- Did it weaken the king? (usually bad)
- Did it create a pawn weakness? (context dependent)
- Did it trade an active piece for a passive one? (usually bad)
- Did it have a clear purpose? (if no, it's a "nothing move")
- Did it ignore the opponent's threats? (common at lower Elo)
- Did it improve the worst piece? (sign of good chess thinking)

This "delta analysis" is what makes the coaching specific and actionable rather than generic.

## LLM Coaching Prompt Design

The LLM receives ONLY verified data and writes the lesson. It never has to figure out what's happening in the position.

### Coaching Lesson Format (Strict 5-Step Structure)

Every coaching lesson follows this structure. The coach is CONCISE — never writes paragraphs when a sentence will do. Chess improvement = pattern recognition, not explanation length.

```
STEP 1: IDENTIFY THE MOMENT (1 sentence)
  "On move 16, you played a3."

STEP 2: ASK OR HIGHLIGHT (1 sentence)
  Think First ON:  "What was your idea with this move?"
  Think First OFF:  "This move didn't address any threat or improve any piece."

STEP 3: NAME THE PRINCIPLE (1-2 sentences)
  "The principle here is: improve your worst piece before anything else.
   Your bishop on e2 was blocked by your own pawns and doing nothing."

STEP 4: GIVE A CONCRETE RULE (1 sentence, memorable)
  "Before making a quiet move, scan your pieces — which one is least active?
   That's the one you should try to improve."

STEP 5: SHOW WHAT'S BETTER AND WHY (1-2 sentences)
  "Repositioning the bishop to the long diagonal would have doubled its
   influence. That's thinking like a coach, not an engine."
```

Total lesson: 6-8 sentences maximum. Never longer. The coach is direct, not verbose.

### Blunder Check Checklist (Think First Mode for Sub-1400)

For critical moments flagged as hanging pieces or ignored threats (detected by the Threat Analyzer), the coach uses the Studer blunder check checklist before revealing the lesson:

```
Coach: "Before we look at what happened — let's run through the checklist."
  1. "What was your opponent threatening after their last move?"
  2. "After your move, are any of your pieces undefended?"
  3. "What changed on the board?"

[User thinks / responds]

Coach: "Your opponent's bishop was attacking your knight on f3.
  Your move (a3) didn't address that. The knight fell next move.
  Rule: Before EVERY move — check what your opponent is threatening."
```

This trains the HABIT, not just the knowledge. The blunder check is the single most impactful skill for players below 1400.

### Handling Low-Effort Socratic Responses

When Think First mode is on and the user responds with "idk", "I don't know", "lol", or any low-effort response:
- Do NOT reveal the full answer immediately
- Instead, give a HINT: "Here's a clue — look at what your opponent's last move was attacking. What piece might be in danger?"
- If the user responds with low effort again, then reveal the lesson
- This preserves the active learning loop without frustrating users

### Example LLM Prompt (Full):

```
You are a warm, direct chess coach. You are CONCISE. Never write more than
8 sentences total. Follow the 5-step lesson format exactly.

STUDENT: 1330-rated, 10-minute rapid game.

VERIFIED DATA (all facts confirmed by our analysis engine):
- Move 16 of the middlegame
- User played: a3 (passive pawn move, no clear purpose)
- Engine preferred: Bf1 (reposition bishop to active diagonal)
- Eval: +0.4 → -0.3
- User's bishop on e2: blocked by own pawns on d3/f3, controls 3 squares
- After Bf1-g2: bishop controls long diagonal, 7 squares
- Both castled kingside, semi-open position
- No threats created or addressed by a3
- Bishop is user's WORST piece
- Classifier confidence: 88% → STRATEGIC_01 (Improve Your Worst Piece)

FORMAT:
Step 1: Identify the moment (1 sentence)
Step 2: Highlight the issue (1 sentence)
Step 3: Name the principle (1-2 sentences)
Step 4: Give a concrete rule (1 sentence)
Step 5: Show what's better (1-2 sentences)

TONE: Talk like a coach at a chess club, not a textbook. Direct, warm,
never say "the engine suggests." Never use chess notation without
explaining what it means in plain language.
```

## User Experience Flow

### Primary Flow: Game Review with Coaching

1. User imports a game (paste PGN, enter Chess.com/Lichess username, or paste game URL)
2. Game loads on interactive board with eval bar — standard game review experience
3. User can step through moves, see evaluations, explore — just like Lichess/Chessigma
4. At critical moments (2-3 per game), the coaching panel activates:
   - [Think First mode ON]: Coach walks through the blunder check checklist (sub-1400) or asks a Socratic question (1400+) BEFORE revealing the lesson
   - [Think First mode OFF]: 5-step lesson card appears directly
5. "Jump to Mistakes" button — takes user through only the critical moments with coaching
6. Game summary: "In this game, you struggled with X. Focus on Y in your next games."
7. If user has history: "This is the 3rd time you've ignored an opponent's threat. This is your #1 priority to fix." (Blunder habit detection — tracks recurring mistakes across games)

### The UI Hierarchy
- The BOARD is the centerpiece — always visible, never hidden. Should feel as good as Lichess
- The COACHING PANEL sits alongside the board (right side on desktop, below on mobile)
- The EVAL BAR runs alongside the board — but in Think First mode, eval is HIDDEN until after the user engages with the coach's question (prevents users from seeing -2.5 and stopping thinking)
- The MOVE LIST with navigation is below or beside the board
- Clean, professional, intelligent design — not vibe-coded, not meme-branded

## Monetization

### Free Tier (ad-supported)
- Unlimited game imports and Stockfish analysis
- AI coaching on critical moments (2-3 per game)
- First bulk account scan free ("first coaching session")
- Think First / Socratic mode
- Single tasteful banner ad (bottom of page, never intrusive)

### Premium (~$4/month, may raise to $6-8 if coaching proves valuable)
- Remove ads
- Unlimited ongoing bulk rescans (track improvement over time)
- Full principle tracker dashboard
- Weekly coaching summary emails
- Lesson history and bookmarking
- Priority LLM responses

## Build Order (Parallel Tracks)

### Track A: Game Review Board
1. Project scaffolding (React + Vite + TypeScript)
2. chessground: render board from FEN, handle user interaction
3. chess.js: parse PGN, step through moves, provide board state
4. Move list with clickable navigation
5. Stockfish WASM: evaluate positions, populate eval bar
6. Game import: PGN paste input
7. Chess.com API: fetch recent games by username
8. Lichess API: fetch recent games by username
9. Game selector UI

### Track B: Coaching Intelligence (parallel with Track A)
1. Feature extraction: material counter, game phase detector
2. Feature extraction: pawn structure analyzer
3. Feature extraction: king safety scorer
4. Feature extraction: piece activity evaluator
5. Feature extraction: development tracker
6. Feature extraction: move impact analyzer (what changed?)
7. Critical moment detection (eval swings → top 2-3 per game)
8. Principle taxonomy data structure with Elo gates
9. Principle classifier rules (features + context → principle)
10. Backend: FastAPI skeleton + coaching endpoint
11. LLM prompt templates
12. **Test with real games from moosetheman123** — iterate until quality is excellent

### Track C: Integration
1. Wire coaching pipeline to game review UI
2. Coaching panel component alongside board
3. Lesson card rendering at critical moments
4. "Jump to Mistakes" flow
5. Socratic mode toggle
6. Game summary after review

### Track D: Accounts & Polish
1. User auth
2. Game + lesson history
3. Principle tracker
4. Weakness dashboard
5. Premium + Stripe
6. Ad integration
7. Landing page
8. Responsive polish

## Testing Requirements

### Feature Extraction (MUST be comprehensive)
- Every extractor tested against 10+ known positions
- Include: positions where feature is clearly present, clearly absent, and edge cases
- Use FENs from real GM games as test fixtures
- Automated test suite that runs on every commit

### Coaching Quality (MUST be manually validated)
- Pull 20+ real games across Elo ranges (use moosetheman123 + others)
- Full pipeline: PGN → analysis → features → classification → lesson
- For each lesson, ask: "Would a chess player actually learn something useful from this?"
- Iterate on prompts until consistently yes

### Integration
- Full flow: import → review → coaching → summary
- Edge cases: very short games, draws, games with no big mistakes, resignations

## What NOT to Build (MVP Scope Discipline)

DO NOT build for MVP:
- Puzzles / tactics trainer
- Opening explorer / repertoire builder
- Endgame tablebase integration
- Pawn structure pattern classifier + plans database (this is V2)
- Community / social features
- Mobile native app
- Chrome extension
- Playing against AI
- Multiple coaching personalities (one great voice first)
- Tournament features
- Chat or messaging

MVP is: import a game → game review with eval bar → coaching at critical moments → learn principles. That's it. Make it incredible.

## Environment Setup

```bash
# Frontend
cd frontend && npm install && npm run dev    # Vite on :5173

# Backend
cd backend && python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload               # FastAPI on :8000

# Required env vars:
ANTHROPIC_API_KEY=
DATABASE_URL=postgresql://...    # Neon connection string
SECRET_KEY=                      # any long random string
```

## Key External APIs

### Chess.com (no auth required)
```
GET https://api.chess.com/pub/player/{username}
GET https://api.chess.com/pub/player/{username}/games/archives
GET https://api.chess.com/pub/player/{username}/games/{YYYY}/{MM}
```

### Lichess (no auth required for public games)
```
GET https://lichess.org/api/games/user/{username}?max=50&pgnInJson=true
GET https://lichess.org/game/export/{gameId}
```

## Reference: Test Account
Chess.com username for testing: **moosetheman123** (~1330 rated)
