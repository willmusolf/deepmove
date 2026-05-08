# DeepMove Production-Hardening Audit — Round 2

Date: 2026-05-08
Auditor: Claude Sonnet 4.6
Workspace: `~/deepmove-dev`
Branch: `fix/check-escape-grading`

## Executive Summary

Round 1 (2026-05-07) closed the highest-priority gaps: OAuth token exposure, coaching state leaks, missing rate limits, CI gate gaps, and missing DB indexes. Round 2 is a stricter pass focused on automation continuity, operational readiness, and edge-case safety.

This pass found **3 critical** and **7 high** new issues, all distinct from Round 1. Five were fixed in-repo. Three remain as manual review items. All changes passed lint, typecheck, and 227 frontend tests.

---

## Verification

All commands run from the current branch (`fix/check-escape-grading`) after code changes were applied:

- Frontend `npm run lint`: **passed** (zero warnings)
- Frontend `npm run typecheck`: **passed**
- Frontend `npx vitest run`: **passed** — 26 files, 227 tests
- Backend `python -m ruff check app/ tests/`: **passed**
- Backend `python -m pytest tests/ -v`: 5 passed, 88 skipped (intentional — see Round 1 notes on test DB isolation)

---

## New Findings

### Critical

| ID | Issue | Status | Files |
|----|-------|--------|-------|
| C1 | No frontend error observability | Manual review | `ErrorBoundary.tsx`, all `console.error` sites |
| C2 | In-memory global LLM ceiling + LRU cache reset on deploy | Manual review | `backend/app/services/coaching.py` |
| C3 | No secrets scanning in CI | **Fixed** | `.github/workflows/ci.yml` |

---

**C1 — No frontend error observability**

`ErrorBoundary.tsx:16` calls `console.error('[ErrorBoundary]', error, info.componentStack)` and nothing else. Every runtime crash, unhandled promise rejection, and Stockfish worker error is invisible in production — no Sentry, Datadog, or remote log aggregation exists.

Additional uncaptured error sites:
- `useStockfish.ts:61` — `console.error('Stockfish init failed:', err)`
- `useCoaching.ts:146` — `console.error('[useCoaching] enrichCriticalMoments failed:', err)`
- `api/chesscom.ts:156` — `console.warn('Chess.com rate limited...')`

**Impact:** A broken coaching flow or analysis engine in production would not be detected until a user reports it.

**Manual fix required:** Install Sentry (`@sentry/react`) and wire it in `main.tsx`. Then replace the `console.error` calls in `ErrorBoundary.componentDidCatch`, `useStockfish`, and `useCoaching` with `Sentry.captureException()`. The `X-Request-ID` correlation fix below (H3) means backend traces can be linked from Sentry error reports.

---

**C2 — In-memory global LLM ceiling, LRU cache, AND guest quota all reset on deploy**

`backend/app/services/coaching.py` holds three module-level globals that reset to zero on every process restart:

```python
_lesson_cache: LRUCache = LRUCache(maxsize=1000)  # line 23
_guest_usage: dict[str, tuple[int, date]] = {}     # line 24
_global_daily_calls = 0                            # line 25
```

Round 1 flagged `_guest_usage` in the manual review section. This audit found `_global_daily_calls` and `_lesson_cache` have the same problem. A Render deploy during business hours means:
- Every guest can use another 10 free lessons immediately after restart
- The global ceiling (`max_daily_llm_calls = 5000`) resets, potentially allowing daily overspend
- All cached lessons are evicted, causing a spike in LLM calls and cost

The source code already has `# TODO: Replace with Upstash Redis when traffic warrants it` on `_lesson_cache`. That comment should cover all three globals.

**Manual fix required:** Move all three to Upstash Redis (or Neon — daily quota counts can be a simple table). At current DAU this is not urgent, but must be done before horizontal scaling or if deploys happen mid-day.

---

**C3 — No secrets scanning in CI** ✅ Fixed

No CI job was scanning for accidentally committed secrets (API keys, DB passwords, JWT secrets).

**Fix applied:** Added a `secrets-scan` job to `.github/workflows/ci.yml` using `gitleaks/gitleaks-action@v2`. The job runs on every push and PR with full git history (`fetch-depth: 0`). It uses the repo's `GITHUB_TOKEN` and will fail the CI if any secrets are detected.

---

### High

