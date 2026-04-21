#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/ship-pr.sh [options] -- <file> [file...]

Options:
  --branch <name>      Create/switch to this branch when starting from main/master
  --base <branch>      Pull request base branch (default: main)
  --message <text>     Commit message (required)
  --title <text>       Pull request title (default: [codex] <message>)
  --body-file <path>   Markdown body file for the PR
  --ready              Open a ready-for-review PR instead of a draft PR
  -h, --help           Show this help

Examples:
  scripts/ship-pr.sh \
    --branch codex-fix-coordinates \
    --message "Fix Chessground coordinate label positioning" \
    --title "[codex] Fix Chessground coordinate label positioning" \
    -- frontend/src/styles/board.css
EOF
}

fail() {
  echo "Error: $*" >&2
  exit 1
}

cleanup() {
  if [[ -n "${generated_body_file:-}" && -f "$generated_body_file" ]]; then
    rm -f "$generated_body_file"
  fi
}

trap cleanup EXIT

branch=""
base="main"
message=""
title=""
body_file=""
draft=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch)
      branch="${2:-}"
      shift 2
      ;;
    --base)
      base="${2:-}"
      shift 2
      ;;
    --message)
      message="${2:-}"
      shift 2
      ;;
    --title)
      title="${2:-}"
      shift 2
      ;;
    --body-file)
      body_file="${2:-}"
      shift 2
      ;;
    --ready)
      draft=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    *)
      fail "Unknown option: $1"
      ;;
  esac
done

[[ -n "$message" ]] || fail "--message is required"
[[ $# -gt 0 ]] || fail "Pass the files to include after --"

if [[ -z "$title" ]]; then
  title="[codex] $message"
fi

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

sanitize_branch() {
  local input="$1"
  printf '%s\n' "${input//\//-}"
}

list_changed_files() {
  {
    git diff --name-only
    git diff --cached --name-only
    git ls-files --others --exclude-standard
  } | awk 'NF' | grep -v '\.icloud$' | sort -u
}

write_list_file() {
  local outfile="$1"
  shift
  printf '%s\n' "$@" | awk 'NF' | sort -u > "$outfile"
}

contains_extra_scope() {
  local changed_file="$1"
  local expected_file
  while IFS= read -r expected_file; do
    [[ "$changed_file" == "$expected_file" ]] && return 1
  done < "$expected_files_file"
  return 0
}

declare -a files=("$@")
for file in "${files[@]}"; do
  [[ "$file" != /* ]] || fail "Use repo-relative paths, not absolute paths: $file"
done

changed_files_file="$(mktemp)"
expected_files_file="$(mktemp)"
staged_files_file="$(mktemp)"

trap 'rm -f "$changed_files_file" "$expected_files_file" "$staged_files_file"; cleanup' EXIT

list_changed_files > "$changed_files_file"
write_list_file "$expected_files_file" "${files[@]}"

while IFS= read -r expected; do
  [[ -n "$expected" ]] || continue
  grep -Fxq "$expected" "$changed_files_file" || fail "Target path has no local changes: $expected"
done < "$expected_files_file"

while IFS= read -r changed; do
  [[ -n "$changed" ]] || continue
  if contains_extra_scope "$changed"; then
    fail "Mixed worktree detected. Unrelated change present: $changed

Run this script from a clean worktree or split the scope first."
  fi
done < "$changed_files_file"

current_branch="$(git branch --show-current)"
if [[ "$current_branch" == "main" || "$current_branch" == "master" ]]; then
  [[ -n "$branch" ]] || fail "Refusing to publish from $current_branch without --branch"
  branch="$(sanitize_branch "$branch")"
  git switch -c "$branch"
  current_branch="$branch"
elif [[ -n "$branch" ]]; then
  branch="$(sanitize_branch "$branch")"
  [[ "$branch" == "$current_branch" ]] || fail "Already on branch '$current_branch'. Omit --branch or switch first."
fi

git add -- "${files[@]}"
git diff --cached --name-only | awk 'NF' | sort -u > "$staged_files_file"

if ! diff -u "$expected_files_file" "$staged_files_file" >/dev/null; then
  fail "Staged files do not match the requested scope. Review 'git diff --cached --name-only'."
fi

"$repo_root/scripts/relevant-checks.sh" "${files[@]}"

git commit -m "$message"
git push -u origin "$current_branch"

if command -v gh >/dev/null 2>&1; then
  if [[ -z "$body_file" ]]; then
    generated_body_file="$(mktemp)"
    {
      echo "## Summary"
      echo "- TODO: replace this summary with the user-facing outcome before marking the PR ready."
      echo
      echo "## Included"
      for file in "${files[@]}"; do
        echo "- \`$file\`"
      done
      echo
      echo "## Checks"
      echo "- \`scripts/relevant-checks.sh ${files[*]}\`"
      echo
      echo "## Review Notes"
      echo "- Confirm the PR scope matches only the files above."
      echo "- Wait for CI and AI review before enabling auto-merge."
    } > "$generated_body_file"
    body_file="$generated_body_file"
  fi

  pr_args=(pr create --base "$base" --title "$title" --body-file "$body_file")
  if [[ $draft -eq 1 ]]; then
    pr_args+=(--draft)
  fi

  gh "${pr_args[@]}"
else
  remote_url="$(git remote get-url origin)"
  remote_url="${remote_url#https://}"
  remote_url="${remote_url#*@}"
  remote_url="${remote_url%.git}"
  echo
  echo "GitHub CLI is not installed. Open the PR manually:"
  echo "  https://${remote_url}/compare/${base}...${current_branch}?expand=1"
fi
