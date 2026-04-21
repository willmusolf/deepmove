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
- `ALLOWED_ORIGIN_REGEX`
  regex for dynamic preview hosts

Suggested staging values:

- `ALLOWED_ORIGINS=https://staging.deepmove.io`
- `ALLOWED_ORIGIN_REGEX=^https://.*-willmusolfs-projects\\.vercel\\.app$`

Adjust the regex if your Vercel preview host pattern changes.

For production, keep using exact origins only.

### Required GitHub secret for backend auto-deploy

Add this repository secret:

- `RENDER_DEPLOY_HOOK_URL`

Find it in Render:

1. Open the backend service
2. Go to `Settings`
3. Copy the deploy hook URL
4. Add it in GitHub at `Settings > Secrets and variables > Actions`

### Important note about monorepo deploys

The Render service is rooted at `backend/`.
That means frontend-only changes should not cause a backend deploy.
This is expected and desirable.

### What the smoke check does

After merges to `main`, GitHub Actions waits briefly and then:

- requests `https://www.deepmove.io`
- requests `https://api.deepmove.io/health`

This is an uptime check, not a version-matching deployment check.
It helps catch obvious production incidents quickly, but it does not prove that the newest backend revision is serving traffic.
