# DeepMove Development TODO

**Current Status**: Board ✅ · Backend ✅ · Coaching pipeline ✅ (analysis-first, coach tab live) · Play vs Bot ✅ · Game import filters ✅ · Move grading ✅

**Last Session**: 2026-04-15 — Responsive layout polish (3 rounds): fixed coord labels (container-query cqw units), nav collapse (logo hidden, ☰ icon), sort dropdown moved to list header, board dvh formula 200→158px (+27px board height), player-info-box 52→44px, app-main padding 1rem→0.75rem, side-col flex-grow (absorbs horizontal slack), ad-col breakpoint 1380→1330px, removed collapsed-nav --board-vw-offset overrides (eliminated board jump on nav toggle), nav-sidebar transition: width 0.2s ease.

---

## 🧭 RECOMMENDED BUILD ORDER FROM HERE

Follow this order unless something urgent breaks:
- [x] 1. Coaching pipeline overhaul ✅
- [ ] 2. Stripe + rate limiting
- [ ] 3. Deploy production stack to `deepmove.io`
- [x] 4. Responsive layout + resizing pass ✅ (core done — board sizing, nav, coord labels, ad threshold)
- [ ] 5. Final polish, audits, and launch cleanup

**Why this order:** coaching quality is the core product, payments + deployment unlock launch, and the responsive/layout pass should happen after the main feature set is stable so it only has to be solved once.

---

## 🚀 LAUNCH CHECKLIST (remaining blockers)

These things need to happen before launch. Everything else can follow.

### 1. Coaching Pipeline Overhaul (do first — see detailed section below)
The current coaching pipeline is functional but lessons are generic, often wrong, or missing entirely. The classifier only has 5 of 19 rules, 3 of 6 extractors are stubs, and the LLM gets noisy/incorrect facts. This needs the analysis-first rewrite before validation is meaningful.
- [ ] Complete the analysis-first pipeline rewrite (see section below)
- [ ] Run 10 real moosetheman123 games through the new pipeline
- [ ] For each lesson: "Would a chess player actually learn something from this?"
- [ ] Iterate until consistently yes

### 2. Responsive Layout + Resizing (final pre-launch polish pass after core features are stable)
- [ ] Define breakpoints before more UI polish: mobile `<640`, tablet `640-1023`, small desktop `1024-1279`, desktop `1280-1535`, wide `1536+`
- [ ] Fix desktop resizing first: board, move list, coach panel, eval graph, and controls should stay usable at common laptop widths (especially 1024-1440)
- [ ] Keep the board as the primary visual anchor on desktop: preserve a strong side-by-side layout on roomy screens, but never let side panels crush the board below a good-looking playable size
- [ ] At constrained desktop/tablet widths, prefer dropping secondary panels below the board over forcing a cramped always-side-by-side layout
- [ ] Rework desktop panel behavior so move list / coach / side modules scroll internally instead of forcing awkward page overflow
- [ ] Keep tab behavior manual at all sizes: never auto-switch users between Analysis / Coach / Load just because the layout changed
- [ ] Keep Analysis as the default-priority panel state in the responsive layout, but require user taps/clicks to switch tabs
- [ ] Audit every row that breaks under width pressure: top action bar, import/filter controls, move-arrow controls, player boxes, tabs, eval widgets
- [ ] Build one shared responsive layout system for Review + Play so both pages use the same breakpoint logic, spacing rules, and board-sizing behavior
- [x] Collapse the left nav/sidebar earlier on smaller laptops so board + panel space wins over persistent navigation chrome
- [ ] Board fills screen on mobile with touch-friendly moves and no horizontal scroll
- [ ] Allow near edge-to-edge board sizing on mobile with tighter page padding/margins so the board stays as large as possible
- [ ] Player boxes stack vertically on small screens
- [ ] Coach panel becomes full-width below board on mobile
- [ ] Eval graph, move list, and action buttons stay readable/tappable on small screens
- [ ] Play mode can simplify secondary UI on mobile, but should still inherit the same core responsive system as Review
- [ ] Play mode clocks, controls, and status area work on phones and narrow laptops
- [ ] Test matrix: browser responsive presets plus actual iPhone and Android devices

#### Responsive Implementation Spec (build to this, not vibes)

