# CLAUDE.md — DeepMove Agent Workflow

Use these rules for Codex, Claude, and any future AI coding sessions.

## Branching And Release Flow

- Start every new feature from clean `origin/main` (or `origin/staging` — they are kept in sync)
- Implement on a focused feature branch
- Open a PR from the feature branch into `staging` first
- Merge into `staging` and verify the change on staging.deepmove.io before promoting it
- After staging verification, open a PR from `staging` into `main`
- Do not merge feature branches directly into `main` unless it is a deliberate hotfix or a docs-only change

## CRITICAL: Never commit directly to local `staging`

The **local** `staging` branch is NOT a development branch. Do not commit work to it.
Always create a feature branch and use PRs. Here is why:

- `origin/staging` is the authoritative pre-production branch (staging.deepmove.io deploys from it)
- The local `staging` branch has historically drifted far from `origin/staging` and caused confusion
- Any commit made directly to local `staging` will **not** appear on staging.deepmove.io unless it goes
  through a PR into `origin/staging`
- If you are unsure which branch to use, run: `git log --oneline origin/staging..HEAD` — if it shows
  commits, you are on a stale local branch and should start fresh from `origin/main`

**Correct workflow every time:**
```
git fetch origin
git checkout -b feat/my-feature origin/main   # fresh branch off origin
# ... make changes, commit ...
git push -u origin feat/my-feature
gh pr create --base staging                    # PR into staging first
# after staging verification:
gh pr create --base main                       # promote to main
```

## Deployment Expectations

- `staging` is the shared pre-production branch → staging.deepmove.io
- `main` is the production branch → deepmove.app
- Staging deployments come from the Render service tracking `staging`
- Production deployments come from the Render production workflow tracking `main`
- Frontend previews come from Vercel PR/preview deploys

## Operator Habits

- Prefer clean sibling worktrees for each task instead of editing from a dirty checkout
- Prefer one focused PR per task
- When asked "what's next?", check branch state, PR state, and deploy state before proposing more work
