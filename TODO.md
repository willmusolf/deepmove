# DeepMove TODO

**Status**: Board ✅ · Backend ✅ · Coaching pipeline ✅ · Play vs Bot ✅ · Game import ✅ · Move grading ✅ · Deploy ✅ · Security hardening ✅ · CI/CD ✅

**Last session**: 2026-04-26 — codebase audit (dead file cleanup), TODO restructure, git branch explainer. Previous: 2026-04-22 TODO cleanup + launch planning.

---

## 🚀 LAUNCH BLOCKERS

Must ship before launch. Everything else can follow.

- [ ] **Coaching QA** — run 10 moosetheman123 games through full pipeline. For each lesson: "Would a chess player actually learn something from this?" Iterate until consistently yes.
- [ ] **Stripe** — create account + products (Premium $5/mo, $40/yr); Checkout + Customer Portal; webhooks (`checkout.session.completed` → `is_premium=true`); add `is_premium`/`stripe_customer_id` to User model (Alembic migration); free tier 1 lesson/week with 429 + upgrade prompt when limit hit
- [ ] **LLM spend controls** — per-user daily quotas, global ceiling (blocks enabling coaching publicly)
- [ ] **i18n** — react-i18next, extract UI strings, 8–10 languages (EN/ES/PT/FR/DE/RU/HI/ZH/AR/TR); see docs/marketing.md
- [ ] **Responsive layout — full pass** — mobile/tablet polish remaining; see docs/responsive-spec.md for full spec

---

## 🔜 NEXT SPRINT (post-coaching-QA, pre-launch)

- [ ] **Infra: `/health/deep` + `/version`** — DB connectivity health check + commit provenance endpoint
- [ ] **Infra: UptimeRobot** — uptime monitoring on `/health/deep`, doubles as Neon keep-alive
- [ ] **Infra: Rate limiter trust boundary** — verify Render proxy X-Forwarded-For behavior, fix IP extraction if needed
- [ ] **Infra: Release runbook** — extend docs/release-flow.md with staging verification, rollback, emergency procedures
- [ ] **Board badge timing bug** — badges show `grade: undefined` intermittently after moves; investigate whether board badge should use `to` square of `lastMove` instead of `analysisPath[last]`, or store `lastGradedNodeId` separately (see MEMORY.md for root cause)
- [ ] **Re-analysis on refresh** — investigate whether already-analyzed games re-run analysis on page refresh; check cache on prod (may be mobile-only)

---

## 📋 BACKLOG (post-launch)

### OAuth
- Lichess OAuth (PKCE) — do first, best documented
- Google OAuth — standard, authlib already installed
- Chess.com OAuth — do last, poorly documented; manual username link already works

### Weakness Tracker Dashboard (Premium)
- Visual: mistake frequency over time (uses category system)
- Top 3 recurring weaknesses with game examples
- Progress tracking: "You've reduced X mistake by Y%"
- Uses `user_principles` table already in DB

### Tactics Trainer (built from your games)
- Save missed tactics on `missed_tactic` category detection (FEN, solution line, source game_id)
- Tactics training UI: puzzle-style board, timer optional
- Mix with Lichess puzzle database (free API): ~50% your misses, ~50% fresh puzzles at your level
- Spaced repetition: missed tactics resurface at 1d / 3d / 1wk intervals
- Backend: `user_tactics` table (user_id, fen, solution, category, source_game_id, next_review_date, solve_count, miss_count)
- See docs/marketing.md for the flywheel / marketing angle

### Practice Mode
- `PracticePage.tsx` is committed but not routed — wire into App.tsx when Practice is prioritized
- Rebuild prototype inside shared Review/Play layout shell before expanding
- Start with two sections: `Openings` + `Tactics From Your Games`
- Full spec: docs/openings-spec.md

### Coach Bots (Play vs GM Personalities)
- Bots modeled after famous GMs (Capablanca: positional; Fischer: dynamic; Tal: sacrifice-happy)
- After game, coach explains WHY the bot played that way
- Prereq: coaching quality QA done, play mode fully stable

### Coaching UX — Next Pass
- Coach persona / presentation style (avatar icon, speech-bubble, animated thinking)
- Coaching style toggle: "Hint first" (Socratic) / "Direct" (current) / "Blunt" (one sentence)
- Game summary screen after review: top 1–2 themes, "Your biggest habit to fix"
- Shareable lesson cards (OG image for social)

### UI Polish
- Eval graph — chess.com style small colored dots instead of large circles
- Auto-jump to coach tab when analysis finishes on a new game
- Board arrows: start slightly away from center, slightly smaller
- Coord labels: slightly bigger at very large board sizes
- Captured pieces row spacing on mobile (too much space between pieces and name)

