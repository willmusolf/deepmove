# DeepMove Development TODO

**Current Status**: Board logic ✅ complete. Chess mechanics (branching, navigation, board sync) confirmed correct and tested. Coach integration is the next major push.

**Launch Target**: Complete product with coaching, accounts, and mobile compatibility.

**Last Session**: Audit round 4 — memoized GameReport stats + PlayerInfoBox material calc, fixed PGN nesting bug, debounced EvalGraph ResizeObserver, added Vite chunk splitting, wired userElo from game metadata, stable React keys. All 78 tests pass.

**Audit Rounds Completed**: 4 (branch collision, GameReport O(n²), memoization/dedup, perf round 4)

## � DEVELOPMENT INFRASTRUCTURE

### TRACK D.1: Testing Framework Setup (Session: 1-2 hours)
**Status**: ✅ COMPLETED
**Why**: Essential for maintaining code quality and preventing regressions.

**What was done:**
- [x] Set up Vitest + React Testing Library for frontend tests
- [x] Configured test environment with jsdom
- [x] Added ResizeObserver mock for browser API compatibility
- [x] Created initial test suite for ChessBoard component
- [x] Added tests for board rendering, turn color detection, and legal move calculation
- [x] All tests passing (3/3)

**Test coverage:**
- ChessBoard component rendering
- Chess helper functions (getTurnColor, getLegalDests)
- Browser API mocks (ResizeObserver)

**Next steps:**
- [ ] Add more component tests (EvalBar, MoveList, etc.)
- [ ] Add integration tests for game review flow
- [ ] Add backend API tests
- [ ] Set up CI/CD with test automation

---

## �🟠 NEXT PHASE (COACHING FOUNDATION)

### TRACK B.1: Validate Backend Readiness (Session: 1 hour)
**Status**: ❌ NOT STARTED (environment not set up)
**Why**: Need to verify FastAPI coaching endpoint works before building UI.

**Note**: Backend environment isn't configured (missing pip/uvicorn). Needs setup session.

**Todo:**
- [ ] Configure Python environment (venv or conda)
- [ ] Install backend dependencies
- [ ] Start: `uvicorn app.main:app --reload --port 8000`
- [ ] Try hitting `/api/coaching/lesson` endpoint with test data
- [ ] Verify LLM response structure (expect `lesson`, `confidence`, `cached`)
- [ ] Document any connection issues

### TRACK B.2: Feature Extraction Validation (Session: 2-3 hours)
**Status**: ⏸️ BLOCKED on B.1
**Why**: Catch classification bugs early via real games.

**Todo:**
- [ ] Run classifier on 5 moosetheman123 games
- [ ] Print: features extracted, principle detected, confidence score, lesson generated
- [ ] Document any suspicious outputs
- [ ] Fix obvious classifier bugs

### TRACK C.1: Build Coaching Panel UI (Session: 3-4 hours) — **MVP**
**Status**: ⏸️ BLOCKED on A.3 + B.1
**Why**: Makes coaching visible on screen. Simplest version first.

**Todo:**
- [ ] ReviewPanel: Compose board (with player boxes) + coach panel layout
- [ ] CoachPanel: Right side (desktop) / below board (mobile), fixed-width sidebar style
- [ ] LessonCard: Render 5-step lesson (hardcoded test lesson for now)
- [ ] Style to match board professionalism
- [ ] Make responsive (coach panel stacks below on mobile)

### TRACK C.2: Connect Frontend to Backend Lesson (Session: 2-3 hours) — **MVP**
**Status**: ⏸️ BLOCKED  
**Why**: Actual coaching flow. Determine if everything wires together.

**Todo:**
- [ ] Hook up CoachPanel to useCoaching hook
- [ ] When critical moment detected, fetch lesson from backend
- [ ] Render lesson in LessonCard
- [ ] Show loading state while LLM generates
- [ ] Handle errors gracefully
- [ ] Test on moosetheman123 games

### TRACK C.3: Game Summary (Session: 1-2 hours)
**Status**: ⏸️ BLOCKED
**Why**: Close the game review loop. Simple recap of critical moments.

**Todo:**
- [ ] After game finishes, show GameSummary card
- [ ] List top 2-3 critical moments + principles learned
- [ ] "Try focusing on [principle] in your next games"

---

## 🟡 POLISH & EXPANSION

