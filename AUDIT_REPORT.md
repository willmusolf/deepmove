# DeepMove Production Readiness Audit

Date: 2026-05-07
Workspace audited: `~/deepmove-dev`

## Executive Summary

DeepMove is close to launchable, but it had a few real production gaps around auth token handling, quota UX, rate-limit coverage, CI enforcement, and hot-query indexing. I fixed the issues that were safe to address in-repo and left a short manual-review list for the items that need product or infrastructure decisions.

## Verification

- Frontend `npm run lint`: passed
- Frontend `npx tsc --noEmit`: passed
- Frontend `npm audit`: passed after dependency refresh
- Frontend `npm run build`: passed under Node `20.20.2`
- Frontend `npm test -- --run`: passed under Node `20.20.2` (`26` files, `227` tests)
- Backend `python -m ruff check backend/app backend/tests`: passed
- Backend `python -m pip_audit -r backend/requirements.txt`: passed
- Backend `python -m pytest backend/tests`: `5` passed, `88` skipped
  Reason: local DB-backed tests are intentionally skipped without a safe test `DATABASE_URL`
- Local default Node version is `18.16.0`, which is below the frontend toolchain requirement (`20.19+`)

## Issues Found

### Critical

- Fixed: OAuth login was returning the access token in the URL fragment and persisting it in `sessionStorage`.
  Files: `backend/app/routes/auth.py`, `frontend/src/main.tsx`, `frontend/src/stores/authStore.ts`, `frontend/src/App.tsx`
- Fixed: Switching away from the Coach tab cleared lesson state and forced lesson re-fetches, which could create avoidable LLM spend.
  File: `frontend/src/hooks/useCoaching.ts`

### High

- Fixed: Several public/admin endpoints were missing rate limits.
  Files: `backend/app/routes/auth.py`, `backend/app/routes/coaching.py`
- Fixed: The frontend hid quota failures behind a generic `Failed to load lesson (429)` message instead of showing the backend’s clear quota text.
  Files: `frontend/src/api/client.ts`, `frontend/src/hooks/useCoaching.ts`
- Manual review: Row Level Security is enabled by migration, but no policies are defined and the app appears to use the table-owner role, which bypasses RLS in practice.
  Files: `backend/alembic/versions/003_enable_rls.py`, `backend/alembic/versions/004_add_admin_audit_log.py`
- Manual review: AdSense is prepared in code, but the current CSP blocks AdSense and Google’s official guidance says static domain allowlists are not stable long-term for AdSense.
  Files: `frontend/vercel.json`, `frontend/src/config/sponsor.ts`
- Manual review: Guest quota tracking and global LLM ceiling tracking are instance-local in memory, so they will drift across multiple backend instances or after restarts.
  File: `backend/app/services/coaching.py`

### Medium

- Fixed: Batch game sync could return raw exception text to clients.
  File: `backend/app/routes/games.py`
- Fixed: Hot query paths were missing composite indexes for game listing and lesson lookup.
  Files: `backend/alembic/versions/006_add_query_indexes.py`, `backend/app/models/game.py`, `backend/app/models/lesson.py`
- Fixed: CI was not running frontend lint and was not validating Alembic migrations.
  File: `.github/workflows/ci.yml`
- Fixed: Backend connection pool defaults were large for a small Neon tier.
  File: `backend/app/database.py`
- Fixed: Env examples did not fully reflect the config surface and used credential-shaped placeholder values.
  Files: `.env.example`, `frontend/.env.example`, `backend/app/config.py`
- Manual review: Local backend DB tests are easy to skip accidentally because they depend on an explicit safe test `DATABASE_URL`; do not point them at a shared/dev/prod database because the test fixture drops tables.
  File: `backend/tests/conftest.py`

### Low

- Fixed: Removed a few dead exports and debug-only console warnings.
  Files: `frontend/src/api/chesscom.ts`, `frontend/src/chess/classifier.ts`, `frontend/src/chess/eloConfig.ts`, `frontend/src/services/gameDB.ts`, `frontend/src/App.tsx`
- Manual review: An ignored local `backend/.env` file exists in the working tree. I left it untouched because it is user-local config, not repo state.

## Issues Fixed

- Reworked OAuth login to bootstrap from the refresh cookie instead of passing bearer tokens through the URL hash.
- Preserved coaching lessons across Analysis/Coach tab switches and added timer cleanup to prevent stale updates after unmount/game changes.
- Added rate limits to OAuth entrypoints, OAuth callbacks, link-start endpoints, and the secondary coaching/admin cache endpoints.
- Improved quota error messaging so users now get the backend’s explicit “Daily coaching limit reached” message.
- Sanitized batch upload failure responses so internal exception text is not leaked to clients.
- Added composite indexes for:
  - `games(user_id, end_time desc)`
  - `lessons(game_id, user_id, move_number, principle_id)`
- Reduced DB pool size for small Neon usage.
- Updated CI to run:
  - frontend audit
  - frontend lint
  - frontend typecheck
  - backend Alembic upgrade
  - backend lint/tests/audit
- Refreshed `.env.example` and `frontend/.env.example` to match current config/env usage.
- Updated the estimated per-lesson LLM cost default from `0.01` to `0.0015`.
- Cleared the frontend `npm audit` finding.

## Manual Review Required

- RLS effectiveness:
  `ENABLE ROW LEVEL SECURITY` is present, but there are no explicit policies. If the app continues to connect as owner/superuser-equivalent, RLS is mostly ceremonial. Decide whether to:
  - keep app-layer auth only, or
  - move to restricted DB roles with real policies
