# DeepMove Development TODO

**Current Status**: Board logic ✅ complete. Backend ✅ running (Supabase connected, auth working). 50 backend tests passing. First end-to-end coaching loop ✅ working (3B-2 complete).

**Launch Target**: Complete product with coaching, accounts, and mobile compatibility.

**Last Session**: 3B-2 coaching slice complete — feature extraction (threats, moveImpact, material, gamePhase), classifier (TACTICAL_01/02, OPENING_01/02/05), backend lesson endpoint wired, full coaching UI (CoachPanel, LessonCard, SocraticPrompt), App.tsx wired. 158 tests passing.

## 🟠 NEXT PHASE (COACHING FOUNDATION)

### TRACK B.1: Backend Setup + Database Connection ✅ DONE
Backend running at localhost:8000. Supabase connected via session pooler. All auth endpoints verified.
Fixes applied: psycopg3 URL rewriting, bcrypt 4.x pin, datetime.UTC → timezone.utc, JSONB mutation detection.

### COACHING PIPELINE (Prompt 3B) — ACTIVE PLAN
**Status**: 🟡 NEXT
**Scope**: Feature extraction → classifier → backend endpoint → coaching UI → data collection
**Goal for 3B:** one trustworthy coaching loop works end-to-end on a real imported game.

**Locked product decisions (2026-03-18):**
- Classifier scope: TACTICAL_01, TACTICAL_02, OPENING_01, OPENING_02, OPENING_05 only (+ OPENING_03 only if detection is clearly reliable)
- Think First: IN MVP — lightweight blunder-check habit checklist for TACTICAL_01/TACTICAL_02 high-confidence moments ONLY
- No broad Socratic system, no strategic Think First, no hint loop this pass
- 5-step lesson format: keep as-is
- LLM = wording layer only (never chess reasoning)
- One trustworthy end-to-end loop > broad principle coverage

**Current focus this week**
- [x] `3B-1a` ✅ DONE (commit f94908c)
- [x] Finish `3B-1b` and `3B-1c` ✅ DONE (material.ts, gamePhase.ts, threats.ts)
- [x] Get `features.ts` returning real non-placeholder data on one real game ✅ DONE
- [x] Land the first classifier pass for TACTICAL_01/TACTICAL_02/OPENING_01/OPENING_02/OPENING_05 ✅ DONE
- [x] Build minimal Think First checklist for high-confidence tactical moments only ✅ DONE
- [ ] Pause for product review before broadening principle coverage

**Working order (easiest to hardest)**
- [x] `3B-1a` ✅ DONE (commit f94908c): `openFiles.ts`, `development.ts`
- [x] `3B-1b` ✅ DONE (partial): material.ts, gamePhase.ts created
- [x] `3B-1c` ✅ DONE: threats.ts — hangingPieces, threatsIgnored, piecesLeftUndefended
- [x] `3B-1d` ✅ DONE: moveImpact.ts — MVP: capture/check/development/castling/hadClearPurpose
- [x] `3B-2a` ✅ DONE: features.ts orchestrator + enrichCriticalMoments()
- [x] `3B-2b` ✅ DONE: classifier.ts — TACTICAL_01/02, OPENING_01/02/05, Elo gates, buildVerifiedFacts()
- [x] `3B-3` ✅ DONE: POST /coaching/lesson wired to coaching service
- [x] `3B-4` ✅ DONE: useCoaching hook + CoachPanel + LessonCard + SocraticPrompt + App.tsx wiring
- [x] `3B-5` ✅ DONE: lesson persistence — backend saves to DB, checks DB before calling Claude

**3B-1a: Easy Foundations** (client-side TypeScript) ✅ DONE
- [x] Implement `openFiles.ts`
- [x] Implement `development.ts`
- [x] Definition of done: helper tests pass and outputs are no longer placeholders
- ✅ Completed in commit f94908c

**3B-1b: Positional Helpers** ✅ DONE (partial)
- [x] Implement `material.ts` ✅ DONE
- [x] Implement `gamePhase.ts` ✅ DONE
- [ ] Implement `kingSafety.ts` (stub — V2)
- [ ] Implement `pieceActivity.ts` (stub — V2)
- [ ] Definition of done: each module returns stable typed data on representative positions

**3B-1c: Tactical Detection** ✅ DONE
- [x] Implement `threats.ts` — hangingPieces, threatsIgnored, piecesLeftUndefended
- [x] Definition of done: 9 unit tests passing, detects hanging pieces and ignored threats

**3B-1d: Move Delta Logic** ✅ DONE
- [x] Implement `moveImpact.ts` — capture/check/development/castling/hadClearPurpose
- [x] Definition of done: one move can be described in concrete before/after terms

