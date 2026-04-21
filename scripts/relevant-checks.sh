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
  esac
done

if [[ $needs_frontend -eq 0 && $needs_backend -eq 0 ]]; then
  echo "No frontend/ or backend/ paths detected. Skipping local checks."
  exit 0
fi

if [[ $needs_frontend -eq 1 ]]; then
  echo "==> Frontend checks"
  if [[ ! -d frontend/node_modules ]]; then
    echo "Installing frontend dependencies with npm ci..."
    (cd frontend && npm ci)
  fi
  (cd frontend && npm run typecheck)
  (cd frontend && npm run test:run)
  (cd frontend && npm run build)
fi

if [[ $needs_backend -eq 1 ]]; then
  echo "==> Backend checks"
  python -m ruff check backend/app backend/tests
  python -m pytest backend/tests -v
fi