**Layout architecture**
- [ ] Replace the current ad hoc sizing with one shared `review/play` shell: `nav` + `content`, then inside content use `board region` + `panel region`
- [ ] Stop sizing the board primarily from viewport height; board size should be driven by available content width first, with height only acting as a cap
- [ ] Give the board region a clear minimum playable size target and let secondary regions yield first
- [ ] Make every non-board region able to shrink and scroll internally without causing page-level horizontal overflow

**Wide desktop (`1536+`)**
- [ ] Keep three clear zones visible: nav, board region, panel region
- [ ] Board should feel premium-sized and visually dominant
- [ ] Review side panel can show tabs + full analysis stack comfortably
- [ ] Play mode keeps move list beside the board, not below it

**Desktop (`1280-1535`)**
- [ ] Keep the two-column board + panel layout
- [ ] Collapse nonessential whitespace before shrinking the board aggressively
- [ ] Nav may stay visible only if board and panel still both look intentional; otherwise collapse nav here too
- [ ] Buttons in the board control row should wrap cleanly instead of overflowing or compressing into ugly tiny pills

**Small desktop (`1024-1279`)**
- [ ] Collapse the left nav/sidebar by default in this range
- [ ] Keep the board first and the panel second
- [ ] If side-by-side still looks good, use a narrower panel with internal scrolling; if not, stack panel under board
- [ ] Review should keep tabs visible, but tab content sits below the board once the side-by-side layout stops looking clean
- [ ] Play should prioritize board + clocks + core controls, with move list allowed below
- [x] Use a compact top header with a menu trigger when nav is collapsed, rather than spending horizontal space on a persistent sidebar

**Tablet (`640-1023`)**
- [ ] Use a stacked layout by default: board block first, panel block second
- [ ] Keep Analysis as the default visible tab, but never auto-switch tabs
- [ ] Player boxes stay attached to the board block and remain easy to scan
- [ ] Eval graph and move list can remain full-width below the board if side-by-side feels cramped
- [ ] Control rows should wrap into two lines cleanly when needed

**Mobile (`<640`)**
- [ ] Board goes near edge-to-edge with tight page padding
- [ ] Player boxes, clocks, and board controls become compact mobile variants; prioritize board size over preserving the full desktop card layout
- [ ] Tabs remain manual; active tab content lives below the board
- [ ] Avoid horizontal scroll everywhere, including move list, import forms, filters, and time-control controls
- [ ] Touch targets should be comfortable: tabs, arrows, move nav, and action buttons must all feel thumb-usable

**Review page behavior**
- [ ] Keep the board/eval bar/player boxes as one visual unit across all breakpoints
- [ ] `Load / Analysis / Coach` tabs should be structurally stable so resizing does not remount or reorder them in surprising ways
- [ ] Analysis content priority order when space is tight: eval status, best lines, eval graph, move list
- [ ] Coach content should scroll within its own region rather than pushing the whole page into awkward heights
- [ ] When stacked below the board, keep analysis information in overview-first order: tabs, eval status, best lines, eval graph, then move list

**Play page behavior**
- [ ] Setup screen and in-game screen should follow the same breakpoint system, not two unrelated responsive patterns
- [ ] In game, preserve the hierarchy: board first, clocks/player boxes second, controls third, move list fourth
- [ ] Arrow/eval toggles are secondary on small screens and may wrap or sit on a second control row
- [ ] Game result banner should never cause the board column to jump unpredictably
- [ ] On tablet/small desktop, move list can stay visible below the board; on phone-sized screens, collapse it behind a clear `Moves` section to protect board space

**Sizing guardrails**
- [ ] Define explicit min/max widths for nav, board region, and panel region instead of relying on flex luck
- [ ] Define a board max size for wide screens and a board minimum target for small desktop/tablet before stacking occurs
- [ ] Keep move list and coach panel on internal scroll containers with predictable max heights in side-by-side mode
- [ ] Prevent duplicate "depth" or status rows from competing for the same visual slot while resizing

**Implementation order**
- [ ] 1. Introduce shared responsive shell and breakpoint tokens
- [ ] 2. Fix board sizing rules
- [ ] 3. Fix nav collapse behavior
- [ ] 4. Fix Review layout and overflow traps
- [ ] 5. Port the same system into Play
- [ ] 6. Run the responsive QA checklist and only then do visual polish

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
- [ ] Production Neon project (separate from dev)
- [ ] Configure env vars, SSL, CORS for production domains
- [ ] Set ANTHROPIC_API_KEY in production env
- [ ] Smoke test full flow end-to-end on production URL
- [ ] Post-launch infra cleanup: verify Vercel auto-deploy triggers correctly on every `main` push
- [ ] Post-launch infra cleanup: lock down GitHub `main` with branch protection / required PR review / required checks / no direct pushes except owner

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

