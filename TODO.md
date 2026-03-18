# DeepMove Development TODO

**Current Status**: Board logic ✅ complete. Chess mechanics (branching, navigation, board sync) confirmed correct and tested. Coach integration is the next major push.

**Launch Target**: Complete product with coaching, accounts, and mobile compatibility.

**Last Session**: Audit round 4 — memoized GameReport stats + PlayerInfoBox material calc, fixed PGN nesting bug, debounced EvalGraph ResizeObserver, added Vite chunk splitting, wired userElo from game metadata, stable React keys. All 78 tests pass.

**Audit Rounds Completed**: 4 (branch collision, GameReport O(n²), memoization/dedup, perf round 4)



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
- currently authStore.ts:42 
 POST http://localhost:8000/auth/refresh net::ERR_CONNECTION_REFUSED
### TRACK B.2: Feature Extraction Validation (Session: 2-3 hours)
**Status**: ⏸️ BLOCKED on B.1
**Why**: Catch classification bugs early via real games.

**Todo:**
- [ ] Run classifier on 5 moosetheman123 games
- [ ] Print: features extracted, principle detected, confidence score, lesson generated
- [ ] Document any suspicious outputs
- [ ] Fix obvious classifier bugs
- [ ] Add tests for each feature extractor (target: 10+ positions per extractor)

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

### TRACK C.5: Think First Mode (Socratic) — **ITERATE LATER**
- [ ] For MVP: Just 5-step lesson (no Socratic)
- [ ] Later: Add Socratic toggle
- [ ] Later: Blunder check checklist
- [ ] Later: Hint system

---

## 🟣 TRACK D: Accounts & Auth (Partially Complete)

### D.1 — Core Auth + Game Sync ✅ DONE
- [x] SQLAlchemy models: User, Game, Lesson, UserPrinciple
- [x] Alembic migration (001_initial_schema.py)
- [x] JWT auth: register, login, refresh, logout (access token 15min + refresh HttpOnly cookie 7d)
- [x] bcrypt password hashing, token versioning for revocation
- [x] Auth dependency (get_current_user / get_optional_user)
- [x] User routes: GET/PATCH /users/me, DELETE /users/me (GDPR), GET /users/me/export
- [x] Game routes: CRUD + batch upload (50/req) + sync-status
- [x] Frontend authStore (Zustand): login/register/refresh/logout
- [x] API client: auto Bearer token + 401 retry with silent refresh
- [x] AuthModal: email+password form + OAuth button stubs
- [x] UserMenu in NavSidebar: avatar, dropdown, logout
- [x] syncService: IndexedDB ↔ PostgreSQL bi-directional sync
- [x] Auto-migration on signup: pushes local games + links usernames to account
- [x] Silent auth refresh on app load (non-blocking)

### D.2 — Connect Database ⏸️ BLOCKED (needs Supabase credentials)
- [ ] Create Supabase project, get DATABASE_URL
- [ ] Add DATABASE_URL to backend .env
- [ ] Run: `cd backend && alembic upgrade head`
- [ ] Verify tables created in Supabase dashboard
- [ ] Test register → login → sync flow end-to-end

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

### D.4 — Backend Tests (Not Started, 1 health check test exists)
- [ ] Auth flow: register → login → access protected route → refresh → logout
- [ ] Duplicate email registration returns 409
- [ ] Wrong password returns 401
- [ ] Expired/invalid token returns 401
- [ ] Token version revocation (logout invalidates old tokens)
- [ ] Game batch upload + sync-status round-trip
- [ ] GDPR delete cascades all user data
- [ ] Use pytest + httpx AsyncClient with a test DB (separate DATABASE_URL for tests)

---


## 💰 MONETIZATION & LAUNCH

### Pricing Model (Decided)
- **Domain:** deepmove.io (purchased, $60)
- **Free tier:** Unlimited Stockfish analysis + unlimited game imports + 1 AI-coached game review/day (all 2-3 critical moments with full lessons + game summary) + minimal ads
- **Premium ($5/mo or $40/year, 20% annual discount):** Unlimited AI coaching + full account analysis (last 50-100 games) + principle tracker dashboard + weekly coaching email + lesson bookmarking + no ads + priority LLM queue
- **No one-time purchases or credits** — subscription only, keep it simple
- **Break-even target:** ~200 active users with 10% premium conversion + ads

### LLM Model Strategy: Elo-Based Selection
- **Under 1600:** Haiku 4.5 (~$0.003/lesson) — tactical + basic strategic coaching is structured enough for Haiku
- **1600+:** Sonnet 4.6 (~$0.008/lesson) — advanced strategic concepts need richer explanation
- Free vs Premium = quantity + features, not AI quality. Everyone gets the right model for their level.
- ~80% of users are under 1600, so costs stay very close to pure Haiku

