#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/relevant-checks.sh <file> [file...]

Runs the most relevant local checks for the given repo-relative paths.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

if command -v python >/dev/null 2>&1; then
  python_bin="python"
elif command -v python3 >/dev/null 2>&1; then
  python_bin="python3"
else
  echo "Python is required to run backend checks."
  exit 1
fi

needs_frontend=0
needs_backend=0

for path in "$@"; do
  case "$path" in
    frontend/*)
      needs_frontend=1
      ;;
    backend/*)
      needs_backend=1
      ;;
    .github/workflows/*|Makefile|scripts/*)
      needs_frontend=1
      needs_backend=1
      ;;
  esac
done

if [[ $needs_frontend -eq 0 && $needs_backend -eq 0 ]]; then
  echo "No frontend/ or backend/ paths detected. Skipping local checks."
  exit 0
fi

if [[ $needs_frontend -eq 1 ]]; then
  echo "==> Frontend checks"
  if [[ -f frontend/.nvmrc ]]; then
    required_node="$(tr -d '[:space:]' < frontend/.nvmrc)"
    current_node="$(node -v 2>/dev/null || true)"
    if [[ "$current_node" != "v$required_node" ]]; then
      if [[ -s "${HOME}/.nvm/nvm.sh" ]]; then
        # shellcheck disable=SC1090
        source "${HOME}/.nvm/nvm.sh"
        nvm use "$required_node" >/dev/null
      else
        echo "Node $required_node is required (found ${current_node:-missing})."
        echo "Install/use the version from frontend/.nvmrc before pushing."
        exit 1
      fi
    fi
  fi
  if [[ ! -d frontend/node_modules ]]; then
    echo "Installing frontend dependencies with npm ci..."
    (cd frontend && npm ci)
  fi
  (cd frontend && npm run lint)
  (cd frontend && npm run typecheck)
  (cd frontend && npm run test:run)
  (cd frontend && npm run build)
fi

if [[ $needs_backend -eq 1 ]]; then
  echo "==> Backend checks"
  if ! "$python_bin" -m ruff --version >/dev/null 2>&1 \
    || ! "$python_bin" -m mypy --version >/dev/null 2>&1 \
    || ! "$python_bin" -m pytest --version >/dev/null 2>&1 \
    || ! "$python_bin" -m pip show types-passlib >/dev/null 2>&1 \
    || ! "$python_bin" -m pip show types-python-jose >/dev/null 2>&1; then
    echo "Installing backend dependencies with pip..."
    (cd backend && "$python_bin" -m pip install -r requirements.txt)
  fi
  if ! "$python_bin" -m pip_audit --version >/dev/null 2>&1; then
    echo "Installing pip-audit..."
    "$python_bin" -m pip install pip-audit
  fi
  (cd backend && "$python_bin" scripts/check_alembic_graph.py)
  "$python_bin" -m pip_audit -r backend/requirements.txt --ignore-vuln PYSEC-2025-185
  "$python_bin" -m ruff check backend/app backend/tests
  "$python_bin" -m mypy backend/app/routes backend/app/services
  DATABASE_URL='' TEST_DATABASE_URL='' ANTHROPIC_API_KEY='' SECRET_KEY='local-test-secret' ENVIRONMENT=test \
    "$python_bin" -m pytest backend/tests -v
fi
