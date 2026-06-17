# 8os Deploy Runbook

> **TL;DR** — Run `scripts/deploy-with-gate.sh` from the `8os-dashboard`
> directory only. **Do not run `vercel deploy --prod` directly anymore**
> — that bypasses the pre-deploy smoke gate (OS-1221) and ships the
> build to 8os.ai before probes can catch a regression.
>
> This runbook exists to prevent the regression from [OS-509](/OS/issues/OS-509) (wrong
> directory → wrong codebase) and the regression pattern in [OS-1219](/OS/issues/OS-1219)
> (right directory, wrong branch → 5/12 smoke probe → CEO rollback). The gate kills
> the second pattern: candidate builds are probed before they can be promoted.

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

## CLI setup (once per machine)

```bash
# Install Vercel CLI to a local prefix if global install fails
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
npm install -g vercel
export PATH="$HOME/.npm-global/bin:$PATH"
```

Required environment variables (inject via secrets or shell):

```bash
export VERCEL_API_TOKEN=<token>          # injected by Paperclip harness
export VERCEL_TEAM_ID=team_NymalvwjRk6LIjWvzEP4mtj0
export VERCEL_PROJECT_ID=prj_ra28Zh8IoehysZsknj1j7DKbqbBw
```

---

## Deploy command (gated)

**Always use `scripts/deploy-with-gate.sh`.** This is the script
introduced for [OS-1221](/OS/issues/OS-1221) (pre-deploy smoke gate) and
is the ONLY supported way to promote a build to 8os.ai.

```bash
# From the repo root (8os-dashboard/)
scripts/deploy-with-gate.sh --token "$VERCEL_API_TOKEN"
```

What the gate does:

1. Runs the same pre-deploy checks as before (`pwd`, `vercel project ls`,
   `vercel env ls`, `npm run build`).
2. Runs `vercel deploy --yes` **without `--prod`** — Vercel returns a
   preview URL like `https://web-dashboard-abc123-username.vercel.app`.
3. Polls `/api/health` on the preview URL (max 90s) to wait for the
   build to be reachable.
4. Runs `scripts/smoke-probe-8os.sh --base-url <preview-url>
   --skip-orchestrator` against the candidate. The probe asserts
   `/coming-soon`, `/affiliates`, `/affiliates/terms`, `/api/waitlist`
   POST, `/api/auth/google` 307 → Google consent, `/api/health`, and
   the `/api/waitlist` DELETE proxy are all live.
5. **If the probe passes**, the script runs `vercel alias <preview-url>
   8os.ai` to promote the candidate to production and exits 0.
6. **If the probe fails**, the script prints `ABORT: smoke probe
   FAILED`, leaves the candidate alive at the preview URL for
   debugging, does **not** alias to 8os.ai, and exits non-zero.

Useful flags:

- `--dry-run` — deploy + probe, do NOT alias (use for first-time
  deploys of a new branch to verify the gate works end-to-end without
  touching production).
- `--alias <domain>` — promote to a domain other than 8os.ai
  (e.g. `preview.8os.dev` for a QA reviewer).
- `--skip-build` — skip the local `npm run build` step (only safe when
  the build was just run in this checkout).

Reference: [OS-1221](/OS/issues/OS-1221) (the gate), [OS-1219](/OS/issues/OS-1219)
(the regression report that motivated the gate).

### Why you should NOT run `vercel deploy --prod` directly

`vercel deploy --prod` is a single atomic step: it builds, deploys, and
promotes to 8os.ai in one shot, with no probe. If the build is broken
(404 on `/coming-soon`, 500 on `/api/auth/google`, etc.) — which is
exactly what happened twice on 2026-06-17 — production is broken
before any check can run. The gate splits the operation into "deploy
to preview" + "probe preview" + "promote on pass" so a regression
never reaches 8os.ai.

If you find yourself reaching for `vercel deploy --prod`, use the
gate instead. The only exception is an emergency rollback — see below.

---

## Post-deploy smoke test

The gate runs the full smoke probe against the candidate before
promotion. Once the alias is assigned, the post-deploy check below is
a redundant final confirmation that 8os.ai is live.

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
vercel rollback --token "$VERCEL_API_TOKEN"

# Confirm rollback is live
curl -sf https://8os.ai/api/health && echo "Rollback OK"
```

`vercel rollback` promotes the last successful deployment to production. It takes effect
within ~30 seconds. Notify the team in Slack (#engineering) after any rollback.

---

## Common mistakes (and how to avoid them)

| Mistake | Prevention |
|---------|------------|
| Running `vercel deploy --prod` directly (bypasses the smoke gate) | Use `scripts/deploy-with-gate.sh` — see [OS-1221](/OS/issues/OS-1221) |
| Running `vercel --prod` from a different repo | Always run `pwd` first and confirm the path ends with `8os-dashboard` |
| Deploying without VERCEL_PROJECT_ID set to the canonical 8os project | Export `VERCEL_PROJECT_ID=prj_ra28Zh8IoehysZsknj1j7DKbqbBw`; the gate warns if the project id is unexpected |
| Missing env vars in production | Run `vercel env ls` before every deploy |
| Forgetting to build locally first | Run `npm run build` as part of the checklist (or pass `--skip-build` to the gate) |

---

## RCA reference

This runbook exists to prevent two regression classes:

1. **OS-509** — `vercel --prod` from the wrong directory replaces all
   API routes with 404s. The `pwd` + `vercel project ls` checks prevent
   this.
2. **OS-1219** — `vercel --prod` from a branch that's missing
   launch-critical features (coming-soon, OAuth defensive 307, waitlist
   proxy) ships a broken build to 8os.ai. The pre-deploy smoke gate
   (`scripts/deploy-with-gate.sh`) prevents this — the build is probed
   on a preview URL before it can be promoted.