**3B-1: Extraction Foundations Summary**
- [ ] Keep `pawnStructure.ts` as a stub for now
- [ ] Keep tactics/basic tactical detection minimal unless classifier truly needs it
- [ ] Add tests as each extractor lands instead of saving them all for later
- [ ] After each sub-step, sanity-check output on one real game position

**3B-2a: Orchestration** ✅ DONE
- [x] Wire `features.ts` orchestrator
- [x] Add material.ts + gamePhase.ts helper modules
- [x] enrichCriticalMoments() via PGN replay with full Chess instance history
- [x] Definition of done: one critical moment can produce a full `PositionFeatures` object

**3B-2b: Classifier** ✅ DONE
- [x] Build classifier rules in `classifier.ts`
- [x] MVP principles: TACTICAL_01, TACTICAL_02, OPENING_01, OPENING_02, OPENING_05
- [x] Apply Elo gates and confidence thresholds
- [x] 14 unit tests passing
- [x] Definition of done: classifier returns one believable lesson target or null fallback

**3B-3: Backend Lesson Endpoint** ✅ DONE
- [x] Wire `POST /coaching/lesson` in `routes/coaching.py`
- [x] Prompt shaping in `lesson.py` and system prompt in `system.py`
- [x] Definition of done: lesson endpoint returns payload from verified facts

**3B-4: Coaching UI MVP** ✅ DONE
- [x] Build `useCoaching` hook (enrichment + LLM fetch + Think First state)
- [x] Build `CoachPanel` (lesson display + navigation)
- [x] Build `LessonCard` (5-step format, confidence dots)
- [x] Build `SocraticPrompt` (blunder-check checklist for TACTICAL_01/02)
- [x] App.tsx wired with CoachPanel in coach mode
- [ ] Product checkpoint: manually verify lessons on moosetheman123 game — run servers, load game, switch to Coach tab

**3B-5: Persistence** ✅ DONE
- [x] `CoachingRequest` schema: added `platform_game_id`, `platform`, `color` fields
- [x] `POST /coaching/lesson`: checks DB for existing lesson before calling Claude (survives server restart)
- [x] After generation: saves lesson to `lessons` table for logged-in users whose game is in DB
- [x] Skips silently for guests (no auth token → no save)
- [x] `useCoaching` hook: passes `platformGameId`, `platform`, `color` in request body
- [x] `App.tsx`: passes `currentGameId` and `platform` from gameStore to `useCoaching`
- [ ] **Known gap**: DB cache only hits if game has been synced to backend first (needs 3B-6)

**3B-6: Close the DB Cache Loop (NEXT)**
- [ ] For the lesson DB cache to actually hit on game reload, the game must exist in the backend DB
- [ ] Current flow: IndexedDB stores games locally; sync to PostgreSQL only on login + explicit sync
- [ ] Option A: Store `backendGameId: number | null` on `AnalyzedGameRecord` in IndexedDB — populated on sync
- [ ] Option B: Trigger a background game sync after analysis completes for logged-in users
- [ ] Decision: Option A is simpler — add `backendGameId` to `AnalyzedGameRecord`, populate in `syncService.ts` after upload, read it in `gameStore` and pass to `useCoaching`

**Notes / guardrails for 3B**
- [ ] Do not broaden MVP to all 19 principles yet
- [ ] Do not remove raw planning notes below
- [ ] Think First IN MVP — lightweight only: blunder-check habit checklist for TACTICAL_01/TACTICAL_02 at confidence ≥ 70. No broad Socratic system, no strategic Think First, no hint system yet.
- [ ] Prefer correctness over coverage in extractor logic
- [ ] After each major block, stop and ask: is this teaching the right concept, at the right Elo, in the right tone?
- [ ] If the answer is "technically works but not coach-like", fix product quality before adding scope

---

## 🟡 POLISH & EXPANSION

### TRACK T.2: Frontend Test Infrastructure (1-2 hours)
- [x] Add unit/integration test harness (Vitest + Testing Library)
- [x] Add test coverage for critical board logic (FEN sync, move validation, branching)
- [x] Add CI step to run `npm test` for frontend
- **123 tests passing** across 9 files (analysis, criticalMoments, pgn, useGameReview, GameReport, GameSelector, ChessBoard, PlayerInfoBox helpers, EvalBar helpers)
- [ ] Add feature extraction tests as Track B extractors are built
- [ ] Add API client tests (chesscom.ts, lichess.ts) with fetch mocking

### TRACK C.4: Mobile Responsiveness (2-3 hours)
- [ ] Player boxes stack vertically
- [ ] Coach panel full-width below
- [ ] Board touch-friendly
- [ ] Test on real phones
- we really need to flesh this out and perfect it. and also we need to think about making this an app at some point too pretty soon after launch will that be simple and easy? lichess has an app