### Cost Model (with 60% cache hit rate)
- Per lesson: ~$0.003 (Haiku) / ~$0.008 (Sonnet)
- Per game (2-3 lessons): ~$0.008
- Per free user/month (1 game/day): ~$0.24
- Per premium user/month (3 games/day): ~$0.72
- 200 users total cost: ~$136/mo (hosting + LLM)
- 500 users total cost: ~$352/mo
- 1,000 users total cost: ~$753/mo
- Hosting: Vercel (free) + Railway ($5/mo) + Supabase (free until ~1K users)

### Revenue Projections (10% premium conversion + ads)
- 200 users: $154/mo revenue vs $144/mo cost = +$10
- 500 users: $385/mo revenue vs $352/mo cost = +$33
- 1,000 users: $770/mo revenue vs $753/mo cost = +$17
- 2,000 users: $1,540/mo revenue vs $1,400/mo cost = +$140
- Margins widen as cache hit rate improves over time (→70-80%)

### Competitive Positioning
- vs Chess.com: Way cheaper ($5 vs $15-30), better AI coaching, no platform lock-in
- vs Chessigma: We add principle-based coaching on top of free analysis, fewer/better ads
- vs Lichess: We add AI coaching layer (Lichess has none)
- vs DecodeChess: Cheaper ($5 vs $15), principle-based not position-based
- vs Aimchess: Similar price ($5 vs $5-7), but we teach WHY not just WHAT

### M.1: Stripe Integration (2-3 hours)
- [ ] Create Stripe account + products (Premium Monthly $5, Premium Annual $40)
- [ ] Stripe Checkout for subscription signup (no custom payment UI)
- [ ] Stripe Customer Portal for card management + cancellation
- [ ] Webhook handler: checkout.session.completed → set is_premium = true
- [ ] Webhook handler: customer.subscription.deleted → set is_premium = false
- [ ] Add is_premium and stripe_customer_id to User model
- [ ] Alembic migration for new fields

### M.2: Rate Limiting (1 hour)
- [ ] Middleware: track daily AI coaching usage per user
- [ ] Free users: 1 coached game/day (2-3 lessons count as 1 game)
- [ ] Premium users: unlimited
- [ ] Return 429 with friendly message: "You've used your free coaching for today. Upgrade to Premium for unlimited."
- [ ] Reset counters at midnight UTC

### M.3: Ad Integration (1 hour)
- [ ] Sign up for EthicalAds or Carbon Ads
- [ ] Single banner placement (bottom of page or sidebar)
- [ ] Hide ads for Premium users (check is_premium)
- [ ] Keep it tasteful — one ad max, never intrusive, less than Chessigma

### M.4: Full Account Analysis (3-4 hours) — POST-LAUNCH
- [ ] Batch analysis: pull last 50-100 recent games → run full pipeline on each
- [ ] Aggregate principle violations across all games
- [ ] Generate weakness report: top 3 recurring mistakes + trends + examples
- [ ] Store results for dashboard display
- [ ] Monthly rescan capability (Premium only — tracks improvement over time)
- [ ] Cost per scan: 50 games × $0.008 = ~$0.40 (huge margin on $5/mo)

### M.5: Principle Tracker Dashboard (2-3 hours) — POST-LAUNCH
- [ ] Visual dashboard: principle violation frequency over time
- [ ] Top 3 weaknesses highlighted with specific game examples
- [ ] Progress tracking: "You've reduced blunders by 20% this month"
- [ ] Premium-only feature

### M.6: Deploy to deepmove.io (2-3 hours)
- [ ] Deploy frontend to Vercel, connect deepmove.io domain
- [ ] Deploy backend to Railway
- [ ] Set up Supabase project (production PostgreSQL)
- [ ] Configure env vars, SSL, CORS for production
- [ ] Smoke test full flow: import → analysis → coaching → payment

### Launch Timeline (estimated 4-6 weeks)
1. Finish coaching pipeline (Tracks B + C) — weeks 1-3
2. Monetization infrastructure (Stripe, rate limiting, ads) — weeks 3-4
3. Deploy to deepmove.io — week 4-5
4. Launch + marketing push — week 5-6

### What to Skip for Launch
- OAuth (email/password works fine)
- Weekly coaching emails (post-launch)
- Principle tracker dashboard (post-launch)
- Mobile polish beyond basics
- Think First / Socratic mode (just 5-step lessons)
- Coaching packs / micro-transactions

## 🔵 FUTURE (POST-LAUNCH)

