## Release Flow

DeepMove uses:

- Vercel for the frontend
- Render for the backend
- GitHub Actions for CI

### Current recommended flow

1. Open a branch for each change.
2. Open a PR into `main`.
3. Let GitHub Actions run:
   - `Frontend — TypeCheck + Test + Build`
   - `Backend — Lint + Test`
4. Merge only after checks pass.
5. After merge:
   - Vercel should auto-deploy the frontend from `main`
   - GitHub Actions should trigger the Render backend deploy hook, but only when backend files changed
   - GitHub Actions should run a small production smoke check against `deepmove.io` and `api.deepmove.io/health`
   - GitHub Actions should fast-forward `staging` to the merged `main` commit when `staging` is already an ancestor of that commit
6. For staging:
   - merge or push to `staging`
   - GitHub Actions should trigger the staging Render deploy hook, but only when backend files changed
   - GitHub Actions should run a staging smoke check against `staging-api.deepmove.io/health/deep`

### Why this is the right default

- Frontend previews work well on Vercel and are cheap.
- Backend preview environments on Render are possible, but they add cost and setup complexity.
- For DeepMove's current stage, a shared production backend plus strong backend CI is the best tradeoff.

### Best next step for preview backend testing

If you want frontend previews to test against a non-production backend, add a single shared staging backend:

- Create a second Render service from the same repo
- Point it at a `staging` branch
- Give it a staging database
- Expose it at something like `https://staging-api.deepmove.io`
- In Vercel, set the Preview environment value of `VITE_API_URL` to `https://staging-api.deepmove.io`

That gives every Vercel PR preview a real backend without paying for a fresh backend per PR.

### Staging CORS and preview auth

Because DeepMove uses cookie-based auth, the staging backend must explicitly allow the preview frontend origins.
For this reason, the backend supports both:

- `ALLOWED_ORIGINS`
  comma-separated exact origins
- `ALLOWED_ORIGINS_CSV`
  same as above; both names are accepted
- `ALLOWED_ORIGIN_REGEX`
  regex for dynamic preview hosts

Suggested staging values:

- `ALLOWED_ORIGINS=https://staging.deepmove.io`
- `ALLOWED_ORIGIN_REGEX=^https://.*-willmusolfs-projects\.vercel\.app$`
- `AUTH_COOKIE_SAMESITE=none`
- `AUTH_COOKIE_SECURE=true`

Adjust the regex if your Vercel preview host pattern changes.
In dashboard text fields, use single backslashes as shown above. Do not paste doubled source-code escapes like `\\.`.
Those cookie settings matter because preview frontends on `*.vercel.app` are cross-site to `staging-api.deepmove.io`, while production `deepmove.io` and `api.deepmove.io` are same-site.

For production, keep using exact origins only.

### Required GitHub secret for backend auto-deploy

Add this repository secret:

- `RENDER_DEPLOY_HOOK_URL`
- `RENDER_STAGING_DEPLOY_HOOK_URL`

Find it in Render:

1. Open the backend service
2. Go to `Settings`
3. Copy the deploy hook URL
4. Add it in GitHub at `Settings > Secrets and variables > Actions`

Repeat the same steps for the staging backend service and save that URL as `RENDER_STAGING_DEPLOY_HOOK_URL`.

### Important note about monorepo deploys

The Render service is rooted at `backend/`.
That means frontend-only changes should not cause a backend deploy.
This is expected and desirable.

### Related docs

- Full release checklist: [release-runbook.md](./release-runbook.md)
- Live service ownership and recovery steps: [production-ops.md](./production-ops.md)

### Operational runbook

For the exact staging-to-production checklist, rollback steps, and emergency coaching disable procedure, see [release-runbook.md](./release-runbook.md).

### What the smoke check does

After merges to `main`, GitHub Actions:

- requests `https://www.deepmove.io`
- waits for `https://api.deepmove.io/health/deep`
- if backend files changed, verifies `https://api.deepmove.io/version` matches the pushed commit SHA
- fast-forwards `staging` to the same commit when the `staging` tip is already contained in `main`

This is now a deployment check, not just a shallow uptime check.
It helps catch both obvious production incidents and stale backend deploys.

After pushes to `staging`, GitHub Actions:

- waits for `https://staging-api.deepmove.io/health/deep`
- if backend files changed, verifies `https://staging-api.deepmove.io/version` matches the pushed commit SHA

This gives the staging lane the same deployment verification behavior as production.