- **Daily TikTok/Instagram slideshows** — 6-10 images pitching a DeepMove feature, auto-generated daily and saved locally for manual review + posting
  - Run: `python scripts/slideshow_generator.py`
  - Output: `scripts/output/slideshows/YYYY-MM-DD/` — PNGs + caption.txt
  - Rotates through 6 feature pitches: game review, analysis board, AI coach, move grading, tactics trainer, play vs bot
  - Requires `OPENAI_API_KEY` in `.env` — see `scripts/requirements_slideshow.txt`
  - Cron (8am daily): `0 8 * * * cd ~/deepmove-dev && python scripts/slideshow_generator.py`

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
- **Primary tagline:** "Every chess app tells you WHAT to play. DeepMove teaches you WHY."
- **Analysis tagline:** "Free chess analysis. Sleek. Fast. Smart." *(use for social content targeting non-coaching users)*
- **Core pitch (coaching angle):** "Free game analysis with AI coaching that teaches chess principles from your own games."
- **Core pitch (analysis angle):** "Lichess-quality analysis, free, no account needed — plus AI coaching on your worst moments."
- **Two-step funnel:** Lead with free analysis to acquire users → coach them once they're in → convert to premium
- **vs Chessigma:** They show analysis. We teach concepts. Their Supercoach is vaporware; our coaching pipeline is built.
- **vs Chess.com:** Free, 1 tasteful ad, coaching teaches principles not engine lines.
- **vs Lichess:** Same free analysis quality, but with AI coaching layered on top.
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

## 🎨 COACHING UX — NEXT PASS (flesh out in next convo)

### Goals
- Make the Coach tab feel alive and personal, not just text in a box
- Give users an easy way to jump between lessons without scrolling
- Explore coaching styles / presentation modes

### Ideas to discuss and spec out

#### 1. Jump to Lessons flow ✅
- Implemented as compact numbered dots (LessonNav.tsx) in coach box top-right
- Color-coded by mistake category, spinner while loading, click to jump to lesson move
- Active dot = last lesson whose half-move index is ≤ currentMoveIndex (not nearest, last-passed)

#### 2. Coach persona / presentation style
- Chess.com has a animated figure (character) that speaks the coaching text
- Options to explore: subtle avatar icon next to the coach box, speech-bubble style callout, or animated thinking emoji while lesson loads
- Open question: how much personality does the coach have? One voice or selectable?

#### 3. Coaching style toggle
- "Hint first" mode — coach asks a Socratic question before revealing the lesson (original Think First concept)
- "Direct" mode (current) — lesson shown immediately
- "Blunt" mode — one-sentence rule, no explanation
- Open question: is this a per-game setting or a global preference?

#### 4. Lesson quality improvements (ongoing)
- Better "aimless move" fallback when all categories miss — describe what DID change positionally
- Sacrifice / trap detection needs real eval recovery logic (currently using futureUserScores proxy)
- Add `missed_tactic` lesson quality — right now the LLM doesn't have enough tactic-specific facts
- Open question: should we show engine best move arrow when lesson is expanded?

#### 6. QA inputs needed before next coaching session
To diagnose and fix lesson quality, bring these to the next session:
- **2-3 bad lessons** — paste the full lesson text + one sentence on what actually happened on the board
- **2-3 wrong category labels** — e.g. "it said Aimless Move but I was playing a rook to an open file"
- **Browser devtools → Network → `/coaching/lesson` request body** — specifically the `verified_facts` array for a bad lesson
- **Backend terminal output** — any errors or warnings logged during lesson generation
- **1 good lesson** — so we know what the quality bar looks like when it works
These examples are the single highest-leverage input for improving lesson accuracy.

#### 5. Summary screen after game review
- After stepping through all moves, show a "Game Summary" panel
- Top 1-2 themes from the game ("You struggled with: Hung Pieces (2x), Ignored Threats (1x)")
- "Your biggest habit to fix" callout
- Open question: this replaces the EvalGraph area, or is it a separate screen?

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

### Practice Area
**Product structure:** add a dedicated `Practice` tab/area rather than overloading `Play` or `Coach`. This becomes the home for opening study, tactics from your games, and future training modes.