- Recurring mistake detection across games ("3rd time ignoring opponent threats")
- Weakness dashboard (principle tracker — powered by user_principles table)
- Premium tier (~$4/mo) — Stripe integration (separate planning session)
- Ad integration (Carbon Ads / EthicalAds, free tier only)
- Shareable lessons
- Chrome extension

---

## SESSION PLANNING


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
	I distilled 186+ replies from a massive X thread on 10x-ing Claude Code. Here's the actual playbook people are running.

[u/toddsaunders on X](https://x.com/toddsaunders/status/2031436358233760063) kicked off a thread about 10x-ing Claude Code output and it turned into one of the best crowdsourced playbooks I've seen. 186+ replies, all practitioners, mostly converging on the same handful of setups. Not vibes — actual configs people are running daily.

I went through the whole thing and distilled it down. Posting here because I think a lot of people in this sub are still running Claude Code "stock" and leaving a ton on the table.



**The two things literally everyone agrees on:**

**1.** `.env` **in project root with your API keys**

This was the single most-mentioned unlock. Drop your Anthropic key (and any other service keys) into a `.env` at project root. Claude Code auto-loads it. No more copy-pasting keys, no more approving every tool call manually. Multiple people said this alone removed \~80% of the babysitting they were doing. One person called it "the difference between Claude doing work *for* you vs. you doing work *through* Claude."

**2. Take your** [`CLAUDE.md`](http://CLAUDE.md) **seriously — like, dead seriously**

Stop treating it like a README nobody reads. The people getting the most out of Claude Code are stuffing their [`CLAUDE.md`](http://CLAUDE.md) with full project architecture, file conventions, naming rules, decision boundaries, tech stack details — everything. Every new session starts with real context instead of you burning 10 minutes re-explaining your codebase. One dev said they run 7 autonomous agents off a shared [`CLAUDE.md`](http://CLAUDE.md) \+ per-agent context files and hasn't touched manual config in weeks. Boris (the literal creator of Claude Code) has said essentially the same thing — his team checks their [`CLAUDE.md`](http://CLAUDE.md) into git and updates it multiple times a week. Anytime Claude makes a mistake, they add a rule so it doesn't happen again. Compounding knowledge.

If you do nothing else today: set up `.env` \+ write a real `CLAUDE.md`. That was the consensus #1 lever across the entire thread.



**The rest of the stack people are layering on top:**

**Pair Claude Code with Codex for verification.** Tell Claude to use Codex to verify assumptions and run tests. Several replies (one with 19 likes, which is a lot for a reply) said this combo catches edge cases and hallucinations that pure Claude misses. The move is apparently "Claude builds, Codex reviews" — and it pulls ahead of either one solo.

**Autopilot wrappers to kill the approval loop.** The "approve 80 tool calls" friction was a huge pain point. Two repos kept coming up:

* [executive](https://github.com/ncr5012/executive) — one comment called it "literally more than a 10x speed up" once prompts are dialed in
* [get-shit-done](https://github.com/gsd-build/get-shit-done) — does what it says on the tin

These basically keep Claude in full autonomous mode so you're not babysitting every file write.

**Exa MCP for search.** This one surprised me. Exa apparently hijacks the default search tool — you don't even call it manually. Claude Code just starts pulling fresh docs, research, and implementations automatically. Multiple devs said they "barely open Chrome anymore." If you're still alt-tabbing to Google while Claude waits, this is apparently the fix.

**Plan mode 80% of the time.** Stay in plan mode. Pour energy into the plan. Let Claude one-shot the implementation once the plan is bulletproof. One person has Claude write the plan, then spins up a second Claude to review it as a staff engineer. Boris himself said most of his sessions start in plan mode (shift+tab twice). This tracks with everything I've seen — the people who jump straight to code generation waste the most tokens.

**Obsidian as an external memory layer.** Keep your notes, decisions, and research in Obsidian and link it into Claude Code sessions. Gives you a knowledge graph that survives across projects. Not everyone does this but the people who do are very loud about it.



**Bonus stuff that kept coming up:**

* **Voice dictation** — now built in, plus people running StreamDeck/Wispr push-to-talk setups
* **Ghostty + tmux + phone app** — same Claude session on your phone. Someone called it "more addictive than TikTok" (I believe them)
* **Parallel git worktrees** — spin up experimental branches without breaking main. Boris and his team do this with 5+ parallel Claude instances in numbered terminal tabs
* **Custom session save/resume skills** — savemysession, Claude-mem, etc. to auto-save top learnings and reload context
* **Sleep** — the top reply with the most laughs, but multiple devs said fatigue kills the 10x faster than any missing config. Not wrong.



**The full stack in order:**

1. Clone your repo → add `.env` \+ rich [`CLAUDE.md`](http://CLAUDE.md)
2. Install an autopilot wrapper (executive or similar)
3. Point Claude Code at Exa for search + Codex for verification
4. Open Obsidian side-by-side, stay in plan mode until the plan is airtight
5. Turn on voice + tmux so you can dictate and context-switch from mobile

The thread consensus: once this stack is running, a single Claude Code session replaces hours of prompt engineering, browser tabs, and manual testing. The top-voted comments called it "not even close" to stock Claude Code.

Start with `.env` \+ [`CLAUDE.md`](http://CLAUDE.md) today. Layer the rest as you go. That's it. That's the post.

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






## 📣 MARKETING & GROWTH

### Launch Channels
- [ ] r/chess announcement post (show real coaching example, ask for feedback)
- [ ] r/chessbeginners post (primary target audience for AI coaching)
- [ ] r/learnchess post
- [ ] chess.com community forums
- [ ] lichess forum
- [ ] ProductHunt launch

### Content Marketing (post-launch)
- [ ] Blog on deepmove.io/blog — chess improvement articles using DeepMove's coaching philosophy
- [ ] Example post: "Why your chess accuracy score is lying to you" (Studer's leaky roof concept)
- [ ] Example post: "The one habit that fixes 80% of blunders under 1400"
- [ ] SEO targets: "free chess coaching", "AI chess coach", "chess game review free"

### Partnerships (post-launch)
- [ ] Chess YouTuber/streamer outreach — offer free Premium for honest reviews
- [ ] Chess club partnerships — bulk Premium for clubs
- [ ] Chess.com/Lichess content creator programs

### Growth Metrics to Track
- DAU / MAU
- Free → Premium conversion rate (target: 10%)
- Coaching lessons served per day
- LLM cost per user per month
- Churn rate (monthly)

---
## 📝 RAW NOTES (keep these — source of truth for future tasks)


-if game is abandoned, and you do a new move on the analysis board, it should be a branch rather than just continuing notation, right?



-something better for default. can go back in moves without a game loaded? auto labels common openings/labeling positions etc or something? in the default game that you can mess with or in your own transcripts and links to lessons?
-bot options or manual option by default with box for elo name timer coach maybe etc
-when you make a move it unlocks the moves section and it starts like a new game in default?
-and have no eval by default? if playing a bot. or have game analysis board that you can just mess with and see best moves and lines and evals etc like starts a new manual game or something and can reset the transcript or something
-and have the positioning be better? theres no player box so the default board is higher than when it is when we load a game so maybe something more consistent/lower/centered when a game isnt loaded in?

-alt colorways and pieces
-have similar dropdown next to move arrows as chessigma
-test FEN string
-make taking more obvious as a suggested move? slightly like make the dots bigger or bolder maybe?
-have arrows button and classic button be better and more concistent across that row of buttons visually


-thorough systematic audits to make sure everything is as simple and efficient yet powerful as it can possibly be




-make this into an ios app





scaling / pricing plan? → DECIDED — see "💰 MONETIZATION & LAUNCH" section above

PRICING/MONETIZATION PLAN
Free tier is generous on purpose: Unlimited imports + Stockfish + 2-3 coaching lessons per game. The goal is to build a large free user base that loves the product. Premium upgrades from love, not frustration.
Premium (~$4/mo, may increase to $6-8): No ads, bulk account rescans (re-analyze last 50 games with latest improvements), principle tracker dashboard, weekly coaching summary email, lesson bookmarking, priority LLM queue.
Rate limiting is the natural gate: Free users get ~10 LLM coaching calls/day. Premium gets 100. Stockfish analysis is always unlimited (client-side, zero cost). This means free users can review ~3-5 games/day with coaching — generous but bounded.
Stripe Checkout + Customer Portal: Don't build custom payment UI. Stripe handles the checkout page, card management, cancellation. You just handle webhooks to flip is_premium.
Consider annual pricing: $4/mo or $36/year (25% discount). Annual plans reduce churn and lock in revenue.
Consider "coaching packs": Instead of subscription, sell packs of N coaching sessions. Lower commitment, good for casual users. Could coexist with subscription.
Ad revenue (free tier): Single tasteful banner (Carbon Ads / EthicalAds). Expect ~$2-5 CPM. At 10K MAU = ~$20-50/month. Won't pay the bills alone but offsets LLM costs.
Key question for the session: What's the MUST-HAVE that makes someone pay? Principle tracker? Bulk rescans? Or is it just "no ads + more coaching"? The answer shapes everything.





