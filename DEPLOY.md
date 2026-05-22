# 8os Deploy Runbook

> **TL;DR** — Run `vercel --prod --yes` from the `8os-dashboard` directory only.
> This runbook exists to prevent the regression from [OS-509](/OS/issues/OS-509), where a foreign
> codebase was deployed to the `8os` Vercel project because `vercel --prod` was run from
> the wrong directory.

---

## Project details

| Field           | Value                          |
|-----------------|--------------------------------|
| Vercel project  | `8os`                          |
| Production URL  | `https://8os.ai`               |
| Health endpoint | `https://8os.ai/api/health`    |
| Vercel org      | `team_NymalvwjRk6LIjWvzEP4mtj0` |

---

## Pre-deploy checklist

Run every item in order. **Stop and investigate if any check fails.**

```bash
# 1. Confirm you are in the correct directory
pwd
# → must end with: 8os-dashboard

# 2. Confirm the Vercel project link
vercel project ls
# → must list '8os' as the linked/active project

# 3. Confirm expected environment variables are present
vercel env ls
# → must show OPENAI_API_KEY, DATABASE_URL, NEXTAUTH_SECRET, etc.
#   (contact a team lead if unsure which vars are required)

# 4. Run a local build to catch compilation errors before deploying
npm run build
# → must exit 0 with no errors
```

---

## Deploy command

```bash
# From the repo root (8os-dashboard/)
vercel --prod --yes --token $Vercel_API_Token
```

- `--prod` — promotes to the production alias (`8os.ai`)
- `--yes` — non-interactive; skips project-link prompts
- `--token` — uses the team API token (avoids interactive login)

---

## Post-deploy smoke test

```bash
# Health check — must return HTTP 200
curl -sf https://8os.ai/api/health && echo "OK" || echo "FAIL — investigate immediately"

# Quick API sanity check (optional but recommended)
curl -sf https://8os.ai/api/v1/status | jq .
```

If `curl` returns a non-200 or the response body looks wrong, **do not wait** — proceed to
rollback immediately.

---

## Emergency rollback

```bash
# Roll back to the previous deployment
vercel rollback --token $Vercel_API_Token

# Confirm rollback is live
curl -sf https://8os.ai/api/health && echo "Rollback OK"
```

`vercel rollback` promotes the last successful deployment to production. It takes effect
within ~30 seconds. Notify the team in Slack (#engineering) after any rollback.

---

## Common mistakes (and how to avoid them)

| Mistake | Prevention |
|---------|------------|
| Running `vercel --prod` from a different repo | Always run `pwd` first and confirm the path ends with `8os-dashboard` |
| Deploying with `--prod` omitted | The `--yes` flag will still link a preview; always include `--prod` for production |
| Missing env vars in production | Run `vercel env ls` before every deploy |
| Forgetting to build locally first | Run `npm run build` as part of the checklist |

---

## RCA reference

This runbook was created as a corrective action from the OS-509 post-mortem. The root cause
was that `vercel --prod` was executed from a directory containing a different codebase, which
replaced all API routes with 404s. The `pwd` + `vercel project ls` checks in this runbook
directly prevent that class of error.
