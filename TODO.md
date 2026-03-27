# DeepMove Development TODO

**Current Status**: Board ✅ · Backend ✅ (54 tests, CI green) · Coaching pipeline functional but quality needs overhaul · Play vs Bot ✅ · Game import filters ✅ · Move grading ✅

**Last Session**: 2026-03-25 — Lichess pagination fix (all games now load), tab switch instant (CSS visibility, no remount), per-move analysis persistence (resume mid-analysis on re-select). Coaching pipeline overhaul is top launch blocker.

---

## 🚀 LAUNCH CHECKLIST (remaining blockers)

These things need to happen before launch. Everything else can follow.

### 1. Coaching Pipeline Overhaul (do first — see detailed section below)
The current coaching pipeline is functional but lessons are generic, often wrong, or missing entirely. The classifier only has 5 of 19 rules, 3 of 6 extractors are stubs, and the LLM gets noisy/incorrect facts. This needs the analysis-first rewrite before validation is meaningful.
- [ ] Complete the analysis-first pipeline rewrite (see section below)
- [ ] Run 10 real moosetheman123 games through the new pipeline
- [ ] For each lesson: "Would a chess player actually learn something from this?"
- [ ] Iterate until consistently yes

### 2. Mobile Responsiveness
- [ ] Board fills screen on mobile, touch-friendly moves
- [ ] Player boxes stack vertically on small screens
- [ ] Coach panel full-width below board on mobile
- [ ] Eval graph readable on small screens
- [ ] Test on actual iOS + Android phones
- [ ] Play mode clock display works on mobile

### 3. Stripe + Rate Limiting
- [ ] Create Stripe account + products (Premium Monthly $5, Premium Annual $40)
- [ ] Stripe Checkout for subscription signup
- [ ] Stripe Customer Portal for card management + cancellation
- [ ] Webhooks: `checkout.session.completed` → set `is_premium = true`, cancellation → false
- [ ] Add `is_premium` and `stripe_customer_id` to User model (Alembic migration)
- [ ] Free tier: 1 coached lesson/week (track per user, reset weekly — see Marketing section for rationale)
- [ ] Return 429 with upgrade prompt when limit hit
- [ ] LLM model routing: Haiku for ≤1600, Sonnet for 1600+

### 4. Deploy to deepmove.io
- [ ] Frontend → Vercel, connect deepmove.io domain
- [ ] Backend → Railway (or Render)
- [ ] Production Supabase project (separate from dev)
- [ ] Configure env vars, SSL, CORS for production domains
- [ ] Set ANTHROPIC_API_KEY in production env
- [ ] Smoke test full flow end-to-end on production URL

---

## 📣 MARKETING, LAUNCH & MONETIZATION

### Monetization Model

**Free tier (the viral engine):**
- Unlimited Stockfish analysis — client-side, $0 cost to us
- Move grades, accuracy scores, eval bar, eval graph — all client-side, $0
- 1 AI coaching lesson per week — picks the worst moment from whichever game they review
  - Full Sonnet-quality lesson to maximize wow factor
  - After the free lesson: "DeepMove found 2 more coaching moments. Upgrade to unlock all coaching."
  - Rest of the week: analysis-only with "upgrade for coaching" prompts on critical moments
- 1 small tasteful ad banner (Carbon Ads / EthicalAds) — bottom of page, never intrusive

**Premium ($5/mo or $40/year):**
- All coaching moments unlocked (unlimited games)
- Deep Game Scan: bulk analyze last 50-100 games → recurring weakness report
- Tactics Trainer: puzzles from YOUR missed tactics + Lichess puzzles, spaced repetition
- Improvement tracking dashboard (weakness trends over time)
- Weekly coaching digest email
- Lesson history & bookmarking
- No ads
- Sonnet-quality lessons always (free tier falls back to Haiku if costs spike)

**Why subscription, not one-time:** Tactics trainer + tracking get better the more you play. Ongoing value = justified recurring charge. One-time purchases don't compound.

### Cost & Revenue Projections

| Scale | MAU | LLM cost/mo | Hosting | Total cost | Premium (3%) | Ad rev | Total rev | Profit |
|-------|-----|-------------|---------|------------|--------------|--------|-----------|--------|
| Launch | 1K | ~$30 | $25 | **$55** | $150 | $50 | $200 | +$145 |
| Growth | 10K | ~$300 | $50 | **$350** | $1,500 | $500 | $2,000 | +$1,650 |
| Traction | 50K | ~$1,500 | $100 | **$1,600** | $7,500 | $2,500 | $10,000 | +$8,400 |
| Scale | 300K | ~$9,000 | $300 | **$9,300** | $45,000 | $10,000 | $55,000 | +$45,700 |

