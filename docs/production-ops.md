## Production Ops

Use this as the source of truth for live infrastructure and routine operational tasks.

### Live services

- Frontend production: `https://www.deepmove.io`
- Backend production: `https://api.deepmove.io`
- Backend staging: `https://staging-api.deepmove.io`
- Frontend previews: Vercel preview URLs from PR branches

### Hosting map

- Frontend: Vercel
- Backend: Render
- Database: Neon
- Source control + CI: GitHub + GitHub Actions

### Environment ownership

Vercel production:

- `VITE_API_URL=https://api.deepmove.io`

Vercel preview:

- `VITE_API_URL=https://staging-api.deepmove.io`

Render production:

- `ENVIRONMENT=production`
- `DATABASE_URL=<production Neon pooled URL>`
- `SECRET_KEY=<production secret>`
- `ANTHROPIC_API_KEY=<production Anthropic key>`
- `ALLOWED_ORIGINS=https://deepmove.io,https://www.deepmove.io`

Render staging:

- `ENVIRONMENT=staging`
- `DATABASE_URL=<staging Neon pooled URL>`
- `SECRET_KEY=<staging secret>`
- `ANTHROPIC_API_KEY=<staging Anthropic key>`
- `ALLOWED_ORIGINS` should include the staging frontend origins

### Health checks

Fast probe:

```bash
curl -sf https://api.deepmove.io/health
```

Deep probe:

```bash
curl -sf https://api.deepmove.io/health/deep | jq .
curl -sf https://api.deepmove.io/version | jq .
```

Use `/health` for platform health probes and `/health/deep` for human verification or external monitors.

### Auto-deploy expectations

- Merging to `main` should auto-deploy the frontend on Vercel.
- Merging backend changes to `main` should trigger the Render deploy hook from GitHub Actions.
- Frontend-only changes should not trigger backend deploys.

If the frontend updated but the backend did not:

1. Check the GitHub Actions `Backend — Deploy to Render` job.
2. Confirm `RENDER_DEPLOY_HOOK_URL` still exists in repo secrets.
3. Confirm the merge actually touched `backend/**` or `.github/workflows/ci.yml`.

### Manual backend recovery

If Render did not auto-deploy or a deploy got stuck:

1. Open the Render service.
2. Use `Manual Deploy`.
3. Redeploy the latest commit.
4. Verify:

```bash
curl -sf https://api.deepmove.io/health/deep
curl -sf https://api.deepmove.io/version
```

### Secret rotation checklist

Rotate immediately if any credential was pasted into chat, logs, or screenshots.

Neon:

1. Rotate the database password / generate a new pooled connection string.
2. Update Render production and staging `DATABASE_URL`.
3. Redeploy both backend services.
4. Run `/health/deep` on both.

Anthropic:

1. Create a new API key in Anthropic.
2. Update Render env vars.
3. Disable or delete the old key.
4. Redeploy production and staging backends.

JWT secret:

1. Generate a new `SECRET_KEY`.
2. Update Render env vars.
3. Redeploy.
4. Expect all active sessions to be invalidated.

### Recommended monitoring

Minimum setup:

- Monitor `https://api.deepmove.io/health/deep` every 5 minutes
- Monitor `https://staging-api.deepmove.io/health/deep` every 5 minutes
- Send alerts to email at minimum

Good free options:

- UptimeRobot
- Better Stack

### Incident notes

- If `/health` is green but auth or DB-backed endpoints fail, check `/health/deep` and `/version`.
- If a migration fails on Render, validate the target Neon branch/schema before retrying deploys.
- If production and staging behave differently, compare `/version` first before debugging anything else.