### TRACK C.5: Think First Mode (Socratic)
- [ ] MVP (3B): Lightweight blunder-check habit checklist for TACTICAL_01/TACTICAL_02 high-confidence moments only
- [ ] Later: Full Socratic toggle and question flow
- [ ] Later: Strategic Think First (only after tactical coaching is proven)
- [ ] Later: Hint system for repeated low-effort responses

---

## 🟣 TRACK D: Accounts & Auth

### D.1 — Core Auth + Game Sync ✅ DONE
- [x] SQLAlchemy models, Alembic migration, JWT auth, bcrypt, token versioning
- [x] User routes (GET/PATCH/DELETE /users/me, /users/me/export)
- [x] Game routes (CRUD, batch upload, sync-status)
- [x] Frontend authStore, API client, AuthModal, UserMenu, syncService
- [x] Password requirements checklist UI (inline validation, no browser popup)

### D.2 — Connect Database ✅ DONE
- [x] Supabase PostgreSQL connected via session pooler
- [x] Alembic migrations, auth flow verified end-to-end

### D.3 — OAuth (Not Started)
**Lichess OAuth** (do first — best documented, standard OAuth2 + PKCE)
- [ ] Register DeepMove as Lichess OAuth app at lichess.org/account/oauth/app
- [ ] Set LICHESS_CLIENT_ID + LICHESS_CLIENT_SECRET in .env
- [ ] Implement PKCE: generate code_verifier/challenge in GET /auth/lichess
- [ ] Store verifier in server-side state (or signed cookie), redirect to Lichess
- [ ] GET /auth/lichess/callback: exchange code → token, fetch https://lichess.org/api/account
- [ ] Create user OR link Lichess account to existing user (match by email if available)
- [ ] Issue DeepMove JWT pair, redirect to frontend with tokens

**Google OAuth** (standard, well-documented)
- [ ] Create Google Cloud OAuth2 credentials at console.cloud.google.com
- [ ] Set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET in .env
- [ ] Implement standard OAuth2 flow via authlib (already installed)
- [ ] GET /auth/google/callback: exchange code → token, fetch userinfo
- [ ] Same create/link logic as Lichess

**Chess.com OAuth** (do last — poorly documented, higher risk)
- [ ] Attempt Chess.com OAuth if credentials are available
- [ ] Fallback plan: if Chess.com OAuth is unstable, drop it — manual username linking already works via AccountLink.tsx

### D.4 — Backend Tests ✅ DONE (50 tests passing)
- [x] Auth flow, duplicate email, wrong password, expired/invalid tokens, token revocation
- [x] Game batch upload + sync-status round-trip
- [x] GDPR delete cascades all user data
- [x] CI: pytest + TestClient with PostgreSQL service container

---


---

---

## Raw Notes / Prompt Archive
Keep everything below as scratch notes, planning context, and prompt history. Do not delete just because the active plan above is cleaner.

PROMPT 3B: Coaching Intelligence — Design + Build (do this after 3A)

# DeepMove Planning Session: Coaching Intelligence — Feature Extraction, Classifier, LLM Pipeline

## Project Context
DeepMove is a chess coaching web app that teaches chess PRINCIPLES from the user's own games. Core philosophy: "Every chess app tells you WHAT to play. DeepMove teaches you WHY." We want to market this explicitly as an AI coaching app — the coaching pipeline is the product differentiator, not just another analysis board.

**Architecture (Hybrid Chess Intelligence):**
PGN Input
→ Stockfish WASM (client-side Web Worker, elo-adaptive depth 10/14/18)
→ Critical Moment Detection (top 2-3 eval swings per game, elo-based thresholds)
→ Feature Extraction Engine (client-side TypeScript) ← BUILD THIS
→ Principle Classifier (rules-based TypeScript, features → principle + confidence 0-100) ← BUILD THIS
→ IF confidence >= 70%: LLM generates full 5-step principle lesson
IF confidence < 70%: LLM generates simplified observation-based lesson
→ LLM Lesson Generation (server-side Claude API) ← WIRE THIS UP
→ Coaching Panel UI (alongside board) ← BUILD THIS



**CRITICAL RULES — never violate these:**
1. LLM NEVER analyzes chess positions directly. Receives pre-verified facts only.
2. LLM NEVER tells student to play engine's exact move. Teaches the CONCEPT.
3. Every factual chess claim must trace to Stockfish eval or feature extraction.
4. Coach sees the mistake BEHIND the mistake — root cause, not surface blunder.
5. Confidence < 70% → coach describes what changed, does NOT assert a principle.
6. LEAKY ROOF RULE: If TACTICAL_01 (hanging piece) or TACTICAL_02 (ignored threat) triggers → suppresses ALL other classifications. One lesson, the most urgent one.