**Naming split to avoid confusion:**
- `AI Coach` = review/analysis lessons on completed games
- `Play` = bot games / sparring / future GM personalities
- `Practice` = structured study
- `Openings` = Chessreps-style repertoire trainer inside Practice
- `Tactics` = personal puzzle trainer inside Practice

#### Practice V1
- [ ] Add a top-level `Practice` area
- [ ] Start with two sections inside Practice:
  - `Openings`
  - `Tactics From Your Games`
- [ ] Keep V1 focused on basic concepts first: clean structure, line study, recall flow, progress tracking
- [ ] Leave AI-generated opening explanations out of V1; use curated/human-authored short explanations first
- [ ] Keep Play Mode simple for now: normal bot play only; no coach personalities tied into Practice yet

#### Practice UI / Product Fit (next pass before expanding content)
- [ ] Refactor Practice to use the same shared board-first shell as Review / Play instead of feeling like a separate mini-app
- [ ] Put the board in the same visual slot/space as the other main tabs so switching tabs does not feel jarring
- [ ] Reuse existing DeepMove surface styles, spacing, button language, and panel rhythm; avoid a one-off Practice aesthetic
- [ ] Decide whether Practice should use tabs in the side panel (`Openings`, `Tactics`) or a similar board+panel split to Review
- [ ] Make Practice feel premium and intentional, not like a prototype dashboard bolted onto the app
- [ ] Add a responsive pass specifically for Practice after the shell is unified

### Openings / Repertoire Trainer (Chessreps-style, but free + better UI)
**What Chessreps is:** an opening trainer centered on courses/lines + spaced repetition. Core loop is: pick an opening, learn the line, get quizzed from the resulting positions, and repeat until recall is automatic.

**DeepMove angle:** do the same core opening-reps job for free, but with cleaner UI, faster board feel, better progress tracking, and tighter integration with the rest of the app.

**Product stance:** the base opening reps product should stay free. This is a user-acquisition and retention feature. Premium can later add private imports, deeper personalization, and advanced prep.

#### Openings V1: Free, structured, specific-line training
- [ ] Add `Practice > Openings`
- [ ] Make the interaction intentionally close to Chessreps: user sees a position and must play the specific repertoire move
- [ ] If the user plays an acceptable but non-target move, respond with something like "playable, but in this course we want to know X"
- [ ] Support both `Learn` and `Practice` modes:
  - `Learn`: reveal the line move-by-move with a short explanation
  - `Practice`: hide the answer and require recall from the position
- [ ] Follow the Chessreps progression pattern for V1 structure:
  - each opening is a course with a clear line count
  - `Learn` comes first
  - `Practice` unlocks after at least some line discovery/mastery
  - leave `Drill` / `Time` / extras for later
- [ ] Add short explanations on every move in `Learn` mode, with extra emphasis on branch points and common mistakes
- [ ] Track mastery per line and per position, not just per opening
- [ ] Allow studying from either side: White repertoires and Black defenses/counters
- [ ] Start with authored public repertoires only; leave user-created/community uploads/private PGN import for later

#### Initial Opening Library (V1 launch batch)
- [ ] Launch with 20 starter courses total: 10 White repertoires + 10 Black defenses/counters
- [ ] For each family, split content into very specific lines/chapters rather than one giant blob course
- [ ] Cover both main theory and common counters/sidelines for each starter repertoire
- [ ] Start with beginner/popular basics first before going deeper into niche gambits and traps