**Key cost facts:**
- Stockfish runs client-side = $0 server cost for analysis (competitors pay for this)
- Only LLM calls cost money; 50% cache hit rate assumed
- Free tier: 1 lesson/week = ~$0.01-0.02 per free user per week (negligible)
- Break-even: ~70 premium subscribers (~2,300 MAU at 3% conversion)
- Model routing: Haiku ($0.005/lesson) for free tier cost control, Sonnet ($0.02/lesson) for premium

### Pre-Launch: i18n (8-10 Languages)
- [ ] Install react-i18next framework
- [ ] Extract all UI strings to translation JSON files
- [ ] Target languages: EN, ES, PT, FR, DE, RU, Hindi, Chinese (Simplified), Arabic, Turkish
- [ ] Beat Chessigma's 6-language coverage (they're missing Hindi, Chinese, Arabic, Turkish)
- [ ] Use Claude API for initial translations; native speaker review via Discord community
- [ ] SEO: each language gets own URL path (/es/, /hi/, /ru/) for Google indexing
- [ ] Research exactly which languages Chessigma does NOT support → prioritize those

### Launch Sequence
- [ ] Soft launch in chess Discord servers for beta feedback
- [ ] r/chess post (expect removal — doesn't matter, gets picked up externally like Chessigma's did)
- [ ] r/chessbeginners post (friendlier audience, our core 1000-1400 demographic)
- [ ] Chess.com forums post
- [ ] Lichess forums post — position as "for all chess players" NOT "Chess.com alternative"
- [ ] Product Hunt launch
- [ ] Hacker News "Show HN" post

### Short-Form Video Strategy (Seed + Organic)

**Seed content (make ourselves) — YouTube Shorts, TikTok, Instagram Reels:**
- "DeepMove roasted my chess game" — screen record coaching moments, relatable
- "I found my biggest weakness" — Deep Scan finding recurring patterns, aspirational
- "This free app taught me more than Chess.com Premium" — direct comparison, spicy
- Build-in-public content — showing development, design decisions (people subscribe for the journey)

-also tiktok slide shows of like 5-10 images and isntagram too making like 5+ of these and posting them every day

**Make it shareable (features to build):**
- [ ] Shareable lesson cards — OG image with coaching moment summary for social posts
- [ ] "Share my coaching report" — public URL showing game highlights + coaching
- [ ] Social meta tags (OG image, Twitter card) on all shared links
- [ ] "Can you find the right move?" — shareable puzzle card from coaching moments

**Note:** Chessigma's 3 mostly-dormant YouTube videos got 8K+ views with zero promotion. A random YouTuber finding his Reddit post drove 100K visitors in week 1. Chess content creators are hungry for tools to feature.

### SEO Strategy
- [ ] Launch blog targeting chess improvement searches:
  - "how to stop blundering in chess"
  - "free chess game analysis"
  - "chess improvement plan for beginners"
  - "how to analyze your chess games"
  - "best free chess coaching app"
- [ ] Each blog post funnels to the tool (search → blog → try tool → convert)
- [ ] Translate blog posts into all supported languages (multiplier effect)
- [ ] Technical SEO: fast Vite build, proper meta tags, sitemap.xml, robots.txt
- [ ] Ahrefs or similar for keyword research (find zero-difficulty keywords we can own)

### Community (Day 1)
- [ ] Discord server — feedback, beta testing, engagement, translation help
- [ ] Chess.com club ("DeepMove — Free AI Chess Coaching")
- [ ] Lichess team
- [ ] r/deepmove subreddit (own the namespace even if not active initially)

### Positioning & Messaging
- **Tagline:** "Every chess app tells you WHAT to play. DeepMove teaches you WHY."
- **Core pitch:** "Free game analysis with AI coaching that teaches chess principles from your own games."
- **vs Chessigma:** They show analysis. We teach concepts. Their Supercoach is vaporware; our coaching pipeline is built.
- **vs Chess.com:** Free, 1 tasteful ad, coaching teaches principles not engine lines.
- **NEVER** say "Chess.com alternative" — Lichess fans will attack (lesson from Chessigma article)
- **DO** say "for all chess players" — support both platforms, respect both communities

### Tactics Trainer as Premium Anchor (Marketing Role)
- **The flywheel:** more games → more missed tactics → bigger personal puzzle set → more sub value → user stays subscribed
- **Nobody else does this** — Lichess puzzles are random, Chess.com puzzles are curated, DeepMove puzzles are YOURS
- **Deep Game Scan + Tactics Trainer = the premium selling point**
  - Scan 100 games → extract every missed fork/pin/skewer → build 50-200 personal puzzles
  - Spaced repetition until you stop making those specific mistakes