### TRACK A.4: Board UX Polish (1-2 hours per item)
- [ ] Keyboard navigation (arrow keys to step, spacebar to analyze)
- [ ] Eval bar clarity (who's winning indicator)
- [ ] Move highlighting in move list
- [ ] Last import memory (localStorage)
- [ ] Branching visualization (tree view)

### TRACK T.1: Frontend Test Infrastructure (1-2 hours)
- [ ] Add unit/integration test harness (Vitest + Testing Library)
- [ ] Add test coverage for critical board logic (FEN sync, move validation, branching)
- [ ] Add CI step to run `npm test` for frontend

### TRACK C.4: Mobile Responsiveness (2-3 hours)
- [ ] Player boxes stack vertically
- [ ] Coach panel full-width below
- [ ] Board touch-friendly
- [ ] Test on real phones

### TRACK C.5: Think First Mode (Socratic) — **ITERATE LATER**
- [ ] For MVP: Just 5-step lesson (no Socratic)
- [ ] Later: Add Socratic toggle
- [ ] Later: Blunder check checklist
- [ ] Later: Hint system

---

## 🔵 FUTURE (POST-LAUNCH)

- User accounts + auth
- Game + lesson history
- Recurring pattern detection
- Weakness dashboard
- Premium tier ($4/mo)
- Ad integration
- Shareable lessons
- Chrome extension

---

## SESSION PLANNING

**Immediate (next ~4-6 hours):**
1. Test board freeze with logging — collect console output
2. Identify exact failure point from logs
3. Apply fix + validate on 5+ games
4. Build player info boxes component
5. Wire responsive layout

**Then (~6-8 hours):**
6. Set up backend environment
7. Test coaching endpoint
8. Validate feature extraction on real games
9. Build coaching panel UI
10. Connect frontend→backend

**Then (~4-6 hours):**
11. Game summary card
12. Mobile responsiveness
13. Polish + testing

**Total to MVP**: ~14-20 hours from here


PROMPT 3A: Analysis UX Overhaul (do this first)

# DeepMove: Analysis UX Overhaul Session

## Project
DeepMove chess coaching app. React 18 + TypeScript + Vite frontend. Project root at ~/deepmove-dev/ (use this symlink for all Bash/file ops — the real path has a Unicode apostrophe that breaks tools).

## What to build in this session (7 tasks, in order):

### 1. Elo-Adaptive Analysis Depth
File: `frontend/src/hooks/useStockfish.ts`
- `runAnalysis()` currently hardcodes depth 14
- Read `useGameStore.getState().userElo` at analysis start
- Depth: <1200 → 10, 1200–1600 → 14, 1600+ → 18
- `analyzeGame()` already accepts depth as 3rd param — just pass it through
- Per-position interactive depth stays at 22 (don't change that)

### 2. Eval Bar — Don't Reset After Checkmate
File: `frontend/src/App.tsx`
- After checkmate, per-position analysis returns score ~0, resetting the eval bar to 50/50
- Fix: in App.tsx, track a `lastNonMateEval` ref. When `Chess(displayFen).isCheckmate()` is true, pass the last non-checkmate eval to `<EvalBar>` instead of the live eval

### 3. Classic/Coach View Mode Toggle (main feature)
Files: `frontend/src/components/Board/EvalGraph.tsx`, `frontend/src/App.tsx`

Add `viewMode: 'classic' | 'coach'` state to App.tsx, defaulting to `'classic'`.
Add toggle button in board controls bar (near Flip/Eval/SFX buttons).

**EvalGraph.tsx** — add `viewMode` prop:
- **Classic mode**: fill the area under the eval curve. Above midline (white winning) → `rgba(74, 222, 128, 0.25)` green fill. Below midline (black winning) → `rgba(239, 68, 68, 0.2)` red fill. Use two SVG `<path>` filled areas clipped to each half. Show ALL grade badges in annotation strip (best, excellent, good, inaccuracy, mistake, blunder).
- **Coach mode** (existing behavior): no fill, curve line only + golden critical moment bands. Annotation strip shows only blunder/mistake badges.

### 4. Chess.com Multi-Month Fix
File: `frontend/src/api/chesscom.ts`
- Currently only fetches the most recent monthly archive → empty if no games this month
- Fix: fetch archives list, pull last 3 months, merge, sort by end_time desc, cap at 50 games
- Add a small note in the GameSelector or AccountLink explaining "Showing up to 50 games from the last 3 months"

### 5. Bolder Suggestion Arrows
File: `frontend/src/components/Board/ChessBoard.tsx`
- Find the drawable brushes config (bestMove, goodMove, okMove)
- Increase lineWidth: bestMove → 10, goodMove → 8, okMove → 6
- Read the file first to find exact current values

### 6. Board Letter Offset (a-h labels)
File: `frontend/src/styles/board.css`
- The file/rank labels rendered by chessground are slightly cramped
- Add a small translateX(3px) or similar offset to the chessground coord selectors (likely `.cg-wrap coords.files coord`) to make letters more readable

### 7. Pawn Promotion UX Fix
File: `frontend/src/components/Board/ChessBoard.tsx`
- Current: promotion dialog is slow, pawn snaps back before picker appears
- **Read the file first** to understand the current onMove / chess.move() flow
- Fix: detect pawn-to-last-rank move BEFORE calling chess.move(). Show an inline visual picker (4 piece icons: Q/R/B/N) at the promotion square. Keep the pawn on the destination square while user picks. Only commit chess.move({ promotion: chosen }) after selection.
- Style the picker as a small overlay aligned to the promotion square

## After all 7 tasks: run `npx tsc --noEmit` from frontend/ — fix any TypeScript errors before finishing.

## Key files
- `frontend/src/hooks/useStockfish.ts` — Stockfish wrapper, depth config
- `frontend/src/engine/analysis.ts` — classifyMove(), MoveGrade types
- `frontend/src/components/Board/EvalGraph.tsx` — SVG eval curve, annotation badges
- `frontend/src/components/Board/EvalBar.tsx` — vertical eval bar
- `frontend/src/components/Board/ChessBoard.tsx` — chessground wrapper, promotion, arrows
- `frontend/src/components/Import/AccountLink.tsx` — username input + game fetch
- `frontend/src/api/chesscom.ts` — Chess.com API client
- `frontend/src/styles/board.css` — all CSS (single file, CSS vars, BEM naming)
- `frontend/src/App.tsx` — main app, passes props to all board components
- `frontend/src/stores/gameStore.ts` — Zustand store (has userElo)
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

## 📝 RAW NOTES (keep these — source of truth for future tasks)

**random from will**
#### Load section UX
- [ ] **Chess.com multi-month**: current implementation only pulls the most recent monthly archive. Fix: fetch the last 2-3 monthly archives and merge, capped at 50 games total. The archives endpoint returns a list of available months — iterate backwards.
- [ ] **Username persistence + identity**: after a user loads games for a username, show a subtle "Playing as [username]" indicator. Store their "own" username in localStorage separately from search history. Let them search any username but mark one as "me". (i think we did this with the crown and something in the backend maybe with cachin)
- [ ] **Name truncation**: usernames getting cut off — increase width of the username column or truncate with ellipsis + tooltip on hover.
- [ ] **Loaded game highlight**: when user goes back to Load tab after loading a game, highlight which game is currently loaded in the list.
-add a note or something about how we can only grab the last 50 games and give more space for usernames / stack them in each entry in the load area? im open to suggestions about the 50 game thing or we dont have to if thers a way around it








-if game is abandoned, and you do a new move on the analysis board, it should be a branch rather than just continuing notation, right?

-fix the pawn promotion. it doesnt look right and was delayed in coming out and the pawn moved back to the square it was on before i pressed anyhting just bc of how slow it was to open the list we want it better also the list to be a little bigger


-make the suggested moves lines a little bolder generally. also after checkmate the eval bar resets to even, instead we want to just keep it at the winners side. also move letters on first row move to the right a little. we want to move the text of the letters (a-h) just a few pixels to the right on each square so its more readable.

-something better for default. can go back in moves without a game loaded? auto labels common openings/labeling positions etc or something? in the default game that you can mess with or in your own transcripts and links to lessons?
-bot options or manual option by default with box for elo name timer coach maybe etc
-when you make a move it unlocks the moves section and it starts like a new game in default?
-and have no eval by default? if playing a bot. or have game analysis board that you can just mess with and see best moves and lines and evals etc like starts a new manual game or something and can reset the transcript or something

-alt colorways and pieces
-have similar dropdown next to move arrows as chessigma
-test FEN string
-make taking more obvious as a suggested move? slightly

-make this into an ios app





scaling / pricing plan?

PRICING/MONETIZATION PLAN
Free tier is generous on purpose: Unlimited imports + Stockfish + 2-3 coaching lessons per game. The goal is to build a large free user base that loves the product. Premium upgrades from love, not frustration.
Premium (~$4/mo, may increase to $6-8): No ads, bulk account rescans (re-analyze last 50 games with latest improvements), principle tracker dashboard, weekly coaching summary email, lesson bookmarking, priority LLM queue.
Rate limiting is the natural gate: Free users get ~10 LLM coaching calls/day. Premium gets 100. Stockfish analysis is always unlimited (client-side, zero cost). This means free users can review ~3-5 games/day with coaching — generous but bounded.
Stripe Checkout + Customer Portal: Don't build custom payment UI. Stripe handles the checkout page, card management, cancellation. You just handle webhooks to flip is_premium.
Consider annual pricing: $4/mo or $36/year (25% discount). Annual plans reduce churn and lock in revenue.
Consider "coaching packs": Instead of subscription, sell packs of N coaching sessions. Lower commitment, good for casual users. Could coexist with subscription.
Ad revenue (free tier): Single tasteful banner (Carbon Ads / EthicalAds). Expect ~$2-5 CPM. At 10K MAU = ~$20-50/month. Won't pay the bills alone but offsets LLM costs.
Key question for the session: What's the MUST-HAVE that makes someone pay? Principle tracker? Bulk rescans? Or is it just "no ads + more coaching"? The answer shapes everything.





-FOR OPUS
- flesh out testing more get more coverage make sure core principles and structures are tested and that the tests are created extremely well done and actually test what can break and what we dont want to break with code changes.