#### Exact V1 course slate (commit to this unless real user demand says otherwise)
- [ ] White 1. `Italian Game` — chapters: Giuoco Piano, Two Knights, early ...Bc5 lines, basic anti-Fried-Liver ideas; target `14-18` lines
- [ ] White 2. `Scotch Game` — chapters: main Scotch, ...Bc5 setups, ...Nf6 setups; target `10-14` lines
- [ ] White 3. `Fried Liver Attack` — chapters: main attack, safer fallback if Black declines, common traps; target `8-12` lines
- [ ] White 4. `Vienna Game` — chapters: quiet Vienna systems, Vienna with `Bc4`, anti-...Nf6 basics; target `10-14` lines
- [ ] White 5. `Vienna Gambit` — chapters: accepted, declined, common sidesteps; target `8-12` lines
- [ ] White 6. `Queen's Gambit` — chapters: vs QGD, vs Slav, vs QGA, simple development setups; target `12-16` lines
- [ ] White 7. `London System` — chapters: classic London setup, ...Bf5 lines, ...c5 pressure, kingside attack basics; target `12-16` lines
- [ ] White 8. `Jobava London` — chapters: core setup, ...e6 lines, ...g6 lines, early tactical themes; target `10-14` lines
- [ ] White 9. `English Opening` — chapters: reversed Sicilian structures, ...e5 response, ...c5 symmetry, basic kingside fianchetto plan; target `10-14` lines
- [ ] White 10. `King's Gambit` — chapters: accepted, declined, simple recovery plans, common tactical motifs; target `8-12` lines
- [ ] Black 1. `Caro-Kann Defense` — chapters: Advance, Exchange, Classical/Two Knights, Panov basics; target `14-18` lines
- [ ] Black 2. `Sicilian Defense` — chapters: Open Sicilian basics, Alapin, Closed/Grand Prix, Smith-Morra ideas; target `14-18` lines
- [ ] Black 3. `Scandinavian Defense` — chapters: `...Qxd5`, `...Qa5`, Icelandic-style sideline awareness; target `10-14` lines
- [ ] Black 4. `French Defense` — chapters: Advance, Exchange, Tarrasch, simple development plans vs sidelines; target `12-16` lines
- [ ] Black 5. `Petrov Defense` — chapters: mainline Petrov, early d4 systems, quiet anti-Petrov tries; target `8-12` lines
- [ ] Black 6. `Pirc / Modern Defense` — chapters: Austrian Attack basics, classical development, `Bg5`/`Be3` setups; target `10-14` lines
- [ ] Black 7. `Queen's Gambit Declined` — chapters: main setup, Exchange structure, London-transpose awareness, simple minority-attack defense; target `12-16` lines
- [ ] Black 8. `Slav Defense` — chapters: main Slav setup, Exchange Slav, early `Nc3`/`Nf3` branches, Semi-Slav awareness only where needed; target `12-16` lines
- [ ] Black 9. `King's Indian Defense` — chapters: classical setup, London/Catalan-style anti-KID adjustments, basic kingside attack ideas; target `12-16` lines
- [ ] Black 10. `Dutch Defense` — chapters: Stonewall basics, Leningrad basics, anti-Staunton awareness, simple attacking plans; target `10-14` lines
- [ ] Target total launch library size: roughly `220-300` authored lines, not thousands
- [ ] Rule for course splitting: if users commonly search the branch by name (`Fried Liver`, `Vienna Gambit`), let it be its own course instead of burying it

#### Openings V1.5: Better than Chessreps
- [ ] `Drill` mode: fast consecutive position recall with streaks and fail/retry flow
- [ ] `Timed` mode: same reps but with a clock so lines become practical under pressure
- [ ] Better visuals than plain course lists: opening cards, progress rings, mastery heatmap, recently missed lines
- [ ] `Play From Here`: spawn a bot game from a repertoire position after the trained book move

#### Spaced Repetition / Personalization
- [ ] Add a repertoire review scheduler (`new`, `learning`, `review`, `mastered`) so missed lines resurface at increasing intervals
- [ ] Store per-position recall stats: attempts, misses, last_seen_at, next_review_at, streak
- [ ] Later: use recent reviewed games (maybe last 100-200) to recommend which openings/defenses the user should study
- [ ] Later: build "anti-blunder opening packs" from recurring opening mistakes in real games

#### Data / Content Model
- [ ] Add repertoire entities: `repertoire`, `chapter`, `line`, `line_position`, `user_line_progress`
- [ ] Store each node as FEN + expected move + side to move + tags (`opening`, `gambit`, `defense`, `trap`, `mainline`, `sideline`)
- [ ] Reuse opening detection + SAN/FEN utilities where possible so Review, Play, and Practice share the same chess plumbing
- [ ] Define an internal authoring format for line trees + short explanations before building any editor UI
- [ ] Content sourcing rule: write our own course text/structure, use public-domain or permissively usable chess knowledge where helpful, and engine-check lines for sanity; do not copy proprietary course text/UI assets from competitors

#### Recommended build order for this feature
- [ ] 1. Define the opening-course JSON/content format first (`course`, `chapter`, `line`, `position`, `explanation`, `acceptedMoves`, `targetMove`)
- [ ] 2. Author one complete pilot course end-to-end (`Italian Game`) before building the whole library
- [ ] 3. Build `Practice` shell + `Openings` course list page using mocked/pilot content
- [ ] 4. Build `Learn` mode first; make sure move-by-move explanations feel smooth
- [ ] 5. Build `Practice` mode second with exact-move checking + acceptable-move feedback
- [ ] 6. Add basic progress persistence and per-line mastery
- [ ] 7. Only then expand from 1 pilot course to the full 20-course launch slate