## What's Already Built (don't touch)

### Stockfish + Analysis
- Full-game analysis: elo-adaptive depth (10/14/18 based on user Elo), sequential per move
- Per-position multi-PV: depth 22, 3 lines
- MoveEval per move: { moveNumber, color, san, fen, eval: { score, isMate, mateIn, depth }, grade }
- Move grades: best (≤10cp), excellent (≤30), good (≤100), inaccuracy (≤200), mistake (≤400), blunder (>400cp)

### Critical Moment Detection
- Top 2-3 user moves by cpLoss, filtered by elo threshold (150cp/<1200, 100cp/1200-1600, 60cp/1600+)
- CriticalMoment shape: { moveNumber, color, fen, fenAfter, movePlayed, engineBest[], evalBefore, evalAfter, evalSwing, features (STUBBED), classification (null) }

### 19 Principles Defined (frontend/src/chess/taxonomy.ts)
**Opening (5):** Complete Development, Castle Early, Don't Bring Queen Out, Control Center, Don't Move Same Piece Twice
**Tactical (4):** Blunder Check Habit (TACTICAL_01), Don't Ignore Threats (TACTICAL_02), Look for Forcing Moves, Back-Rank Awareness
**Strategic (8):** Improve Worst Piece, Don't Trade With Space Advantage, Trade When Up Material, Piece Activity Over Material, Play With a Plan, Don't Weaken King's Pawn Shield, Control Open Files, Prophylaxis
**Endgame (3):** Activate Your King, Rooks Behind Passed Pawns, Improve Before Breaking Through
**Meta (1):** When Ahead Simplify When Behind Complicate

Elo bands: BEGINNER (0-800), NOVICE (800-1200), INTERMEDIATE (1200-1400), CLUB (1400-1600), ADVANCED (1600-1800), EXPERT (1800+)

### Backend (partially wired)
- `backend/app/services/coaching.py` — LRU cache + Claude API call (works)
- `backend/app/prompts/` — prompt templates (exist but incomplete)
- `backend/app/routes/coaching.py` — stub, returns 501
- `frontend/src/api/client.ts` — authenticated API client (works)

## What We're Building This Session

### PHASE 1: Feature Extraction (frontend/src/chess/)

Build these extractors in priority order. All take a Chess instance (chess.js) and return typed data:

**1. materialCounter.ts** (foundational, used by everything)
- Piece counts per side: { white: {p,n,b,r,q,k}, black: {p,n,b,r,q,k} }
- Material balance in centipawns (p=100, n=310, b=320, r=500, q=900)
- Bishop pair detection (both bishops still on board)
- Material imbalance flag (>150cp difference = significant)

**2. gamePhaseDetector.ts** (foundational, used by classifier for gating)
- Opening: move ≤ 12 AND total material > 6200cp (most pieces still on board)
- Endgame: queens off OR total material < 2600cp
- Middlegame: everything else
- Returns: 'opening' | 'middlegame' | 'endgame'

**3. threatAnalyzer.ts** (HIGHEST PRIORITY — biggest coaching impact for <1400)
- Hanging pieces: pieces that can be captured for free (attacked but undefended)
- Pieces attacked after user's move: did user's move create a new attack on their own piece?
- Ignored threat: did opponent's last move attack something and user didn't respond?
- New threats created: did user's move create a new attack on opponent?
- Returns: { hangingPieces: Square[], newAttacksOnUser: Square[], ignoredOpponentThreat: boolean, newThreatsCreated: Square[] }

**4. moveImpactAnalyzer.ts** (MOST IMPORTANT for coaching)
Compares position BEFORE and AFTER user's move:
- didDevelop: did it move a piece off the back rank for the first time?
- didCastle: was it a castling move?
- didWeakenKing: did it remove a pawn from the king's pawn shield?
- didCreateWeakness: did it create an isolated/doubled pawn?
- didIgnoreThreat: did it fail to address the opponent's threat from last move?
- didImprovePiece: did it increase mobility of the moved piece?
- hadClearPurpose: did it develop, attack, defend, or improve something? (false = "nothing move")
- Returns all of the above as booleans + descriptive strings for LLM consumption

**5. developmentTracker.ts**
- Count pieces still on back rank (rank 1 for white, rank 8 for black)
- Rooks connected (no pieces between them)
- Early queen move flag (queen moved before move 7 without capturing)
- Same piece moved twice in opening (before move 10)
- Returns: { undevelopedCount: number, rooksConnected: boolean, earlyQueenMove: boolean, samePieceTwice: boolean }

**6. kingSafetyScorer.ts**
- Castled status: has king castled (not on e1/e8 anymore)?
- Pawn shield count: pawns on f/g/h files (or a/b/c for queenside castle) in front of king
- Open files near king: any open/semi-open file adjacent to king file?
- Returns: { hasCastled: boolean, pawnShieldCount: number, openFilesNearKing: number, castledSide: 'kingside' | 'queenside' | null }

