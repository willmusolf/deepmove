# DeepMove — Developer Setup

Everything you need to get from zero to a running dev environment.

## Prerequisites

- Node.js 20.20.2 (`node --version`)
- Python 3.13.7 (`python3 --version`)
- A text editor (VS Code recommended)

No Docker required.

Use the versions pinned in the repo root before you install anything:

```bash
nvm use
```

DeepMove's frontend build depends on Node 20.19+ and Rolldown optional native
bindings. If you install with the wrong Node version, `npm install`, `make
check`, and `make build` can fail in confusing ways.

## Step 1: Get your Anthropic API key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create an account, add a payment method
3. Generate an API key
4. Save it — you'll need it in Step 4

Budget ~$20 to start. Dev testing costs a few dollars/month.

## Step 2: Set up Neon (database)

1. Go to [neon.tech](https://neon.tech) and create a free account
2. Create a new project (pick a region close to you)
3. Go to **Connection Details** and select the **Pooled** connection option
4. Copy the connection string — it looks like: `postgresql://username:[password]@ep-xxx-yyy-zzz.region.aws.neon.tech/neondb?sslmode=require`

## Step 3: Create a backend virtualenv

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
cd ..
```

Using a virtualenv keeps backend tools like `pytest`, `ruff`, and `mypy`
available in the same shell where you run the repo commands.

## Step 4: Install dependencies

```bash
make install
```

This runs `npm install --include=optional` in `frontend/` and
`python -m pip install -r requirements.txt` in `backend/`.

## Step 5: Set up environment files

```bash
# Backend
cp backend/.env.example backend/.env
# Edit backend/.env and fill in:
#   ANTHROPIC_API_KEY=sk-ant-...
#   DATABASE_URL=postgresql://... (from Neon step 3)
#   SECRET_KEY=any-long-random-string

# Frontend
cp frontend/.env.example frontend/.env.local
# frontend/.env.local only needs:
#   VITE_API_URL=http://localhost:8000
```

## Step 6: Run the dev servers

Two terminals:

```bash
# Terminal 1
make dev-backend
# → FastAPI running at http://localhost:8000
# → Check: http://localhost:8000/health should return {"status": "ok"}

# Terminal 2
make dev-frontend
# → Vite running at http://localhost:5173
```

## Step 7: Verify everything works

```bash
make typecheck
make check
make test-backend-smoke
make build
```

This is the pre-launch verification path for a fresh install. If any of these
fail, fix the environment before trusting local results.

Open http://localhost:5173 — you should see the DeepMove app shell with Review,
Play, Profile, and About pages rather than a placeholder page.
Open http://localhost:8000/docs — FastAPI's auto-generated API documentation.

## Claude Code hooks

The `.claude/settings.json` file configures automatic TypeScript checking after every file edit.
This happens automatically in Claude Code — no action needed.

## Common commands

```bash
make dev-frontend    # Vite dev server (:5173)
make dev-backend     # FastAPI server (:8000)
make typecheck       # TypeScript check
make typecheck-backend  # Backend mypy check
make verify-migrations  # Alembic graph check
make test-frontend      # Frontend tests
make test-backend       # Full backend tests (requires TEST_DATABASE_URL)
make test-backend-smoke # Backend non-DB smoke tests only
make test-chess      # Chess logic tests only (use during Track B)
make lint            # Frontend + backend lint
make build           # Production build
```

### Running full backend DB tests locally

The DB-backed pytest suite only runs when `TEST_DATABASE_URL` is set explicitly.
This is intentional so you cannot accidentally point pytest at a dev, staging,
or production database through a generic `DATABASE_URL`.

Example:

```bash
export TEST_DATABASE_URL=postgresql://test:test@localhost:5432/deepmove_test
make test-backend
```

## Project structure

See `CLAUDE.md` for the full directory structure and build order.
See `docs/decisions.md` for all architectural decisions and their rationale.
See `docs/feature-extraction.md` for the chess analysis pipeline spec.
See `docs/principle-taxonomy.md` for all coaching principles.

## Deploy

- **Frontend:** Vercel deploys from GitHub. Preview deploys come from PR branches, production deploys come from `main`.
- **Backend:** Render deploys from GitHub via the `RENDER_DEPLOY_HOOK_URL` GitHub Actions secret. Only backend changes trigger the deploy hook.
- **Database:** Neon hosts both staging and production PostgreSQL databases. Use the pooled connection string in Render env vars.

### Current production hosting

- `https://www.deepmove.io` → Vercel frontend
- `https://api.deepmove.io` → Render backend
- `https://staging-api.deepmove.io` → Render staging backend

### Production env vars

Backend (`Render`):

- `ENVIRONMENT=production`
- `DATABASE_URL=<Neon pooled URL>`
- `SECRET_KEY=<32+ random bytes hex>`
- `ANTHROPIC_API_KEY=<Anthropic key>`
- `ALLOWED_ORIGINS=https://deepmove.io,https://www.deepmove.io`

Frontend (`Vercel` production):

- `VITE_API_URL=https://api.deepmove.io`

Frontend (`Vercel` preview):

- `VITE_API_URL=https://staging-api.deepmove.io`

### Release flow

Use the documented staging → production process in [docs/release-runbook.md](./release-runbook.md).
The shorter overview lives in [docs/release-flow.md](./release-flow.md).

## Getting Stockfish

Stockfish is handled automatically via npm. The `stockfish` npm package ships `stockfish-18-asm.js` (10MB asm.js fallback). A postinstall script in `frontend/package.json` copies it to `frontend/public/stockfish/stockfish.js` on every `npm install --include=optional`.

A thin wrapper at `frontend/public/stockfish/worker.js` calls `importScripts('/stockfish/stockfish.js')` — this is the file the Web Worker loads.

No manual download needed. Just run `npm install --include=optional` in `frontend/`.

**Note:** The npm `stockfish` package does NOT include `.wasm` binaries — only the asm.js fallback. When ready to optimize for performance, download `stockfish-18.wasm` from the nmrugg GitHub releases and switch to the `stockfish-18.js` loader.