- AdSense + CSP:
  Current CSP is intentionally strict, but that conflicts with the ad loader. Before enabling ads, decide whether to:
  - keep strict CSP and disable AdSense, or
  - rework CSP around Google’s documented AdSense requirements and update privacy/cookie/compliance flows
- Multi-instance quota consistency:
  Guest quota counts, the lesson LRU cache, and the global daily LLM ceiling are all in-memory per process. For horizontal scaling, move these to Redis/Upstash or another shared store.
- Safe backend test DB:
  Add a disposable local Postgres profile or containerized test target so full DB-backed pytest coverage can run locally without any risk to shared data.
- Dead future-facing UI exports:
  `frontend/src/components/Layout/Header.tsx`, `frontend/src/components/Layout/Footer.tsx`, and `frontend/src/components/Practice/PracticePage.tsx` still look unreferenced, but I left them alone because they appear to be staging/future-route work.

## Auth Requirements By Endpoint

### Public / anonymous

- `GET /health`
- `GET /health/deep`
- `GET /version`
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`  
  Cookie-based; requires a valid refresh cookie, not a bearer token
- `GET /auth/google`
- `GET /auth/google/callback`
- `GET /auth/lichess`
- `GET /auth/lichess/callback`
- `GET /auth/chesscom`  
  Public, but returns `501`
- `POST /coaching/lesson`  
  Auth optional; guest flow allowed with separate quota behavior
- `POST /coaching/socratic`  
  Public placeholder endpoint

### Authenticated user required

- `POST /auth/logout`
- `POST /auth/google/link/start`
- `POST /auth/lichess/link/start`
- `GET /users/me`
- `PATCH /users/me`
- `DELETE /users/me`
- `GET /users/me/export`
- `PATCH /users/me/password`
- `GET /games/`
- `GET /games/{game_id}`
- `POST /games/`
- `POST /games/batch`
- `POST /games/sync-status`
- `DELETE /games/{game_id}`

### Admin only

- `DELETE /coaching/cache`
- `GET /admin/ops/status`
- `GET /admin/audit-log`
- `POST /admin/ops/coaching`
- `POST /admin/ops/cache/lessons/clear`
- `DELETE /admin/game/{game_id}/lessons`
- `DELETE /admin/games/lessons/all`

## LLM Cost And Scaling

### Current limits from config

- Free user daily lessons: `50`
- Premium user daily lessons: `500`
- Guest daily lessons: `10`
- Global daily LLM ceiling: `5000`
- Per-call estimated cost now set to: `$0.0015`

### Request volume per game

- `frontend/src/engine/criticalMoments.ts` returns at most `3` critical moments per game.
- That means the current maximum lesson generation volume is `3` lesson calls per reviewed game.
- In practice, uncached games will usually be `2-3` calls; cached repeats may be lower.

### Pricing basis

- Current configured lesson model: `claude-haiku-4-5-20251001`
- Anthropic’s public Haiku 4.5 page lists pricing at `$1 / 1M input tokens` and `$5 / 1M output tokens`.
  Source: https://www.anthropic.com/claude/haiku
- Sample prompt sizing from the repo:
  - system prompt: `2877` chars / `502` words
  - lesson prompt: `1061` chars / `182` words
- Practical estimate: about `~1,000` input tokens and `~100` output tokens per lesson
- Approx cost per lesson: `~$0.0015`
- Approx cost per uncached game at `3` lessons: `~$0.0045`

### Monthly cost estimate

Assumption: `1` reviewed game per DAU per day, `3` uncached lessons per game.

| DAU | Approx monthly lesson calls | Approx monthly cost |
| --- | ---: | ---: |
| 100 | 9,000 | $13.50 |
| 1,000 | 90,000 | $135 |
| 10,000 | 900,000 | $1,350 |

Notes:

- If real games average closer to `2` lessons, these numbers drop by about one third.
- Same-instance cache hits lower spend further.
- Multi-instance deployments without a shared cache will be less efficient than these estimates.

## Current Caching Strategy

### Frontend

- IndexedDB:
  - analyzed games
  - immutable Chess.com monthly archive responses
- `sessionStorage`:
  - review state
  - branch grades
  - play session state
  - OAuth/link status flags
- `localStorage`:
  - session hint
  - linked usernames
  - UI prefs

### Backend

- In-memory LRU lesson cache keyed by `category + game_phase + elo_band + position_hash`
- DB-backed lesson reuse for authenticated users when the same game/move/principle is already stored
- In-memory guest quota counters
- In-memory global LLM daily call counter

### Recommendations

- Add shared response caching for identical positions across instances.
- Add a real circuit breaker around Anthropic outages instead of relying only on fallback generation after exceptions.
- Move guest/global usage tracking to Redis or another shared backend before multi-instance scaling.

## Recommended Changes Before Marketing Launch

- Decide whether ads are truly in-scope for launch; if yes, resolve the CSP/AdSense/privacy stack deliberately before enabling them.
- Add a safe disposable Postgres test target for local full-suite backend runs.
- Decide whether RLS is a real security boundary or just documentation. If it is real, add actual policies and non-owner DB roles.
- Move quota/cache state off process memory before scaling the backend horizontally.
- Standardize local Node on `20.19+` so `npm run build` and `npm test` work without the temporary `npx -p node@20` workaround.
