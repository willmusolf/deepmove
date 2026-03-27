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

## Step 2: Set up Neon (database)

1. Go to [neon.tech](https://neon.tech) and create a free account
2. Create a new project (pick a region close to you)
3. Go to **Connection Details** and select the **Pooled** connection option
4. Copy the connection string — it looks like: `postgresql://username:[password]@ep-xxx-yyy-zzz.region.aws.neon.tech/neondb?sslmode=require`

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
#   DATABASE_URL=postgresql://... (from Neon step 3)
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
- **Database:** Already live on Neon — use the same DATABASE_URL in production env vars

## Getting Stockfish

Stockfish is handled automatically via npm. The `stockfish` npm package ships `stockfish-18-asm.js` (10MB asm.js fallback). A postinstall script in `frontend/package.json` copies it to `frontend/public/stockfish/stockfish.js` on every `npm install`.

A thin wrapper at `frontend/public/stockfish/worker.js` calls `importScripts('/stockfish/stockfish.js')` — this is the file the Web Worker loads.

No manual download needed. Just run `npm install` in `frontend/`.

**Note:** The npm `stockfish` package does NOT include `.wasm` binaries — only the asm.js fallback. When ready to optimize for performance, download `stockfish-18.wasm` from the nmrugg GitHub releases and switch to the `stockfish-18.js` loader.
