# DeepMove Audit Checklists

Structured audit prompts for ongoing quality, security, and scaling reviews. Run each section before a major release or infrastructure change.

Last full audit: **2026-04-21** (pre-launch security pass)

---

## 1. Security Audit

### Authentication & JWT
- [ ] `SECRET_KEY` is 32+ random chars, not the default — startup fails if not set in prod
- [ ] Access tokens expire in ≤15 minutes
- [ ] Refresh tokens are HttpOnly, Secure, SameSite=Lax cookies, path=/auth
- [ ] Token version (`tv`) validated on every authenticated request
- [ ] Logout increments `token_version` (invalidates all sessions)
- [ ] No tokens stored in localStorage or sessionStorage

### Rate Limiting
- [ ] `/auth/login`: max 10/minute per IP
- [ ] `/auth/register`: max 3/minute per IP
- [ ] `/auth/refresh`: max 20/minute per IP
- [ ] `/coaching/lesson`: max 30/minute per IP (tighten to per-user post-launch)
- [ ] `/games/batch`: max 10/minute per IP
- [ ] 429 responses have a helpful error message (not stack trace)

### CORS
- [ ] `allow_origins` is explicit (no wildcard `*`) — only deepmove.io domains
- [ ] `allow_methods` is explicit: `GET, POST, PATCH, DELETE, OPTIONS` (no `*`)
- [ ] `allow_headers` is explicit: `Content-Type, Authorization` (no `*`)
- [ ] `allow_credentials=True` is correct (needed for HttpOnly cookie refresh)

### Input Validation & Injection
- [ ] All DB queries use SQLAlchemy ORM (parameterized) — no raw SQL string formatting
- [ ] PGN input is bounded (max size check before storing)
- [ ] JSONB fields (`move_evals`, `critical_moments`) have schema validation
- [ ] Email addresses normalized to lowercase before DB insert
- [ ] Password complexity: 8+ chars, at least 1 letter + 1 number
- [ ] No user-controlled input injected into LLM prompts directly
- [ ] LLM output rendered as plain text in React (no `dangerouslySetInnerHTML`)

### Error Handling & Information Exposure
- [ ] Internal exceptions return generic 500 messages to client (no `str(e)` in `detail`)
- [ ] Stack traces never sent to client — only logged server-side
- [ ] Anthropic API errors produce "Lesson generation failed. Please try again."
- [ ] 404 errors don't reveal whether a user/resource exists (use uniform "not found")

### Secrets & Environment
- [ ] `SECRET_KEY` not in source code or git history
- [ ] `ANTHROPIC_API_KEY` not in source code
- [ ] `.env` is in `.gitignore` ✓
- [ ] No API keys in `VITE_*` frontend env vars
- [ ] `pip audit` passes (no known vulnerable packages)
- [ ] `npm audit` passes (no critical frontend vulnerabilities)

### Frontend Security Headers (verified in production via curl)
- [ ] `Cross-Origin-Opener-Policy: same-origin` (required for Stockfish SharedArrayBuffer)
- [ ] `Cross-Origin-Embedder-Policy: require-corp` (required for Stockfish SharedArrayBuffer)
- [ ] `X-Content-Type-Options: nosniff`
- [ ] `X-Frame-Options: DENY` (prevents clickjacking)
- [ ] `Referrer-Policy: strict-origin-when-cross-origin`

### Admin Endpoints
- [ ] `/admin/*` routes check `user.is_admin` (403 if not)
- [ ] Destructive admin operations (delete all lessons) are logged
- [ ] No admin endpoint is publicly discoverable or rate-limit-exempt

---

## 2. Backend Audit

### API Correctness
- [ ] All routes return consistent error formats (HTTPException with clear `detail`)
- [ ] Pydantic schemas validate all request bodies (not raw `dict` or `Any`)
- [ ] Response models match actual return values (no extra leaking fields)
- [ ] Async routes use `async def` (not `def`) for non-blocking I/O
- [ ] Sync DB-bound routes use `def` (not `async def`) to avoid blocking event loop

