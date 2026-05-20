# DeepMove

DeepMove is a chess review app built around the games you actually played. Today the repo is centered on a fast review loop: import games, analyze them with client-side Stockfish, inspect critical moments, read coaching on the worst decisions, and play bot games that flow back into review.

## What is live today

- Import from Chess.com, Lichess, or raw PGN
- Review with move grades, eval bar, eval graph, best lines, and critical moments
- AI coaching on critical moments with caching and quota controls
- Play vs Bot, then send finished games into review
- Auth, linked chess accounts, and Stripe-backed premium scaffolding

## Intentionally not live yet

- Practice / Openings remains hidden behind a coming-soon shell
- Dashboard / recurring-weakness analysis is the next planned feature, not a shipped one
- Tactics Trainer is planned after dashboard work
- Broad advertising is deferred until launch cleanup and manual coaching QA are complete

## Fastest local setup

1. Use the pinned tool versions from the repo root:
   - `nvm use`
   - Python `3.13.7` from `.python-version`
2. Create and activate a backend virtualenv:
   - `cd backend && python3 -m venv venv && source venv/bin/activate && cd ..`
3. Install dependencies:
   - `make install`
4. Start the app:
   - `make dev-backend`
   - `make dev-frontend`

## Verification path

Run these in the same shell where `nvm use` and the backend virtualenv are active:

- `make typecheck`
- `make check`
- `make test-backend-smoke`
- `make build`

Treat a clean install plus this verification pass as a pre-launch gate.

## Key docs

- Setup: [docs/setup.md](docs/setup.md)
- Release runbook: [docs/release-runbook.md](docs/release-runbook.md)
- Release flow overview: [docs/release-flow.md](docs/release-flow.md)
- Current sprint / roadmap: [TODO.md](TODO.md)
- Launch and messaging planning: [docs/marketing.md](docs/marketing.md)
- Deferred Practice / Openings spec: [docs/openings-spec.md](docs/openings-spec.md)
- Architecture decisions: [docs/decisions.md](docs/decisions.md)