| ID | Issue | Status | Files |
|----|-------|--------|-------|
| H1 | Node version drift: CI uses Node 20, `.nvmrc` specifies 22 | **Fixed** | `.github/workflows/ci.yml` |
| H2 | Anthropic SDK floating pin (`>=0.49.0`) | **Fixed** | `backend/requirements.txt` |
| H3 | No request correlation IDs (client → server) | **Fixed** | `frontend/src/api/client.ts` |
| H4 | Single error boundary covers entire app | Manual review | `frontend/src/App.tsx`, `ErrorBoundary.tsx` |
| H5 | HSTS not applied to staging | **Fixed** | `backend/app/main.py` |
| H6 | No migration downgrade test in CI | **Fixed** | `.github/workflows/ci.yml` |
| H7 | No Python type checking (mypy) | Manual review | — |

---

**H1 — Node version drift** ✅ Fixed

`ci.yml` hardcoded `node-version: "20"` while `.nvmrc` specifies `22.17.0`. Local developers on Node 22 could use APIs or behavior not present in CI Node 20, causing silent divergence.

**Fix applied:** Changed to `node-version-file: "frontend/.nvmrc"`. CI now uses the exact same version as local dev. One source of truth.

---

**H2 — Anthropic SDK floating pin** ✅ Fixed

`requirements.txt` had `anthropic>=0.49.0`. The SDK is updated frequently; a major version bump could silently break async streaming, response parsing, or model IDs in lesson generation with no CI warning.

**Fix applied:** Pinned to `anthropic==0.96.0` (the version currently installed in the project venv, verified via `pip show anthropic`).

---

**H3 — No request correlation IDs** ✅ Fixed

The backend generates and logs an `X-Request-ID` UUID for every request and echoes it back in the response header. But `frontend/src/api/client.ts` was not sending a client-generated request ID. Cross-referencing a user-reported error to a backend log required guessing time windows.

**Fix applied:** Added `'X-Request-ID': crypto.randomUUID()` to every request in `client.ts`. The backend will now use the client's ID instead of generating a new one (the backend uses `request.headers.get("x-request-id") or str(uuid.uuid4())`). Once Sentry is wired (C1), the same ID can be attached to Sentry events for end-to-end tracing.

---

**H4 — Single error boundary covers entire app** — Manual review

`App.tsx` wraps the entire rendered tree in a single `<ErrorBoundary>`. A crash in any component — including a deeply nested analysis panel or the board — produces a full blank page with only a "Something went wrong. Please reload." message.

**Manual fix recommended:** Add granular `ErrorBoundary` wrappers around at minimum:
- The board / analysis area
- The import panel
- The coaching panel

Each boundary can have a component-appropriate fallback: e.g., "Board failed to load — try refreshing" rather than wiping the entire app.

---

**H5 — HSTS not applied to staging** ✅ Fixed

`backend/app/main.py` only set `Strict-Transport-Security` when `settings.environment == "production"`. Staging is served over HTTPS but lacked HSTS, meaning browsers would not enforce HTTPS for staging deployments.

**Fix applied:** Changed the condition to `settings.environment in ("production", "staging")`.

---

**H6 — No migration downgrade test in CI** ✅ Fixed

CI only ran `alembic upgrade head`. The `downgrade()` function in each migration was never tested. A broken downgrade would only be discovered during an actual production rollback — the worst possible time.

**Fix applied:** Added a step to `backend-ci` in `ci.yml`:
```yaml
- name: Test Alembic downgrade roundtrip
  run: alembic downgrade base && alembic upgrade head
```
This runs after the initial `upgrade head`, drops the entire schema, and re-applies all migrations from scratch. It validates both the downgrade and the fresh-install paths in a single step.

---

**H7 — No Python type checking (mypy)** — Manual review

`ruff check` enforces style and catches many bugs, but does not check type annotations. Pydantic models provide field-level safety for request/response schemas, but function signatures between services, routes, and utilities are unchecked. Type errors in route handlers would only surface at runtime.

**Manual fix recommended:** Add `mypy` to `requirements.txt` (dev group) and add a CI step:
```yaml
- name: Type-check with mypy
  run: python -m mypy app/routes/ app/services/ --ignore-missing-imports
```
Start narrow (`routes/` and `services/` only) and expand over time. Estimated < 1 hour of initial fixes.

---

### Medium

| ID | Issue | Status | Files |
|----|-------|--------|-------|
| M1 | Python patch version floating in `.python-version` and CI | Manual review | `.python-version`, `ci.yml` |
| M2 | No frontend startup env validation | **Fixed** | `frontend/src/main.tsx` |
| M3 | No retry backoff for network errors in API client | Manual review | `frontend/src/api/client.ts` |
| M4 | Coaching endpoint trusts client-supplied analysis | Accepted risk | `backend/app/routes/coaching.py` |
| M5 | Admin audit log has no retention policy | Manual review | `backend/alembic/versions/004_add_admin_audit_log.py` |
| M6 | CI only ran on PRs to `main`, not to `staging` | **Fixed** | `.github/workflows/ci.yml` |