**7. pieceActivityEvaluator.ts**
- Mobility per piece: count legal moves for each piece
- Worst piece: the piece with fewest legal moves (excluding king)
- Bad bishop detection: bishop blocked by own pawns on same color squares
- Centralization score: pieces on central squares (d4/d5/e4/e5 = 4pts, c3/c6/f3/f6 = 2pts, etc.)
- Returns: { mobilityByPiece: Record<Square, number>, worstPiece: Square | null, hasBadBishop: boolean, centralizationScore: number }

**Note on pawnStructureAnalyzer.ts:** Build as a stub that returns empty data for now — the above 7 are enough for the classifier. Add real pawn structure logic in the next session.

### PHASE 2: Principle Classifier (frontend/src/chess/classifier.ts)

Rules-based classifier. Input: all extracted features + game context. Output: { principleId: string, confidence: number, reasoning: string[] }.

**Priority queue (check in this order):**

TACTICAL_01 (Blunder Check Habit) — if hangingPieces.length > 0 AND cpLoss > 150
→ confidence = min(95, 70 + cpLoss/10)
→ SUPPRESS all other checks, return immediately

TACTICAL_02 (Ignored Threat) — if ignoredOpponentThreat AND cpLoss > 100
→ confidence = min(90, 65 + cpLoss/8)
→ SUPPRESS all others

OPENING_02 (Castle Early) — if game phase = opening AND !hasCastled AND moveNumber > 10
→ confidence = 75 if move is clearly not castling-related, else 55

OPENING_01 (Complete Development) — if undevelopedCount >= 2 AND game phase = opening
→ confidence = 70 + (undevelopedCount * 5)

