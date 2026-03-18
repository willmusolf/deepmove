Run a targeted documentation update pass for the DeepMove project. Session context (optional): $ARGUMENTS

## What to do

**Step 1 — Understand what changed**
Run `git log --oneline -10` and `git diff HEAD~1 --name-only` to see what files changed in the most recent commit(s). Use this as the source of truth for what needs updating.

**Step 2 — Check CLAUDE.md project tree**
Compare the tree in CLAUDE.md against the actual `frontend/src/` and `backend/app/` directory structure. If any new files or directories exist that aren't listed, add them. If anything listed doesn't exist, remove it. Keep annotations (# comments) accurate.

**Step 3 — Check docs/decisions.md**
Were any architectural decisions made this session that aren't logged? Look for:
- New library choices or rejections
- Performance or caching decisions
- New patterns established (e.g., a new hook pattern, new data flow)
- Anything you'd explain as "why did we do it this way?" to a future contributor
If yes, add a new ADR entry. If nothing new, skip this step entirely.

**Step 4 — Check MEMORY.md**
Were there any non-obvious gotchas encountered? Things like:
- API quirks or undocumented behavior
- macOS/browser environment differences
- Tricky state management edge cases
- Anything you'd forget and have to rediscover
If yes, add a one-liner. Do NOT add anything already in CLAUDE.md or derivable from reading the code.

**Step 5 — Update TODO.md**
- Update "Last Session" to describe what was completed
- Mark any completed tasks with ✅
- If new tasks emerged, add them under the appropriate track

## Rules
- Make MINIMAL edits — only what actually changed
- Do not rewrite sections that are still accurate
- Do not add speculative or aspirational content — only record what IS, not what will be
- Each doc has a job:
  - `CLAUDE.md` = permanent reference (what/how)
  - `docs/decisions.md` = why we made choices (ADRs)
  - `MEMORY.md` = non-obvious gotchas for Claude across sessions
  - `TODO.md` = active work log (ephemeral)

## File paths
- CLAUDE.md: use Read/Edit tools (straight apostrophe path works)
- docs/decisions.md, docs/setup.md: use Read/Edit tools
- MEMORY.md: `/Users/williammusolf/.claude/projects/-Users-williammusolf-Desktop-Desktop---William-s-MacBook-Air-CS-Projects-DeepMove/memory/MEMORY.md`
- For git commands: use `cd ~/deepmove-dev &&` prefix (curly apostrophe in real path — symlink required for Bash)