### Database Efficiency
- [ ] No N+1 queries: use `joinedload` or subquery where relations are accessed
- [ ] Indexes exist on frequently queried columns: `user_id`, `platform_game_id`, `move_number`
- [ ] Batch inserts use bulk operations (not per-row commits in loops)
- [ ] Connection pool: `pool_size=5, max_overflow=10, pool_pre_ping=True` ✓
- [ ] Neon wake-on-startup retry loop is in place ✓
- [ ] `connect_timeout=10` prevents hanging connections ✓

### Caching
- [ ] In-memory LRU cache (`cachetools`, 1000 entries) is in place for lessons ✓
- [ ] Cache key includes `{category}:{game_phase}:{elo_band}:{position_hash}` ✓
- [ ] DB lesson cache checked before LRU (survives restarts) ✓
- [ ] Cache hit rate being monitored (TODO: add metrics endpoint)
- [ ] Upgrade path to Upstash Redis documented (ADR-004)

### Error Handling
- [ ] All external calls (Anthropic API, Lichess, Chess.com) have timeouts
- [ ] Anthropic: `asyncio.wait_for(..., timeout=15)` ✓
- [ ] DB queries: `connect_timeout=10` at pool level ✓
- [ ] LLM failures fall back to template lessons (not 500 errors) ✓
- [ ] All exceptions logged with `logger.exception(...)` before re-raising

### Code Quality
- [ ] No dead imports or unused variables (ruff passes)
- [ ] No hardcoded magic numbers without constants or comments
- [ ] Services are pure functions (no side effects in constructors)
- [ ] `requirements.txt` is pinned (no `>=` for critical packages like SQLAlchemy)

---

## 3. Frontend Audit

### Bundle Size & Performance
- [ ] `npm run build` produces < 500KB gzipped total JS
- [ ] Vendor chunks split correctly: react, chess.js, chessground ✓
- [ ] Stockfish (10MB asm.js) is served from `/public/`, not bundled ✓
- [ ] No unused dependencies in `package.json`
- [ ] Lazy-load coaching panel (future optimization when coaching goes live)

### TypeScript Strictness
- [ ] `strict: true` in tsconfig ✓
- [ ] No `any` casts in critical paths (API responses, chess analysis)
- [ ] API responses validated at runtime (Zod or guard clauses) — **PENDING**
- [ ] No `// @ts-ignore` comments without explanation

### React Performance
- [ ] No components defined inside render functions (causes unmount loops) ✓
- [ ] Heavy computations wrapped in `useMemo` (move tree, analysis results)
- [ ] Event listeners cleaned up in `useEffect` return ✓
- [ ] Stockfish runs in Web Worker — never blocks main thread ✓
- [ ] Zustand state writes for premove+FEN are atomic (single setState) ✓

### State Management
- [ ] Auth tokens only in Zustand memory (never localStorage) ✓
- [ ] UI prefs in sessionStorage (non-sensitive) ✓
- [ ] Games in IndexedDB (survive refresh) ✓
- [ ] No stale closure bugs: verify `useEffect` deps arrays are complete

### API Client
- [ ] All requests have 25s timeout ✓
- [ ] 401 → auto-refresh → retry ✓
- [ ] Refresh failure → clear auth + redirect to login ✓
- [ ] No API keys or secrets in frontend env vars ✓
- [ ] Exponential backoff on 429 — **TODO (currently no backoff)**

### Accessibility (Basics)
- [ ] Board navigation works with keyboard (←/→ arrows) ✓
- [ ] Buttons have accessible labels (not just icons)
- [ ] Color is not the only indicator of move grade (symbols used too) ✓
- [ ] Focus visible on interactive elements

---

## 4. UI/UX Audit

### Loading States
- [ ] Game list: shows skeleton while loading ✓
- [ ] Analysis: shows "Analyzing…" bar with progress ✓
- [ ] Coaching lesson: shows placeholder while fetching
- [ ] Import: shows spinner during Chess.com/Lichess fetch ✓
- [ ] Auth modal: disables submit during in-flight request

### Error States
- [ ] Chess.com rate limit (429) shown to user ✓
- [ ] Lichess fetch failure shown to user ✓
- [ ] Engine load failure shown in eval bar ✓
- [ ] Auth failure shows specific message (wrong password vs. no account)
- [ ] Lesson fetch failure falls back to template lesson (not blank) ✓

### Empty States
- [ ] No games imported yet: shows clear CTA to import
- [ ] No coaching lessons found: shows explanation
- [ ] Bot play setup: sensible defaults (1500 Elo, 5+0 rapid)

