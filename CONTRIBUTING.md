# Contributing to DeepMove

This repo works best when each task ships from its own clean branch or worktree.

## Daily workflow

1. Start from a clean sibling worktree:

```bash
scripts/new-worktree.sh codex-fix-short-description
```

2. Do the work in that new worktree with whichever assistant or editor you want.

3. Wrap up with a scoped ship command:

```bash
scripts/ship-pr.sh \
  --message "Fix short description" \
  --title "[codex] Fix short description" \
  -- frontend/path/to/file.ts backend/path/to/file.py
```

What `scripts/ship-pr.sh` does:

- refuses to publish mixed scope
- stages only the paths you name
- runs the most relevant local checks
- commits
- pushes
- opens a draft PR when `gh` is installed

## Make targets

You can use the shell scripts directly or the matching `make` wrappers:

- `make worktree BRANCH=codex-fix-short-description`
- `make ship FILES="frontend/src/styles/board.css" MESSAGE="Fix ..." TITLE="[codex] Fix ..."`
- `make ship-checks FILES="frontend/src/styles/board.css"`

## Review and merge policy

Best practice for this repo:

- require pull requests for `main`
- require CI before merge
- require at least one human approval for substantial changes
- enable GitHub auto-merge
- enable one AI reviewer:
  - GitHub Copilot automatic review for the simplest native setup
  - CodeRabbit if you want more aggressive PR review

See [docs/github-review-setup.md](docs/github-review-setup.md) for the recommended repository settings.

## Dirty worktree rescue plan

If your local checkout already has a lot of mixed changes, do not force them into one PR.

Use this sequence instead:

1. Protect the work on GitHub with a snapshot branch.
2. Split that snapshot into focused PRs from clean worktrees.
3. Merge each focused PR independently.

Example:

```bash
git switch -c wip-2026-04-20-mixed-local-work
git add -A
git commit -m "WIP snapshot of local mixed work"
git push -u origin wip-2026-04-20-mixed-local-work
```

Then create fresh worktrees from `origin/main` and port one logical change at a time into clean PRs.

## Assistant guardrails

Whether you are pairing with ChatGPT, Claude, Copilot, or another tool:

- do not publish from a dirty `main`
- do not use `git add -A` in a mixed worktree
- do not stage unrelated user changes
- prefer one focused PR per task
- prefer draft PRs first, then enable auto-merge once review and CI are green