- **Shareable content:** "DeepMove showed me I've been missing knight forks for 6 months" — video writes itself

---


## 🔥 COACHING PIPELINE OVERHAUL — Analysis-First Rewrite

### The Problem
Current pipeline is **principle-first**: classify each critical moment into 1 of 19 principles → build facts around that principle → LLM writes about the principle. This fails because:
- Only 5 of 19 classifier rules exist (TACTICAL_01/02, OPENING_01/02/05)
- 3 of 6 feature extractors are stubs (kingSafety, pieceActivity, pawnStructure return hardcoded zeros)
- Most moments get `classification: null` → filtered out → no lessons at all
- When lessons do fire, verified facts are noisy/wrong → LLM teaches confidently about incorrect data
- `engineBest` is hardcoded to `[]` → "what should have happened" is always blank

### The Fix: Analysis-First
Flip the model. Instead of classifying a principle and filtering facts around it:
1. Engine + code analyzes **what went wrong** (5 concrete facts per moment)
2. LLM writes it up as terse GM coaching prose (2-4 sentences, blunt)
3. Tag with a category label **after** (for tracking only, not a lesson driver)

The LLM becomes a **copywriter**, not a chess analyst. All chess intelligence stays in deterministic code.

### 6 Mistake Categories (replace 19 principles for 1200-1400)
1. **hung_piece** — left something undefended
2. **ignored_threat** — opponent attacking something, user didn't see it
3. **missed_tactic** — had a winning capture/fork/pin, didn't take it
4. **aimless_move** — move had no purpose (no capture, no threat, no improvement)
5. **didnt_develop** — pieces still on back rank in the opening
6. **didnt_castle** — king exposed in the center

### 5 Facts Per Moment (what the code builds)
1. **Mistake type** — tactical (engine wanted a forcing move) or strategic (engine wanted a quiet improvement). Determined by playing engine's best move on a temp board and checking if it captures/checks.
2. **What your move did** — from moveImpact: "Pushed pawn to a3 — no capture, no threat, no development"
3. **What your move failed to do** — from threats + development: "Left knight on f3 undefended" or "Ignored opponent's bishop attacking your knight" or "Still has 3 pieces undeveloped on move 14"
4. **What the engine move would have accomplished** — from describeEngineMoveIdea: "Castling would have tucked the king to safety and connected the rooks"
5. **What happened next** — look ahead 2-4 moves in eval data: "Position kept deteriorating" or "Eval stabilized"

### Implementation Steps

#### Step A: Implement Stub Extractors
- [ ] **pieceActivity.ts** — currently returns all zeros. Implement:
  - `totalMobility`: sum of legal moves across all non-king pieces
  - `passivePieces`: pieces with 0-2 legal moves (square list)
  - `centralizedPieces`: count on central squares
  - `badBishop`: bishop where majority of own pawns sit on same color squares
  - Note: chess.js `moves()` only works for side to move — flip side-to-move in FEN for after-move positions
- [ ] **kingSafety.ts** — currently returns hardcoded defaults. Implement:
  - `castled`: king position → 'kingside'/'queenside'/'none'
  - `pawnShieldIntegrity` (0-3): count pawns on 3 squares in front of king
  - `openFilesNearKing`: from existing `getOpenFiles()`, filter to king's file ± 1
  - `score` (0-100): +30 uncastled in non-endgame, +15 per missing shield pawn, +10 per open file near king

#### Step B: Fix engineBest Population
- [ ] In `enrichCriticalMoments()` (features.ts), extract engine's best move from `moveEvals[evalIdx - 1].eval.bestMove`
- [ ] Convert UCI → SAN using `beforeChess.move({ from, to, promotion })`
- [ ] Feed into `describeEngineMoveIdea()` and the enriched moment's `engineBest` array
- [ ] Handle edge cases: evalIdx === 0, promotions, castling

#### Step C: New Types + Analysis Facts Builder
- [ ] Add `MistakeCategory` type and `AnalysisFacts` interface to types.ts
- [ ] Write `buildAnalysisFacts()` in classifier.ts — builds the 5 facts + category label
- [ ] Category classifier is after-the-fact (priority: hanging → ignored threat → missed tactic → didn't castle → didn't develop → aimless → unknown)

