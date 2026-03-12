.PHONY: install dev-frontend dev-backend typecheck test test-frontend test-backend lint

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

# ── Build ──────────────────────────────────────────────────────────────────
build:
	cd frontend && npm run build

# ── Help ───────────────────────────────────────────────────────────────────
help:
	@echo "DeepMove development commands:"
	@echo "  make install        — Install all dependencies"
	@echo "  make dev-frontend   — Start Vite dev server (:5173)"
	@echo "  make dev-backend    — Start FastAPI server (:8000)"
	@echo "  make typecheck      — TypeScript type check"
	@echo "  make test           — Run all tests"
	@echo "  make test-chess     — Run chess logic tests only (Track B)"
	@echo "  make lint           — Lint frontend and backend"
	@echo "  make build          — Production build"