### Marketing / Launch
- See docs/marketing.md for full launch sequence, SEO, video strategy, community
- Ads: Carbon Ads / EthicalAds setup; ensure ad placeholder visible at all responsive sizes

### iOS App (Post-Launch)
- Responsive web comes first: don't start until website feels excellent on iPhone
- Wrap stabilized web app before considering true native rebuild
- Apple Sign In, privacy labels, subscription handling required for App Store

---

## 🐛 KNOWN BUGS

- **Board badge `grade: undefined`** — intermittent; board overlay reads wrong node when user moves faster than analysis completes. See MEMORY.md for confirmed root cause + proposed fix.
- **Badges perpetual loading on goBack** — after refresh, badges don't load automatically; going back puts them in perpetual loading; making a new move restores them. Root cause: cache miss on initial load not triggering badge re-fetch.
- **Coord labels too low at very large board** — only visible when devtools panel is open making board huge.
- **Username capitalization in game list** — if loaded with wrong casing, game list shows wrong case (player box shows correct case). Fix: use corrected capitalization from player box in game list.
- **Mobile: back/forward arrows** — should be centered and bigger on mobile, above flip/new game/TC buttons.
- **Mobile: player boxes** — captured pieces row and username have too much space between them.
- **Coming Soon overlay on Practice page** — make it match the style of other Coming Soon screens; keep PracticePage.tsx progress underneath.
- **`Analyse with Coach` in sandbox** — decide: keep "coming soon" or remove button if coaching is not available for sandbox games.

---

## ✅ DONE (reference)

- **Board & Game Review** — chessground, chess.js PGN, Stockfish WASM worker, eval bar, eval graph, best lines + multi-PV arrows, move grading (8 grades, Lichess thresholds), accuracy formula, game import (Chess.com + Lichess), filters/sort, IndexedDB persistence, backend sync
- **Play vs Bot** — Elo slider (500–3000), time controls, bot speed, RAF clocks, premove (virtual FEN, unlimited queue, auto-queen), opening detection, game result banner, review flow
- **Coaching pipeline** — analysis-first rewrite, 6 categories, MoveCoachComment, LessonNav dots, Haiku lessons, progressive fetch, singleton client, DB cache, kill switch
- **Auth + Accounts** — SQLAlchemy, JWT, bcrypt, token versioning, refresh rotation, CRUD routes, authStore, AuthModal, UserMenu, syncService, Neon PostgreSQL
- **Security hardening** — HttpOnly cookies, CORS (explicit origins, no wildcards), CSP headers, rate limiting (slowapi), input validation, password rules, admin ops panel
- **Deploy** — Frontend → Vercel (deepmove.io), Backend → Render (api.deepmove.io), CI/CD, staging pipeline, GitHub branch protection, smoke tests
- **Responsive layout (core)** — board sizing formula, nav collapse, coord labels (cqw), ad column threshold, sort dropdown, mobile menu icon
- **Grade badges** — transcript badges working; board overlay badges partially working (timing bug tracked above)
- **Chess.com API compliance** — sequential fetching, 429 handling, archive caching (IndexedDB), delta reload
- **Lichess delta reload** — `?since=` param, prepend-only on reload
- **Depth analysis overhaul** — always-depth-25, true resume from cached depth, UCI race condition fixed (isready/readyok handshake)

---

## 📝 RAW NOTES

-badges are inaccurate? get a star on a branching move that isnt one of the 2 suggested? should we show more lines like up to 3? and the actual further lines? and we could have a button for any missed tactics? all that stuff is in chess.com i believe idk whats best for all that tho
-if you click on a miss symbol it shows you the line for the tactic that you missed? how are misses calculated and all of them for that matter? also add something for show line or something like that that chess.com has? look for any other possible flaws in the badge logic. we could also add the book badges for theory moves? chess.com does that 



-get rid of tiny emptyness in corners of hover outline on desktop.


-whats up with the tons of folders that we have for each deepmove thing? any way to clean that up or have it be better going forward from now?

On mobile for transcript we could have a horizontally scrolling one like chess.com

-make sure coach/llm calls are not happening when we originally launch the app, also have a scaling plan?

-add something for useers to email / give bugs or anything about

-make reels / videos with voiceover for it? plus slideshows idk. launch as chessigma competitor



AFTER DEPLOYMENT / ADS / MARKETING
-coaching? we need more stats and analysis for each move and for everything with it to be much much much better


-make this into an ios app