OPENING_03 (Don't Bring Queen Out Early) — if earlyQueenMove AND game phase = opening
→ confidence = 80

OPENING_05 (Don't Move Same Piece Twice) — if samePieceTwice AND game phase = opening
→ confidence = 75

STRATEGIC_01 (Improve Worst Piece) — if !hadClearPurpose AND worstPiece exists AND piece moved ≠ worst piece
→ confidence = 65

STRATEGIC_05 (Play With a Plan) — if !hadClearPurpose AND no tactical threats detected
→ confidence = 60

STRATEGIC_06 (Don't Weaken King's Pawn Shield) — if didWeakenKing
→ confidence = 80

Fallback: if confidence < 60 on best candidate → return { principleId: null, confidence: 45, reasoning: ['Position is complex, no single principle dominates'] }



Also apply Elo gates: if user Elo is below principle.eloMin, skip that principle. If above eloMax, skip. Only teach principles appropriate to the student's level.

### PHASE 3: Backend — Wire Coaching Endpoint

**File: `backend/app/routes/coaching.py`** (currently a stub)
Implement `POST /coaching/lesson`:
- Receives: { principle_id, principle_name, confidence, elo_band, game_phase, move_number, move_played, eval_before, eval_after, eval_swing_cp, verified_facts, engine_move_idea, position_hash, user_elo, time_control_label }
- Calls `coaching_service.generate_lesson(request)`
- Returns: { lesson, principle_id, confidence, cached }

**File: `backend/app/prompts/lesson.py`** (needs to be created/fixed)
Build `build_lesson_prompt(req: dict) -> str`:
- If confidence >= 70: use 5-step lesson format (identify moment → highlight issue → name principle → give rule → show better)
- If confidence < 70: use observation format (describe what changed, do NOT assert a principle)
- The LLM receives ONLY the verified_facts list + engine_move_idea — never raw FEN or PGN
- System prompt emphasizes: warm coach voice, max 8 sentences, never say "engine suggests", never give exact move, teach the concept

**File: `backend/app/prompts/system.py`** (may not exist yet)
Create the system prompt for the coaching LLM:
You are a warm, direct chess coach. You teach chess PRINCIPLES, not moves.
Never say "the engine suggests" or "Stockfish says". Never give exact moves.
Be CONCISE — 6-8 sentences maximum. Follow the lesson format exactly.
You receive only verified facts — do not invent positions or tactical details.
Talk like a coach at a chess club: direct, warm, occasionally tough.



### PHASE 4: Frontend — Coaching Hook + Panel

**File: `frontend/src/hooks/useCoaching.ts`**
- Takes `criticalMoments` from gameStore
- For each critical moment, runs feature extraction → classifier → posts to `/coaching/lesson`
- Caches results in a `Map<moveNumber, CoachingLesson>` (don't re-fetch)
- Returns: { lessons: Map<number, CoachingLesson>, isLoading: boolean, error: string | null }

**File: `frontend/src/components/Coach/CoachPanel.tsx`**
Simple coaching panel that appears in the right sidebar (analysis tab area):
- Shows when `currentMoveIndex` matches a critical moment's move number
- Displays the generated lesson text (already has 5-step structure from LLM)
- Shows principle name + confidence badge
- "Jump to next critical moment" button
- Loading spinner while fetching lesson
- If no lesson yet (not a critical moment): shows either nothing or "Navigate to a highlighted moment to see coaching"

**File: `frontend/src/App.tsx`**
- Add `<CoachPanel>` in the analysis tab alongside the existing eval/move list content
- Pass `currentMoveIndex` and `criticalMoments` to it
- Only show CoachPanel when `viewMode === 'coach'` (coach toggle from session 3A)

### PHASE 5: Data Collection Updates

**File: `frontend/src/services/gameDB.ts`**
Add to `AnalyzedGameRecord`:
- `schemaVersion: number` (start at 2 — allows future re-analysis detection)
- `principleViolations: { moveNumber: number, principleId: string, confidence: number }[]` (populated from classifier output at critical moments)
- `accuracyScore: number` (already computed in GameReport, store it here)
- `acpl: number` (already computed, store it)

These fields power the future weakness dashboard without requiring re-analysis.

## Principles to Add (expand taxonomy.ts)

Add these to the 19:
- **STRATEGIC_09: Push Your Passed Pawns** — when user has a passed pawn but moves elsewhere. EloMin: 1200.
- **META_02: Time Control Awareness** — when game phase = blitz/bullet AND blunder rate is high. Coach says: "In faster games, blunders happen. The antidote isn't thinking longer — it's building a pre-move checklist habit." EloMin: 0 (universal).

Keep all others as-is. "Removing the guard", opposite-colored bishops, opening theory (Italian, etc.) are V2 — they require pattern databases we don't have yet.

## Key Files Reference
- `frontend/src/chess/types.ts` — CriticalMoment, PositionFeatures, ClassificationResult types
- `frontend/src/chess/taxonomy.ts` — 19 principles with Elo gates
- `frontend/src/chess/eloConfig.ts` — getEloBand(), getCriticalMomentThreshold()
- `frontend/src/chess/classifier.ts` — EXISTS but empty stub, build it out
- `frontend/src/engine/criticalMoments.ts` — criticalMoments logic (done)
- `frontend/src/engine/analysis.ts` — classifyMove(), MoveGrade
- `frontend/src/stores/gameStore.ts` — criticalMoments[], userElo, moveEvals[]
- `frontend/src/hooks/useStockfish.ts` — runAnalysis() (done)
- `backend/app/services/coaching.py` — LRU cache + Claude call (done)
- `backend/app/routes/coaching.py` — stub (needs implementation)
- `backend/app/prompts/` — may be partially missing, build what's needed

## Constraints
- Feature extraction: client-side only, must be fast (< 50ms per position)
- All chess position analysis: use chess.js Chess instance only (never pass FEN to LLM)
- LLM input: only pre-verified string facts (from verified_facts array)
- Test on: moosetheman123 Chess.com account (~1330 rated)
- After all phases: run `npx tsc --noEmit` from frontend/ and fix any errors

## Split into sub-sessions if needed
This is large. If time runs out, stop cleanly at a phase boundary and report:
- What's complete
- What's partial and what remains
- A continuation prompt for the next session

more to think about for coaching logic / plan:


Will Musolf:
	https://www.reddit.com/r/chessbeginners/s/eZnRnSufHI
	Another gm way of thinking: rule 1 create threats and keep making threats
Offense is the best defense but make sure it’s good. Aggressive but not reckless 
Rule 2 attack while bringing in new pieces when attacking. Develop and attack at same time
Rule 3 before attacking, check opponents checks and captures and if making a drawback mistake. People often overlook opponents captures and checks

Separately:
Have sequential opening theory? Starting with Italian etc 

Users can pay for a full profile analysis to find tactics and things that have been missed from own games? And that’s also how I’ll send Akeem the tactics

Learning to convert marginally winning positions

Will Musolf:
	Another gm way of thinking: rule 1 create threats and keep making threats
Offense is the best defense but make sure it’s good. Aggressive but not reckless 
Rule 2 attack while bringing in new pieces when attacking. Develop and attack at same time
Rule 3 before attacking, check opponents checks and captures and if making a drawback mistake. People often overlook opponents captures and checks

Separately:
Have sequential opening theory? Starting with Italian etc  and you can slowly learn logic and long term thikning with different basic openings

Users can pay for a full profile analysis to find tactics and things that have been missed from own games? And that’s also how I’ll send Akeem the tactics. he wants people to send tactics from their own games to his email (mentioned in this video: https://youtu.be/bj5IiinjCeI)
maybe we can send him our missed tactics in the way he wants and also tell him about the app and ask if he has any feedback or would like to input on it.

Learning to convert marginally winning positions




## 💰 MONETIZATION & LAUNCH

- we need to protect against cost abuse early. DeepMove should feel generous, but we cannot rely on ideal usage patterns or strong ad revenue right away

### Pricing Model (Recommended)
- **Domain:** deepmove.io (purchased, $60)
- **Free tier:** Unlimited Stockfish analysis + unlimited game imports + 3 AI-coached game reviews/week + minimal ads
- **Premium ($5/mo or $40/year, 20% annual discount):** Generous AI coaching + full account analysis (last 50-100 games) + recurring mistake tracking + principle tracker dashboard + lesson bookmarking + no ads + priority LLM queue
- **No one-time purchases or credits** — subscription only, keep it simple
- **Important note:** Premium can be presented as generous/unlimited, but should still have fair-use protections behind the scenes
- **Break-even target:** aim for premium revenue to work even if ads underperform

### Why This Structure Is Safer
- 1 coached game/day may be too generous before we know real retention, abuse rate, and actual LLM cost
- 3 coached reviews/week still gives people a real taste of the product
- the strongest Premium value is not just "more lessons," it is:
- full account analysis
- recurring-pattern diagnosis across many games
- progress tracking over time

### LLM Model Strategy
- **Under 1600:** Haiku 4.5 for most tactical/basic coaching moments
- **1600+:** Sonnet 4.6 when explanation quality clearly matters
- **Optimization rule:** if the lesson is simple and high-confidence, prefer the cheaper model when possible regardless of rating
- Free vs Premium = quantity + long-term features, not "good AI vs bad AI"
- ~80% of users are under 1600, so keeping most traffic on the cheaper model is important

### Cost Model (Treat Current Numbers as Optimistic)
- Per lesson: current estimate ~$0.003 (Haiku) / ~$0.008 (Sonnet)
- Main risk factors:
- cache hit rate may be lower than expected
- prompts and responses may get longer over time
- "unlimited" premium can be abused
- ads may underperform
- active users may use the app more than modeled
- We should treat early projections conservatively and revisit them after launch with real usage data

### Revenue Projections (Conservative Framing)
- do not rely on thin margins staying stable
- do not treat ads as core survival revenue
- subscriptions should carry the business; ads are a bonus
- the best long-term margin feature is full account analysis + recurring weakness tracking

### Competitive Positioning
- vs Chess.com: much cheaper, more focused on coaching, no platform lock-in
- vs Chessigma: cleaner product thesis, less ad-heavy, stronger coaching identity
- vs Lichess: adds an AI coaching layer on top of free analysis of your Chess.com games
- vs DecodeChess: cheaper and more principle-based
- vs Aimchess: similar price range, but stronger "teach WHY from your own games" positioning

### M.1: Stripe Integration (2-3 hours)
- [ ] Create Stripe account + products (Premium Monthly $5, Premium Annual $40)
- [ ] Stripe Checkout for subscription signup
- [ ] Stripe Customer Portal for card management + cancellation
- [ ] Webhook handler: `checkout.session.completed` → set `is_premium = true`
- [ ] Webhook handler: subscription end/cancel events → set `is_premium = false`
- [ ] Add `is_premium` and `stripe_customer_id` to User model
- [ ] Alembic migration for new fields

### M.2: Usage Protection / Rate Limiting (1-2 hours)
- [ ] Track coached games, not just raw lesson calls
- [ ] Free users: 3 coached game reviews/week
- [ ] Premium users: generous usage with fair-use throttles
- [ ] Return 429 / limit response with friendly upgrade copy
- [ ] Add basic abuse detection for extreme usage
- [ ] Reset counters automatically on schedule

### M.3: Ad Integration (1 hour)
- [ ] Sign up for EthicalAds or Carbon Ads
- [ ] Single tasteful banner only
- [ ] Hide ads for Premium users
- [ ] Keep ads minimal and never intrusive
- [ ] Do not overbuild ads before traffic exists

### M.4: Full Account Analysis (3-4 hours) — HIGH-VALUE PREMIUM FEATURE
- [ ] Batch analysis: pull last 50-100 recent games → run full pipeline on each
- [ ] Aggregate principle violations / recurring mistakes across all games
- [ ] Generate weakness report: top 3 recurring mistakes + examples + trends
- [ ] Store results for dashboard display
- [ ] Monthly rescan capability (Premium only)
- [ ] This is one of the strongest Premium differentiators and should be treated as core value, not just a nice add-on

### M.5: Principle Tracker Dashboard (2-3 hours) — POST-LAUNCH / PREMIUM
- [ ] Visual dashboard: mistake frequency over time
- [ ] Top 3 weaknesses highlighted with specific game examples
- [ ] Progress tracking: "You've reduced X mistake by Y%"
- [ ] Premium-only feature
- [ ] Use this to increase retention, not just as a vanity dashboard

### M.6: Deploy to deepmove.io (2-3 hours)
- [ ] Deploy frontend to Vercel, connect deepmove.io domain
- [ ] Deploy backend to Railway
- [ ] Set up Supabase project (production PostgreSQL)
- [ ] Configure env vars, SSL, CORS for production
- [ ] Smoke test full flow: import → analysis → coaching → payment

### Launch Timeline (estimated 4-6 weeks)
1. Finish coaching pipeline (Tracks B + C)
2. Add monetization basics: Stripe + usage caps
3. Deploy to deepmove.io
4. Launch with one clean free offer and one clear Premium offer
5. Use real usage data to tune caps, prompts, and pricing assumptions

### What to Skip for Launch
- OAuth (email/password works fine)
- Weekly coaching emails
- heavy dashboard polish
- Think First / Socratic mode
- broad mobile polish beyond basics
- coaching packs / micro-transactions
- complex ad optimization

## 🔵 FUTURE (POST-LAUNCH)

- Recurring mistake detection across games should move toward the core Premium experience
- Weakness dashboard (principle tracker — powered by user_principles table)
- Shareable lessons
- Chrome extension
- coaching emails once retention is proven
- pricing experiments only after we understand conversion and usage behavior

---

## SESSION PLANNING




## 📣 MARKETING & GROWTH

### Launch Positioning
- DeepMove teaches why you keep making the same mistakes
- not just engine review
- not just move suggestions
- coaching from your own games, focused on recurring patterns and principles

### Launch Channels
- [ ] r/chessbeginners post — primary target audience
- [ ] r/learnchess post
- [ ] r/chess post with a strong real example
- [ ] chess.com community forums
- [ ] lichess forum
- [ ] ProductHunt launch

### Content Marketing (post-launch)
- [ ] Blog on deepmove.io/blog — chess improvement articles tied to DeepMove's coaching philosophy
- [ ] Example post: "Why your chess accuracy score is lying to you"
- [ ] Example post: "The one habit that fixes 80% of blunders under 1400"
- [ ] Example post: "What your own games reveal about how you actually think"
- [ ] SEO targets: "free chess coaching", "AI chess coach", "chess game review free"

### Partnerships (post-launch)
- [ ] Reach out to smaller chess YouTubers/streamers first
- [ ] Offer free Premium for honest reviews and real feedback
- [ ] Chess club partnerships later if retention is strong
- [ ] Creator programs later, not as a launch dependency

### Growth Metrics To Track
- DAU / MAU
- Free → Premium conversion rate
- percent of users who hit the free cap
- coached games per active user
- LLM cost per active user per month
- retention after first coached game
- retention after first recurring-pattern insight
- Churn rate (monthly)

### Core Growth Principle
- lead with strong real examples, not broad claims
- one believable coaching example will market the product better than ten feature bullets
- the long-term hook is recurring-pattern diagnosis across many games, not just one-off lesson generation

---
## 📝 RAW NOTES (keep these — source of truth for future tasks)
-should we be relying on the engine more? the ai should really be doing the bare minimum right i feel like relying on the llm is not gonna be that valuable for actually makign intelligent and helpful chess coaching insights. open to discussion

-use lichess sounds instead but make sure we have check checkmate castle all accounted for last time we tried we couldnt get those sounds like castle capture or check so maybe just have me go grab all them somewhere




-for lesson: not jumping to correct cirtical moments in the notation / chess board? doesnt change position to the move at all. may be something with the fact we are in the coaching tab now instead of analysis. we also maybe want access to the transcript tho in coach?? so not sure of best way to split it up. 


-giong back one move doesnt update the eval bar properly?


-can only pull 300 games from lichess?



-arrows for manual games look weird ? just 0 no /



-tactics trainer




-need to fix move suggestions lines. a little buggy ocassionaly and suggests shitty moves or moves that are losing. -still suggesting bad moves. like if mate can be prevented in only one way it will still recommend other mvoes? that instatnyl lose.

-way to cache analyses and best move lines? are we already doing this? or only way to finish an analysis is by staying on the page the whole time (cant go back to load page otherwise analysis stops and you have to fully start over)



-have arrows button and other buttons be better? and more concistent across that row of buttons visually


-for dropdowns when it says 300+2 instead of the min (so would be 5+2?)

-have similar dropdown next to move arrows as chessigma
-test FEN string


-refresh on play page doesnt hold stats and takes you back to load?

-thorough systematic audits to make sure everything is as simple and efficient yet powerful as it can possibly be

-make this into an ios app