#### Step D: Update Pipeline Flow
- [ ] Update `enrichCriticalMoments()` to call `buildAnalysisFacts()` and attach to moments
- [ ] Update `useCoaching.ts` — **remove the classification gate** that filters out null-classification moments. Every enriched moment gets a lesson now.
- [ ] Update request body: `category` instead of `principle_id`, `verified_facts` from `analysisFacts.factList`
- [ ] Update `CoachingLesson` interface: `category`/`categoryName` instead of `principleId`/`principleName`

#### Step E: Rewrite Prompts (Terse GM Voice)
- [ ] **system.py** — 2-4 sentences, blunt, confident. Never "the engine suggests." First sentence: what went wrong. Last sentence: one rule for next game. Add few-shot examples of good lessons.
- [ ] **lesson.py** — simplify `build_lesson_prompt()`: remove confidence branching, remove principle block, remove checklist injection. Keep elo tone hints + urgency tiers. Reframe engine idea as concept not specific move.

#### Step F: Backend Schema + Cache Updates
- [ ] Add `category` and `mistake_type` to coaching request schema
- [ ] Update cache key: `{category}:{game_phase}:{elo_band}:{position_hash}`
- [ ] Keep `principle_id` column for backward compat (stores category string now)

#### Step G: Frontend UI Updates
- [ ] Update taxonomy.ts — add `CATEGORIES` map alongside existing `PRINCIPLES`
- [ ] Update CoachPanel + LessonCard to use `categoryName` with colored badge
- [ ] Category badge colors: red (hung_piece), orange (ignored_threat), yellow (missed_tactic), gray (aimless_move), etc.

#### Step H: Validation
- [ ] `npx tsc --noEmit` clean
- [ ] Test 5+ moosetheman123 games through full pipeline
- [ ] Verify: lessons fire on all critical moments (not filtered out), 2-4 sentences, blunt, position-specific
- [ ] Backend tests still pass

### Future Ideas (not this pass)
- [ ] **Pattern tracking across games** — "You've ignored opponent threats in 4 of your last 10 games"
- [ ] **Think First rework** — blunder check checklist with the new category system
- [ ] **pawnStructure extractor** — implement for 1600+ coaching (V2)
- [ ] **Full account analysis** — last 50 games, recurring weakness detection (PREMIUM)

---

## 🟡 NEXT AFTER LAUNCH

### OAuth
- [ ] Lichess OAuth (PKCE) — do first, best documented
- [ ] Google OAuth — standard, authlib already installed
- [ ] Chess.com OAuth — do last, poorly documented; manual username link already works

### Weakness Tracker Dashboard (Premium)
- [ ] Visual: mistake frequency over time (uses new category system)
- [ ] Top 3 recurring weaknesses with game examples
- [ ] Progress tracking: "You've reduced X mistake by Y%"
- [ ] Uses `user_principles` table already in DB

### Tactics Trainer (built from your games)
Every missed tactic from game reviews gets saved to the user's account. Train on YOUR mistakes, not random puzzles.
- [ ] **Save missed tactics** — when analysis-first pipeline detects `missed_tactic` category, store the position (FEN), the tactic the user missed, and the solution line
- [ ] **Tactics training UI** — puzzle-style board: position loads, user finds the tactic. Timer optional.
- [ ] **Mix with real puzzles** — integrate Lichess puzzle database (free API) alongside user's own missed tactics. Ratio: ~50% your misses, ~50% fresh puzzles at your level
- [ ] **Principle-based puzzles** — tag puzzles by category (fork, pin, skewer, discovered attack). If user keeps missing forks, serve more fork puzzles
- [ ] **Spaced repetition** — missed tactics resurface at increasing intervals (1 day, 3 days, 1 week) until the user gets them right
- [ ] **Stats** — solve rate, avg time, weakest tactic type, improvement over time
- [ ] **Opening pattern punishment** — detect when user repeatedly blunders in the same opening (e.g. always drops the c5 pawn in the Sicilian). Generate puzzles from those specific positions teaching how to punish the same mistake when the opponent makes it. Bridges coaching + tactics.
- [ ] Backend: `user_tactics` table (user_id, fen, solution, category, source game_id, next_review_date, solve_count, miss_count)

### Play Mode Polish

### Coach Bots (Play vs GM Personalities)
- [ ] Let users play against bots modeled after famous GMs
- [ ] Each bot has a distinct playstyle (Stockfish contempt + opening book bias) + flavor text
  - Capablanca: positional, simplifies, endgame-focused; trades into clean endings
  - Fischer: dynamic, open games, aggressive rook play
  - Tal: sacrifice-happy, complications over simplicity
- [ ] After the game, coach explains WHY the bot played that way — bridges play mode and coaching
- [ ] Prereq: coaching pipeline quality pass done, play mode fully stable

