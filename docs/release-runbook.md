## Release Runbook

DeepMove production stack:

- Frontend: Vercel
- Backend: Render
- Database: Neon

Use this runbook for staging-to-production releases.

### 1. Staging Verification

Confirm the latest `staging` CI run is green:

```bash
gh run list --branch staging --limit 1
```

Verify the staging backend:

```bash
curl -sf https://staging-api.deepmove.io/health/deep | jq .
# Expect: status "ok", checks.database "ok"

curl -sf https://staging-api.deepmove.io/version | jq .
# Expect: commit_sha matches staging HEAD
```

Verify the staging frontend:

- Open the staging Vercel preview
- Check the browser console for the current commit SHA
- Import a game and step through moves
- Confirm the eval bar and board work

If coaching is enabled on staging, request one lesson and confirm it returns a real lesson instead of fallback text.

### 2. Promotion

Create a PR from `staging` to `main`:

```bash
gh pr create --base main --head staging --title "Release: <short description>"
```

Review the diff and confirm:

- no unexpected files
- no secrets
- the release scope matches what you expect to ship

Merge the PR. This triggers:

- GitHub Actions CI
- Render backend deploy hook when backend files changed
- Vercel production deploy from `main`

### 3. Post-Deploy Verification

Do this within 5 minutes of merge.

Verify the production backend:

```bash
curl -sf https://api.deepmove.io/health/deep | jq .
# Expect: status "ok", checks.database "ok"

curl -sf https://api.deepmove.io/version | jq .
# Expect: commit_sha matches the merge commit
```

Verify the production frontend:

- Open https://www.deepmove.io
- Check the browser console for the updated commit SHA
- Import a game
- Step through moves
- Confirm the eval bar works

If coaching is enabled, request one lesson on production and confirm it returns a real lesson.

### 4. Rollback

If production is broken after deploy:

Backend rollback:

- Open the Render dashboard
- Choose the backend service
- Use `Manual Deploy`
- Select the previous known-good commit

Frontend rollback:

- Open the Vercel dashboard
- Open `Deployments`
- Select the previous known-good deployment
- Promote it to production

Verify rollback:

```bash
curl -sf https://api.deepmove.io/version | jq .
# Confirm commit_sha matches the rolled-back backend version
```

### 5. Emergency Coaching Kill Switch

Disable coaching with an admin token:

```bash
curl -sf -X POST https://api.deepmove.io/admin/ops/coaching \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

Verify the kill switch:

```bash
curl -sf https://api.deepmove.io/admin/ops/status \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq .coaching_enabled
# Expect: false
```

This toggle only affects the currently running backend instance. If Render restarts the service, it falls back to the `COACHING_ENABLED` environment variable. For a persistent disable, also update the Render env var.

### Release Checklist

Copy this into the release PR description:

```md
- [ ] Staging CI green
- [ ] `staging /health/deep` returns ok
- [ ] `staging /version` SHA matches expected
- [ ] PR diff reviewed
- [ ] PR merged
- [ ] `prod /health/deep` returns ok within 5 minutes
- [ ] `prod /version` SHA matches merge commit
- [ ] Frontend loads and game import works
- [ ] Coaching lesson works if enabled
```