#### Immediate next steps (after the prototype spike)
- [ ] Rebuild the current Practice prototype inside the shared Review / Play layout system
- [ ] Add a `practiceStore` for selected course, selected line, current step, and mastery/progress persistence
- [ ] Finish the Italian pilot to the target 14-18 lines before authoring Scotch / Vienna / Queen's Gambit
- [ ] Add a tiny authoring checklist so every line has: target move, acceptable alternatives, explanation, and sanity-checked legality
- [ ] Only after the shell feels native: add course progress UI and then expand the opening library

#### Premium Later (not MVP)
- [ ] Import PGN/Chessable-style repertoires into a personal library
- [ ] AI-generated personal opening prep from your recent games
- [ ] Private repertoire builder + sharing
- [ ] Advanced prep dashboards and deeper personalization
- [ ] Deep scan recent 100-200 games to recommend openings, defenses, and recurring tactical themes worth practicing

- [ ] Save bot games to backend after review (currently only saves on review flow load)
- [x] Board badges (move grade overlays) — all grades show symbols, pending circle for branch moves

### UI Polish
- [x] Move grade badges on board — all grades shown (★ ✓ · → ?! ? ?? ✗ !! !)
- [ ] Eval graph — chess.com style small colored dots instead of large circles
- [ ] Auto-jump to coach tab when analysis finishes on a new game
- [ ] Add a repeatable responsive QA checklist before shipping UI changes (320, 390, 768, 1024, 1280, 1440, ultrawide)

### iOS App (Post-Launch)
- [ ] Responsive web comes first: do not start iOS app work until the website feels excellent on iPhone-sized screens
- [ ] Start with the simplest good app path after launch: wrap the stabilized web app / shared web experience before considering a true native rebuild
- [ ] Identify native-only wins worth building later: push notifications, share sheet import, saved sessions, haptics, offline game review cache
- [ ] Map backend/auth requirements for mobile clients: token refresh, secure storage, deep links, universal links
- [ ] Plan App Store basics early: Apple Sign In, privacy labels, subscription handling, review guidelines
- [ ] V1 mobile app scope should stay narrow: review games, read coaching, play vs bot, account sync
- [ ] Defer advanced mobile features until web launch is stable: board editor, bulk import, deep settings, admin/debug tooling

---

## 🟣 ACCOUNTS & AUTH

### Core Auth + Sync ✅ DONE
- [x] SQLAlchemy models, JWT auth, bcrypt, token versioning
- [x] User CRUD routes, game routes, batch upload, sync-status
- [x] Frontend authStore, AuthModal, UserMenu, syncService
- [x] PostgreSQL connected (Neon), Alembic migrations done
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
- [x] Premove support — virtual FEN architecture (Chess.com-style, unlimited queue, auto-queen)
- [x] FIX: premove highlight squares not rendering ✅ (handled by virtual FEN approach)
- [x] FIX: board stuck after first premove drag ✅ (fixed via virtual FEN + unified handleBoardMove)
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

-the best lines things that we can click on are forever loading until both the analysis is finished AND we move to another move on the transcript. otherwise its those placeholders for a while. sometimes its forver while the anlaysis is going im sure its sometehing with lcicking on it or moving while the analysis is going in parallel interfering idk make it better and more consistent and good for move 0 too right awya for both games that have alrady been analyzed and new games etc


for ui, the chess board is sometimes smaller then the player box and theres a sliver of gray on the right side of the board only? how do we fix this? make player box slightly smaller or what?


ok great and anything to have codex do after? and clean up the docs and have codex review the work as well 







-ads. how do we get the ball rolling ot acutally have them and make sure we can get money and have them be visual on resize? sometimes if we shrink it horziontally the ad placeholder disapperas too like it can have more space normally on a lot of screen sizes? what will we do for ads on mobile?




-vercel was hacked recently we should rotate keys before anything crucial?


-deploy app before coaching? coming soon? or what just launch as chessigma competitor for now?


-make reels / videos with voiceover for it? plus slideshows idk


-coaching? we need more stats and anlaysis for each move and for everyhting with it to be much much much better










EVENTUALLY
-if you click on a miss symbol it shows you the line for the tactic that you missed? how are misses calculated and all of them for that matter? also add something for show line or something like that that chess.com has?


-make this into an ios app





