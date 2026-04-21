#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/new-worktree.sh <branch-name> [path] [base]

Examples:
  scripts/new-worktree.sh codex-fix-eval-bar
  scripts/new-worktree.sh codex-fix-eval-bar ../DeepMove-eval-bar origin/main

Notes:
  - This script creates a clean sibling worktree from the chosen base ref.
  - Branch names are normalized to use hyphens instead of slashes because this
    repository's local refs have been more reliable that way.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -lt 1 || $# -gt 3 ]]; then
  usage
  exit 1
fi

repo_root="$(git rev-parse --show-toplevel)"
repo_name="$(basename "$repo_root")"
requested_branch="$1"
branch="${requested_branch//\//-}"
path="${2:-../${repo_name}-${branch}}"
base="${3:-origin/main}"

if [[ "$branch" != "$requested_branch" ]]; then
  echo "Using local branch '$branch' instead of '$requested_branch' for compatibility."
fi

if git show-ref --verify --quiet "refs/heads/$branch"; then
  echo "Local branch '$branch' already exists."
  exit 1
fi

if [[ -e "$path" ]]; then
  echo "Path '$path' already exists."
  exit 1
fi

git worktree add -b "$branch" "$path" "$base"

cat <<EOF

Created clean worktree:
  Branch: $branch
  Path:   $path
  Base:   $base

Next:
  cd "$path"
EOF
