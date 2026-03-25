# DeepMove Development TODO

**Current Status**: Board ✅ · Backend ✅ (54 tests, CI green) · Coaching pipeline ✅ · Play vs Bot ✅ · Game import filters ✅ · Move grading overhaul ✅ · Coach UX rework ✅

**Last Session**: 2026-03-24 — Coach rework (auto-show lessons, no reveal button, clean prose voice, no emojis, move animation on navigate), stale data bug fixed, lesson hallucination fixed (gaveCheck + movedPieceStillOnDest in verifiedFacts), system + lesson prompts rewritten (direct/brutal voice, prose output), after-loss Review CTA, Play mode premove race condition fixed.

---

## 🚀 LAUNCH CHECKLIST (remaining blockers)

These 4 things need to happen before launch. Everything else can follow.

### 1. Product Validation — Coaching Quality (do first)
- [ ] Run 10 real moosetheman123 games through full pipeline
- [ ] For each lesson: "Would a chess player actually learn something from this?"
- [ ] Iterate prompts until consistently yes — do this before adding scope
- [ ] Known issues to verify fixed: no more hallucinated captures, direct voice, no emojis

### 2. Mobile Responsiveness (2-3 hours)
- [ ] Board fills screen on mobile, touch-friendly moves
- [ ] Player boxes stack vertically on small screens
- [ ] Coach panel full-width below board on mobile
- [ ] Eval graph readable on small screens
- [ ] Test on actual iOS + Android phones
- [ ] Play mode clock display works on mobile

### 3. Stripe + Rate Limiting (2-3 hours)
- [ ] Create Stripe account + products (Premium Monthly $5, Premium Annual $40)
- [ ] Stripe Checkout for subscription signup
- [ ] Stripe Customer Portal for card management + cancellation
- [ ] Webhooks: `checkout.session.completed` → set `is_premium = true`, cancellation → false
- [ ] Add `is_premium` and `stripe_customer_id` to User model (Alembic migration)
- [ ] Free tier: 3 coached game reviews/week (track per user, reset weekly)
- [ ] Return 429 with upgrade prompt when limit hit
- [ ] Premium: generous usage with fair-use throttles backend-side
- [ ] LLM model routing: Haiku for ≤1600, Sonnet for 1600+ (already planned)

### 4. Deploy to deepmove.io (2-3 hours)
- [ ] Frontend → Vercel, connect deepmove.io domain
- [ ] Backend → Railway (or Render)
- [ ] Production Supabase project (separate from dev)
- [ ] Configure env vars, SSL, CORS for production domains
- [ ] Set ANTHROPIC_API_KEY in production env
- [ ] Smoke test full flow end-to-end on production URL
- [ ] Verify CI deploys automatically on push to main

---

## 🟡 NEXT AFTER LAUNCH

### Coaching Quality — Round 2
- [ ] Expand principle coverage beyond TACTICAL_01/02 + OPENING_01/02/05
- [ ] Add STRATEGIC_01 (Improve Worst Piece) lessons — good ROI for 1200-1400 range
- [ ] Add STRATEGIC_06 (Don't Weaken King's Pawn Shield) — easy to detect, high impact
- [ ] Full account analysis (last 50 games, recurring pattern detection) — PREMIUM feature

### OAuth
- [ ] Lichess OAuth (PKCE) — do first, best documented
- [ ] Google OAuth — standard, authlib already installed
- [ ] Chess.com OAuth — do last, poorly documented; manual username link already works

### Principle Tracker Dashboard (Premium)
- [ ] Visual: mistake frequency over time
- [ ] Top 3 recurring weaknesses with game examples
- [ ] Progress tracking: "You've reduced X mistake by Y%"
- [ ] Uses `user_principles` table already in DB

### Play Mode Polish
- [ ] Save bot games to backend after review (currently only saves on review flow load)
- [ ] Opening name display is working — verify it shows correctly in the UI
- [ ] Board badges (move grade overlays) — currently "meh" on board, consider removing or improving

### Coaching UI Polish
- [ ] Move grade badges on board — reconsider design (currently clutters board)
- [ ] Eval graph — chess.com style small colored dots instead of large circles
- [ ] Consider: auto-jump to coach tab when analysis finishes on a new game

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
- [x] BotPlayPage with Elo slider (500-3000) + time controls
- [x] RAF-based clocks, increment
- [x] Dedicated Stockfish worker for bot (UCI_LimitStrength + UCI_Elo)
- [x] Premove support — race condition fixed (chessground setTimeout(1) root cause)
- [x] Opening detection (ECO ~500 entries, longest-match)
- [x] Game result banner (Review as primary CTA on loss)
- [x] Review flow: bot game loads into game review board

### Coaching Pipeline
- [x] Feature extraction: threats, moveImpact, material, gamePhase, development, kingSafety, pieceActivity, pawnStructure
- [x] Critical moment detection (elo-adaptive eval swing thresholds)
- [x] Principle classifier: TACTICAL_01/02, OPENING_01/02/05, Elo gates, confidence scoring
- [x] Backend lesson endpoint: Claude API, LRU cache, DB persistence
- [x] useCoaching hook: enrichment, LLM fetch, stale-data cleanup
- [x] CoachPanel: auto-show lessons, no reveal button, blunder checklist as non-blocking habit card
- [x] LessonCard: clean prose, no emojis, no Step labels
- [x] Coach navigation: animates move (show before → play move after 650ms)
- [x] Lesson prompts: direct/brutal voice, prose output, no-hallucination rule
- [x] verifiedFacts: gaveCheck + movedPieceStillOnDest to prevent LLM from hallucinating captures
- [x] DB cache loop closed (backendGameId persisted after analysis, passed to coaching endpoint)

---

## 📝 RAW NOTES (keep these — source of truth for future tasks)
-should we be relying on the engine more? the ai should really be doing the bare minimum right i feel like relying on the llm is not gonna be that valuable for actually makign intelligent and helpful chess coaching insights. open to discussion

-use lichess sounds instead but make sure we have check checkmate castle all accounted for last time we tried we couldnt get those sounds like castle capture or check so maybe just have me go grab all them somewhere




-for lesson: not jumping to correct cirtical moments in the notation / chess board? doesnt change position to the move at all. may be something with the fact we are in the coaching tab now instead of analysis. we also maybe want access to the transcript tho in coach?? so not sure of best way to split it up. 


-giong back one move doesnt update the eval bar properly?


-can only pull 300 games from lichess?



-arrows for manual games look weird ? just 0 no /
-eval bar not on by default?


-tactics trainer


-draws dont happen on gaem review if repeat of three moves on branch

-wehn we are doing the moves on an analysis board game and we have the "opponent" (which is manually controlled by the user) take a piece, the pieces taekn dont show up properly. instead there is a ---?
s

-need to fix move suggestions lines. a little buggy ocassionaly and suggests shitty moves or moves that are losing. -still suggesting bad moves. like if mate can be prevented in only one way it will still recommend other mvoes? that instatnyl lose.

-way to cache analyses and best move lines? are we already doing this? or only way to finish an analysis is by staying on the page the whole time (cant go back to load page otherwise analysis stops and you have to fully start over)



-have arrows button and other buttons be better? and more concistent across that row of buttons visually


-for dropdowns when it says 300+2 instead of the min (so would be 5+2?)

-have similar dropdown next to move arrows as chessigma
-test FEN string


-refresh on play page doesnt hold stats and takes you back to load?

-thorough systematic audits to make sure everything is as simple and efficient yet powerful as it can possibly be

-make this into an ios app

