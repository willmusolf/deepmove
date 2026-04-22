# CLAUDE.md — DeepMove Agent Workflow

Use these rules for Codex, Claude, and any future AI coding sessions.

## Branching And Release Flow

- Start every new feature from clean `main`
- Implement on a focused feature branch
- Open a PR from the feature branch into `staging` first
- Merge into `staging` and verify the change there before promoting it
- After staging verification, open a PR from `staging` into `main`
- Do not merge feature branches directly into `main` unless it is a deliberate hotfix or a docs-only change

## Deployment Expectations

- `staging` is the shared pre-production branch
- `main` is the production branch
- Staging deployments should come from the Render service tracking `staging`
- Production deployments should come from the Render production workflow tracking `main`
- Frontend previews come from Vercel PR/preview deploys

## Operator Habits

- Prefer clean sibling worktrees for each task instead of editing from a dirty checkout
- Prefer one focused PR per task
- When asked "what's next?", check branch state, PR state, and deploy state before proposing more work