---

**M1 — Python patch version floating**

`.python-version` is `3.13` (no patch). CI uses `python-version: "3.13"` (also no patch). A new Python 3.13.X bugfix release could change behavior between dev and CI without any visible signal.

**Manual fix recommended:** Run `python3 --version` in the active venv and pin to that exact version (e.g., `3.13.3`) in both `.python-version` and `ci.yml`.

---

**M2 — No frontend startup env validation** ✅ Fixed

`VITE_API_URL` fell back silently to `http://localhost:8000` if not set. A staging or production Vercel deploy that forgot the environment variable would route all API calls to localhost, causing silent 100% failure.

**Fix applied:** Added to `frontend/src/main.tsx`:
```typescript
if (import.meta.env.PROD && !import.meta.env.VITE_API_URL) {
  throw new Error(
    '[DeepMove] VITE_API_URL is not set. Set it in your Vercel/Render environment variables.',
  )
}
```
The check only fires in production builds (`import.meta.env.PROD`), so local dev with `localhost:8000` continues to work.

---

**M3 — No retry backoff for network errors**

`api/client.ts` only retries on 401 (auth refresh). Network errors and 5xx responses fail immediately. Render cold starts (which can take 2-5s) cause hard failures if the frontend hits the backend before it's warm.

**Manual fix recommended:** Add a single retry with 500ms delay for connection errors (the `'Could not connect to the server'` case in `fetchWithTimeout`). Do not retry timeout aborts — those indicate the server is busy, not unavailable.

---

**M4 — Coaching endpoint trusts client-supplied analysis** — Accepted risk

`POST /coaching/lesson` accepts `eval_before`, `eval_after`, `verified_facts`, and `move_played` from the client. Stockfish runs in-browser; there is no server-side re-verification of position analysis. A user could craft a request with fabricated eval values or facts.

**Assessment:** The LLM produces natural-language coaching text only — not executable code, not database writes. A user manipulating their own lesson quality has low impact. This is an accepted architectural trade-off given the client-side Stockfish design. Document as known limitation.

---

**M5 — Admin audit log has no retention policy**

`admin_audit_log` (added in migration `004`) grows unbounded. There is no TTL, scheduled deletion, or VACUUM policy.

**Manual fix recommended:** Add a Render cron job or pg_cron task:
```sql
DELETE FROM admin_audit_log WHERE created_at < NOW() - INTERVAL '90 days';
```
Run daily. At current admin activity levels this table will stay small for months, but a policy should exist before launch.

---

**M6 — CI did not run on PRs targeting `staging`** ✅ Fixed

`ci.yml` had `on.pull_request.branches: [main]`. Feature branch PRs targeting `staging` skipped all CI checks (lint, typecheck, tests, audit, migration test).

**Fix applied:** Changed to `branches: [main, staging]`. All CI gates now run on PRs to both protected branches.

---

### Low

| ID | Issue | Status | Files |
|----|-------|--------|-------|
| L1 | `trusted_proxy_depth` undocumented | Doc only | `backend/app/rate_limiting.py` |
| L2 | 330KB PNG in `public/` | Optimization | `frontend/public/DeepMove.png` |
| L3 | Accessibility incomplete (WCAG 2.1 AA gaps) | Ongoing | Multiple components |
| L4 | Preference dict allows arbitrary nested structures | Low risk | `backend/app/schemas/user.py` |

**L1:** `trusted_proxy_depth=1` is correct for single Render proxy. If a load balancer is added in front, this must be incremented or rate limiting will use the proxy IP instead of the client IP, making rate limits ineffective. Add a comment in `rate_limiting.py` explaining this.

**L2:** `DeepMove.png` (330KB) could be replaced with a WebP + PNG fallback for ~60% compression savings. Low priority for now.

**L3:** ~8-10 `aria-*` attributes across the codebase. Many interactive elements lack ARIA roles. Keyboard navigation is partial. Address before public launch to meet basic WCAG 2.1 AA requirements.

**L4:** `UserUpdate.preferences` validates top-level key/value size (50 keys × 1KB strings) but not nested object depth. Max payload ~50KB; exploitation impact is low at current scale.

---

## Open Items from Round 1 (Status Update)

| Item | Status |
|------|--------|
| RLS effectiveness (no policies defined) | Still open — app connects as table owner, bypassing RLS. Decide: app-layer auth only, or add restricted DB role + policies before launch. |
| AdSense + CSP conflict | Still open — CSP blocks AdSense loader. Decision needed before enabling ads. |
| Multi-instance quota consistency | Escalated to C2 above — `_guest_usage`, `_global_daily_calls`, and `_lesson_cache` are all in-memory. Must move to Redis/Neon before horizontal scaling. |
| Backend test DB isolation (88 skipped tests) | Still open — full pytest coverage requires a disposable local Postgres. |