### Mobile Usability
- [ ] Board is near-edge-to-edge on mobile
- [ ] Touch targets ≥ 44px (tabs, arrows, import buttons)
- [ ] No horizontal scroll on any screen width ≥ 320px
- [ ] Coach panel full-width below board on mobile
- [ ] Test matrix: 390px (iPhone), 768px (tablet), 1024px (small laptop)

---

## 5. Testing Audit

### Unit Tests (Vitest)
- [ ] `frontend/src/chess/__tests__/` covers: classifier, threats, development, openFiles, pgn ✓
- [ ] Feature extractors tested against ≥10 known positions each
- [ ] Edge cases covered: starting position, checkmate, stalemate, promotion
- [ ] `kingSafety.ts` and `pieceActivity.ts` return hardcoded zeros — **no tests needed until implemented**

### Backend Tests (pytest)
- [ ] 54 tests passing ✓ (as of last session)
- [ ] Auth flow: register, login, refresh, logout, invalid token
- [ ] Coaching: lesson generation, cache hit, DB persistence
- [ ] Game sync: batch upload, deduplication
- [ ] Rate limit: verify 429 after threshold

### Integration Tests (Missing — TODO)
- [ ] Full flow: PGN import → analysis → critical moment → lesson fetch
- [ ] Auth cookie flow across restart
- [ ] Neon wake-on-startup behavior

### Quality Validation (Manual)
- [ ] Load 10 real moosetheman123 games
- [ ] Check 5-10 Haiku lessons: "Would a chess player learn something useful?"
- [ ] Verify lesson category matches position (not hung_piece when piece wasn't hanging)
- [ ] Confirm lesson grade badges match actual move quality

---

## 6. Scaling Audit

### What breaks first at 1,000 users
- **In-memory LRU cache** (1000 entries, process-local) — multiple Railway instances each have separate caches → cache misses double. Fix: Upstash Redis shared cache.
- **Neon free tier** (0.5GB storage, 1 vCPU) — may hit CPU limits under concurrent analysis. Fix: upgrade to Neon Launch ($19/mo) or Scale tier.
- **Anthropic API** — rate limits on Haiku tier. Fix: monitor usage, upgrade tier, add LRU cache hit metrics to reduce unnecessary calls.

### What breaks first at 10,000 users
- **Railway single instance** — needs horizontal scaling or more vCPUs. Fix: Railway Pro + multiple instances or switch to Fly.io.
- **DB connection pool** (pool_size=5, max_overflow=10 = 15 max) — 10k concurrent users will exhaust. Fix: PgBouncer connection pooling or Neon's built-in connection pooling endpoint.
- **Lesson DB table** — grows unbounded. Fix: add TTL on old lessons, periodic cleanup job.

### What breaks first at 100,000 users
- **Anthropic API budget** — even with 40-60% cache hit rate, 100k users × avg 3 lessons/game = significant cost. Fix: expand elo-band LRU cache, ensure cache keys are tight.
- **Neon** — needs dedicated compute, connection pooler. Fix: Neon Scale or migrate to RDS.
- **Chess.com/Lichess proxy** — if either blocks our domain/IP, all imports break. Fix: implement server-side proxy with per-user rate limiting.
- **Static assets** — Vercel CDN handles this well, no action needed.

### Caching Strategy
- [ ] In-memory LRU is MVP (✓ implemented)
- [ ] Next: Upstash Redis (single env var change in `cache.py`)
- [ ] Cache key must include elo_band to prevent cross-band lesson reuse ✓
- [ ] Monitor cache hit rate via admin metrics endpoint (TODO)

### Queue / Background Jobs (Future)
- For bulk game rescans (10+ games), use a job queue (Celery + Redis or Railway Cron)
- For weekly coaching email summaries, use Railway Cron + SendGrid
- For DB cleanup (old lessons), Railway Cron weekly

---

## Audit Run Log

| Date | Scope | Issues Found | Issues Fixed | Notes |
|------|-------|-------------|-------------|-------|
| 2026-04-21 | Full pre-launch security | 12 issues | 6 fixed this session | SECRET_KEY enforcement, rate limiting, CORS, error leakage, COEP headers, password complexity. Remaining: runtime API validation, Zod schema enforcement, audit logging |

