.PHONY: install dev-frontend dev-backend dev-coach typecheck test test-frontend test-backend lint test-chess test-coaching test-ui check check-coaching review-3b build help

# ── Setup ──────────────────────────────────────────────────────────────────
install:
	cd frontend && npm install
	cd backend && pip install -r requirements.txt

# ── Development servers ────────────────────────────────────────────────────
dev-frontend:
	cd frontend && npm run dev

dev-backend:
	cd backend && uvicorn app.main:app --reload --port 8000

# Run both in parallel (requires a terminal that supports it)
dev:
	@echo "Starting frontend and backend..."
	@make dev-backend & make dev-frontend

# Coaching-focused dev loop for Prompt 3B
dev-coach:
	@echo "Starting DeepMove coaching workspace..."
	@echo "Use this when iterating on extraction, classifier, and coaching UI."
	@make dev

# ── Type checking & linting ────────────────────────────────────────────────
typecheck:
	cd frontend && npm run typecheck

lint-frontend:
	cd frontend && npm run lint

lint-backend:
	cd backend && ruff check app/ tests/

lint: lint-frontend lint-backend

# ── Testing ────────────────────────────────────────────────────────────────
test-frontend:
	cd frontend && npm run test:run

test-backend:
	cd backend && pytest tests/ -v

test: test-frontend test-backend

# ── Chess logic tests (run often during Track B development) ───────────────
test-chess:
	cd frontend && npm run test:run -- src/chess/

test-coaching:
	cd frontend && npm run test:run -- src/chess/ src/hooks/ src/components/Coach/

test-ui:
	cd frontend && npm run test:run -- src/components/

check:
	@echo "Running typecheck + focused coaching tests + lint..."
	@make typecheck
	@make test-coaching
	@make lint

check-coaching:
	@echo "Coaching checkpoint:"
	@echo "1. Do extractor outputs look believable on a real position?"
	@echo "2. Does the classifier pick one teachable idea?"
	@echo "3. Does the lesson sound like DeepMove instead of generic AI text?"
	@echo "4. If not, fix product quality before adding scope."
	@make typecheck
	@make test-coaching

review-3b:
	@echo "Prompt 3B review loop:"
	@echo "- Run the app on one real imported game"
	@echo "- Navigate to a critical moment"
	@echo "- Read the coaching lesson out loud"
	@echo "- Ask: Is this correct? useful? coach-like? Elo-appropriate?"
	@echo "- If not, refine before broadening coverage"

# ── Build ──────────────────────────────────────────────────────────────────
build:
	cd frontend && npm run build

# ── Help ───────────────────────────────────────────────────────────────────
help:
	@echo "DeepMove development commands:"
	@echo "  make install        — Install all dependencies"
	@echo "  make dev-frontend   — Start Vite dev server (:5173)"
	@echo "  make dev-backend    — Start FastAPI server (:8000)"
	@echo "  make dev-coach      — Start the Prompt 3B coaching workspace"
	@echo "  make typecheck      — TypeScript type check"
	@echo "  make test           — Run all tests"
	@echo "  make test-chess     — Run chess logic tests only (Track B)"
	@echo "  make test-coaching  — Run coaching-related frontend tests"
	@echo "  make check          — Typecheck + coaching tests + lint"
	@echo "  make check-coaching — Coaching quality checkpoint"
	@echo "  make review-3b      — Print the manual product review loop for Prompt 3B"
	@echo "  make lint           — Lint frontend and backend"
	@echo "  make build          — Production build"