---

## In-Repo Fixes Applied

| File | Change |
|------|--------|
| `.github/workflows/ci.yml` | PR trigger now includes `staging` branch; Node uses `.nvmrc`; added `alembic downgrade base && upgrade head` roundtrip step; added `secrets-scan` job with Gitleaks |
| `backend/requirements.txt` | `anthropic>=0.49.0` → `anthropic==0.96.0` |
| `backend/app/main.py` | HSTS now applied to `staging` environment in addition to `production` |
| `frontend/src/api/client.ts` | Added `'X-Request-ID': crypto.randomUUID()` to every outgoing request |
| `frontend/src/main.tsx` | Added startup assertion: throws if `VITE_API_URL` is unset in production builds |

---

## Manual Review Required

1. **Observability (C1):** Install Sentry; wire `ErrorBoundary.componentDidCatch`, `useStockfish`, and `useCoaching` error paths. Attach `X-Request-ID` to Sentry events.
2. **In-memory coaching state (C2):** Move `_lesson_cache`, `_guest_usage`, `_global_daily_calls` to Upstash Redis or Neon table before horizontal scaling or mid-day deploys become a concern.
3. **Granular error boundaries (H4):** Wrap board, import panel, and coaching panel in their own `ErrorBoundary` instances.
4. **Python type checking (H7):** Add `mypy` to CI with a narrow initial scope (`app/routes/`, `app/services/`).
5. **Python patch version (M1):** Pin `.python-version` and `ci.yml` to `3.13.X`.
6. **API client retry backoff (M3):** Add one retry with 500ms delay for connection errors in `fetchWithTimeout`.
7. **Audit log retention (M5):** Add a scheduled job to purge `admin_audit_log` rows older than 90 days.
8. **RLS policies (from Round 1):** Decide on restricted DB role or remove RLS.
9. **AdSense + CSP (from Round 1):** Decide on ad strategy before enabling.
10. **Backend test DB (from Round 1):** Set up a disposable local Postgres so the 88 skipped tests can run in CI.

---

## Automation Improvements Applied

| Before | After |
|--------|-------|
| PRs to `staging` bypassed all CI checks | PRs to `staging` now run full CI |
| Node CI version diverged from `.nvmrc` | CI uses `.nvmrc` — one source of truth |
| Migration `downgrade()` never tested | `downgrade base → upgrade head` roundtrip runs in every CI push |
| No secrets scanning | Gitleaks scans every push and PR |
| Anthropic SDK could auto-upgrade | Pinned to exact version; `pip-audit` will catch CVEs |

---

## Operational Readiness Checklist

| Item | Status |
|------|--------|
| Health endpoint (`GET /health`) | ✅ Returns `{"status":"ok"}` — minimal, no secrets |
| Deep health endpoint (`GET /health/deep`) | ✅ Returns DB status, coaching flag, cache size. Rate-limited 10/min |
| Version endpoint (`GET /version`) | ✅ Returns `commit_sha`, `build_time`, `environment`. Rate-limited 30/min |
| Smoke test on deploy | ✅ CI waits up to 6 min for `/health/deep` + SHA match after every production push |
| HSTS | ✅ Production + staging (fixed this session) |
| CORS origin allowlist | ✅ Explicit per-environment list; no wildcards |
| DB connection pool | ✅ `pool_size=2`, `max_overflow=2`, `pool_pre_ping=True` — tuned for Neon free tier |
| Migration rollback path | ✅ Every migration has `downgrade()`; roundtrip test now in CI |
| Backup / restore | ⚠ Neon provides point-in-time restore on paid plans. Verify this is enabled before launch |
| Secret validation at startup | ✅ `config.py` fails fast if `SECRET_KEY`, `ANTHROPIC_API_KEY`, or `DATABASE_URL` are missing in production |
| Multi-instance safety | ⚠ Coaching quota / cache are in-memory (C2); not safe for horizontal scaling |
| Error observability | ❌ No Sentry/Datadog (C1) |
| Request tracing | ✅ Backend logs `X-Request-ID`; frontend now sends it (fixed this session) |
| LLM spend monitoring | ⚠ `_global_daily_calls` tracked in memory but not persisted or alerted on; no Anthropic budget alert configured |
| Rate limiting | ✅ Per-endpoint limits on all public routes via `slowapi` |
| Secrets scanning | ✅ Gitleaks in CI (fixed this session) |
| Dependency CVE scanning | ✅ `npm audit` + `pip-audit` in CI |
| SAST | ✅ CodeQL (JS/TS + Python) on push/PR/weekly schedule |