- [ ] Save bot games to backend after review (currently only saves on review flow load)
- [ ] Board badges (move grade overlays) — reconsider design (currently clutters board)

### UI Polish
- [ ] Move grade badges on board — reconsider or remove
- [ ] Eval graph — chess.com style small colored dots instead of large circles
- [ ] Auto-jump to coach tab when analysis finishes on a new game

---

## 🟣 ACCOUNTS & AUTH

### Core Auth + Sync ✅ DONE
- [x] SQLAlchemy models, JWT auth, bcrypt, token versioning
- [x] User CRUD routes, game routes, batch upload, sync-status
- [x] Frontend authStore, AuthModal, UserMenu, syncService
- [x] Supabase PostgreSQL connected, Alembic migrations done
- [x] CI: 54 backend tests passing

### OAuth (Post-Launch)
See above in "Next After Launch"

---

## ✅ COMPLETED FEATURES

### Board & Game Review
- [x] chessground board, chess.js PGN parsing, move navigation
- [x] Stockfish WASM in Web Worker (asm.js fallback), elo-adaptive depth
- [x] Eval bar, eval graph (inline SVG circles on curve)
- [x] Best lines + multi-PV arrows
- [x] Move grading: best/excellent/good/inaccuracy/mistake/blunder/great/miss (Lichess-aligned thresholds)
- [x] Accuracy formula (Lichess win% model)
- [x] Game import: Chess.com + Lichess APIs
- [x] Game import filters: W/L/D, color, time control, sort (6 modes), opponent search
- [x] Game list 7-day localStorage cache (instant reload)
- [x] IndexedDB persistence (games survive refresh)
- [x] Backend game sync (pushGame after analysis, backendGameId persisted)

### Play vs Bot
- [x] BotPlayPage with Elo slider (500-3000) + time controls + Bot Speed selector (Instant/Fast/Normal/Slow)
- [x] RAF-based clocks, increment
- [x] Dedicated Stockfish worker for bot (UCI_LimitStrength + UCI_Elo)
- [x] Premove support — race condition fixed (chessground setTimeout(1) root cause)
- [x] Opening detection (ECO ~500 entries, longest-match)
- [x] Game result banner (Review as primary CTA on loss)
- [x] Review flow: bot game loads into game review board

### Coaching Pipeline (functional — quality overhaul pending)
- [x] Feature extraction: threats, moveImpact, material, gamePhase, development (kingSafety, pieceActivity, pawnStructure are stubs)
- [x] Critical moment detection (elo-adaptive eval swing thresholds)
- [x] Principle classifier: TACTICAL_01/02, OPENING_01/02/05, Elo gates, confidence scoring
- [x] Backend lesson endpoint: Claude API, LRU cache, DB persistence
- [x] useCoaching hook: enrichment, LLM fetch, stale-data cleanup
- [x] CoachPanel + LessonCard: auto-show lessons, clean prose, no emojis
- [x] Coach navigation: animates move (show before → play move after 650ms)
- [x] verifiedFacts: gaveCheck + movedPieceStillOnDest to prevent LLM hallucination
- [x] DB cache loop closed (backendGameId persisted, passed to coaching endpoint)

---

## 📝 RAW NOTES (keep these — source of truth for future tasks)
-resizing is a nightmare on desktop as well befoer mobile responsiveness maybe work that into the official todo as well







-premoves not working in play mode


-what is chessreps.com and how do we make a free vesrion of it

-badges in transcript are shifting moves to the right of it improperly?  maybe make a tiny bit more space for each move so the badge doesnt push it? chess.com puts hte badges to the left of the move

-badges on board are the same on every branch? each move sould be re evaluated or no? thats what chessigma does and chess.com




-chessigma / chess.com reviews have it so it shows what the best move is AFTER the move is already done in a green arrow. do we want that or keep our version of analysis? but sometimes its consistent and wswithces to suggesting the best moves for the current user in green arrows like ours?



-have arrows button and other buttons be better? and more concistent across that row of buttons visually


-report below graph is mid and just pointless and not the same as chess.com / chessigma? i believe the graph can still be improved too?

-for dropdowns when it says 300+2 instead of the min (so would be 5+2?) or 120+60 weird stuff like that

-have similar dropdown next to move arrows as chessigma
-test FEN string


-refresh on play page doesnt hold stats and takes you back to load?

-thorough systematic audits to make sure everything is as simple and efficient and fast as it can possibly be and for security as well and scaling, all possible standard security measures for injections and anything crucial to making this a big app

-make this into an ios app

