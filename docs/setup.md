# DeepMove — Developer Setup

Everything you need to get from zero to a running dev environment.

## Prerequisites

- Node.js 18+ (`node --version`)
- Python 3.11+ (`python3 --version`)
- A text editor (VS Code recommended)

No Docker required.

## Step 1: Get your Anthropic API key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create an account, add a payment method
3. Generate an API key
4. Save it — you'll need it in Step 4

Budget ~$20 to start. Dev testing costs a few dollars/month.

## Step 2: Set up Supabase (database)

1. Go to [supabase.com](https://supabase.com) and create a free account (personal, not org)
2. Create a new project (pick any region close to you)
3. Wait ~2 minutes for the project to spin up
4. Go to **Settings → Database → Connection string → URI**
5. Copy the connection string — it looks like: `postgresql://postgres:[password]@[host]:5432/postgres`

## Step 3: Install dependencies

```bash
make install
```

This runs `npm install` in `frontend/` and `pip install -r requirements.txt` in `backend/`.

## Step 4: Set up environment files

```bash
# Backend
cp .env.example backend/.env
# Edit backend/.env and fill in:
#   ANTHROPIC_API_KEY=sk-ant-...
#   DATABASE_URL=postgresql://... (from Supabase step 3)
#   SECRET_KEY=any-long-random-string

# Frontend
cp frontend/.env.example frontend/.env.local
# frontend/.env.local only needs:
#   VITE_API_URL=http://localhost:8000
```

## Step 5: Run the dev servers

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

## Step 6: Verify everything works

```bash
make typecheck    # Should pass with 0 errors
make test         # Should pass (basic smoke tests)
```

Open http://localhost:5173 — you should see the DeepMove placeholder page.
Open http://localhost:8000/docs — FastAPI's auto-generated API documentation.

## Claude Code hooks

The `.claude/settings.json` file configures automatic TypeScript checking after every file edit.
This happens automatically in Claude Code — no action needed.

## Common commands

```bash
make dev-frontend    # Vite dev server (:5173)
make dev-backend     # FastAPI server (:8000)
make typecheck       # TypeScript check
make test            # All tests
make test-chess      # Chess logic tests only (use during Track B)
make lint            # Frontend + backend lint
make build           # Production build
```

## Project structure

See `CLAUDE.md` for the full directory structure and build order.
See `docs/decisions.md` for all architectural decisions and their rationale.
See `docs/feature-extraction.md` for the chess analysis pipeline spec.
See `docs/principle-taxonomy.md` for all coaching principles.

## Deploy

- **Frontend:** Push to GitHub → Vercel auto-deploys (connect repo in Vercel dashboard)
- **Backend:** Push to GitHub → Railway auto-deploys (connect repo in Railway dashboard)
- **Database:** Already live on Supabase — use the same DATABASE_URL in production env vars

## Getting Stockfish WASM

Stockfish WASM files are NOT committed to the repo (too large). For development:

```bash
# TODO: Add download script
# For now: download from https://github.com/lichess-org/stockfish.wasm/releases
# Place stockfish.js and stockfish.wasm in frontend/public/stockfish/
```

This is only needed when working on Track A (Stockfish integration), not for Track B setup.
