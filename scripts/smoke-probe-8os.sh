#!/usr/bin/env bash
# 8os defensive-fix smoke probe — run on every CTO heartbeat.
# Asserts the public endpoints behind each known-good defensive fix are still live.
#
# Exit codes:
#   0   all probes pass
#   1   at least one probe failed (transient retry exhausted)
#   2   script-level error (missing curl/jq, bad args, etc.)
#
# Each probe retries up to N times to absorb one-shot network blips
# (observed: /api/waitlist 502 → 200 on immediate retry 2026-06-16 ~12Z).
# A probe that fails the first attempt and passes the second is reported
# as WARN (counted as pass for the exit code, but flagged in output).
#
# Usage:
#   scripts/smoke-probe-8os.sh                 # default: 2 attempts
#   scripts/smoke-probe-8os.sh --attempts 3   # override retry count
#   scripts/smoke-probe-8os.sh --json          # emit machine-readable JSON for the agent
#
# Reference issues: OS-1180 (orig), OS-1192 (rev-5-compatible test patterns)

set -u
set -o pipefail

ATTEMPTS=2
JSON_MODE=0
for arg in "$@"; do
  case "$arg" in
    --attempts) ATTEMPTS="${2:-2}"; shift 2 ;;
    --attempts=*) ATTEMPTS="${arg#*=}"; shift ;;
    --json) JSON_MODE=1; shift ;;
    -h|--help)
      sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

for bin in curl; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "FATAL: $bin not in PATH" >&2
    exit 2
  fi
done

# Probe results (newline-separated "STATUS name detail")
declare -a RESULTS=()
PASS_COUNT=0
WARN_COUNT=0
FAIL_COUNT=0

# probe NAME METHOD URL EXPECTED_REGEX [BODY] [CONTENT_TYPE]
# EXPECTED_REGEX is matched against the HTTP status code (e.g. '^307$', '^(40[14]|405)$').
probe() {
  local name="$1" method="$2" url="$3" expected="$4" body="${5:-}" ctype="${6:-application/json}"
  local attempt=1 last_code=000 last_body=""
  while (( attempt <= ATTEMPTS )); do
    if [[ -n "$body" ]]; then
      last_code=$(curl -s -m 10 -o /tmp/smoke-body.$$ -w "%{http_code}" -X "$method" "$url" -H "Content-Type: $ctype" -d "$body" 2>/dev/null || echo "000")
    else
      last_code=$(curl -s -m 10 -o /tmp/smoke-body.$$ -w "%{http_code}" -X "$method" "$url" 2>/dev/null || echo "000")
    fi
    last_body=$(head -c 240 /tmp/smoke-body.$$ 2>/dev/null | tr '\n' ' ' | tr -d '\r')
    rm -f /tmp/smoke-body.$$

    if [[ "$last_code" =~ $expected ]]; then
      if (( attempt == 1 )); then
        RESULTS+=("PASS $name http=$last_code")
        PASS_COUNT=$((PASS_COUNT + 1))
      else
        RESULTS+=("WARN $name http=$last_code (transient: passed on retry $attempt, first was non-matching)")
        WARN_COUNT=$((WARN_COUNT + 1))
        # WARN still counts as a soft pass for the overall exit code
        PASS_COUNT=$((PASS_COUNT + 1))
      fi
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 1
  done

  RESULTS+=("FAIL $name expected=$expected got=$last_code body=${last_body:0:120}")
  FAIL_COUNT=$((FAIL_COUNT + 1))
  return 1
}

# Body-shape probe (asserts a substring is present in the response body).
body_probe() {
  local name="$1" method="$2" url="$3" expected_substr="$4" body="${5:-}" ctype="${6:-application/json}"
  local attempt=1 last_code=000 last_body=""
  while (( attempt <= ATTEMPTS )); do
    if [[ -n "$body" ]]; then
      last_code=$(curl -s -m 10 -o /tmp/smoke-body.$$ -w "%{http_code}" -X "$method" "$url" -H "Content-Type: $ctype" -d "$body" 2>/dev/null || echo "000")
    else
      last_code=$(curl -s -m 10 -o /tmp/smoke-body.$$ -w "%{http_code}" -X "$method" "$url" 2>/dev/null || echo "000")
    fi
    last_body=$(cat /tmp/smoke-body.$$ 2>/dev/null | tr '\n' ' ' | tr -d '\r')
    rm -f /tmp/smoke-body.$$

    if [[ "$last_body" == *"$expected_substr"* ]]; then
      if (( attempt == 1 )); then
        RESULTS+=("PASS $name body contains $expected_substr")
        PASS_COUNT=$((PASS_COUNT + 1))
      else
        RESULTS+=("WARN $name body contains $expected_substr (transient retry $attempt)")
        WARN_COUNT=$((WARN_COUNT + 1))
        PASS_COUNT=$((PASS_COUNT + 1))
      fi
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 1
  done

  RESULTS+=("FAIL $name body missing $expected_substr got=$last_code body=${last_body:0:120}")
  FAIL_COUNT=$((FAIL_COUNT + 1))
  return 1
}

# --- Probes ----------------------------------------------------------------

# OS-1144: defensive 307 on /api/auth/google when OAuth env vars are missing.
# A regression here (HTTP 500) silently disables Google sign-in.
probe "OS-1144 /api/auth/google defensive 307"   GET  https://8os.ai/api/auth/google                 '^307$'

# OS-1173: coming-soon landing page must serve a 200.
probe "OS-1173 /coming-soon 200"                 GET  https://8os.ai/coming-soon                     '^200$'

# OS-1173: waitlist signup proxy. The Vercel 8os-dashboard /api/waitlist
# proxied to the orchestrator. We assert both the status and the body shape.
#
# Test pattern (rev-4+rev-5-safe): local part starts with `test-` (anchored
# `^test` catch from rev 4 onward) and domain is `paperclip.example`
# (RFC 2606 reserved `.example` TLD, in the rev 4+ domain allowlist).
# This shape works for the weakest known filter spec — see OS-1189 analysis
# and OS-1192 for the future-proofing rationale. Future revs can drop
# rev-4-only items (`formtest`, `heidi-`, `paperclip.ing`, etc.) without
# these probe rows slipping through.
WAIT_BODY="{\"email\":\"test-alex-1180-smoke-$(date +%s)@paperclip.example\",\"source\":\"smoke-probe\"}"
probe     "OS-1173 /api/waitlist POST 200"       POST https://8os.ai/api/waitlist                    '^200$' "$WAIT_BODY"
body_probe "OS-1173 /api/waitlist body success:true" POST https://8os.ai/api/waitlist '"success":true' "$WAIT_BODY"

# OS-1117: orchestrator health — required for any Telegram/waitlist work.
probe     "OS-1117 /api/health 200"              GET  https://api.8os.ai/health                      '^200$'
body_probe "OS-1117 /api/health body database:ok"  GET  https://api.8os.ai/health                   '"database":"ok"' ""
body_probe "OS-1117 /api/health body redis:ok"     GET  https://api.8os.ai/health                   '"redis":"ok"' ""

# OS-1117: Telegram webhook. We want a non-200 (405/401/403/404) to prove
# the route is actually wired and rejecting, NOT a default 200.
probe "OS-1117 /telegram/webhook GET non-200"   GET  https://api.8os.ai/telegram/webhook             '^(40[145]|404)$'
probe "OS-1117 /telegram/webhook POST 401"      POST https://api.8os.ai/telegram/webhook             '^401$' '{}'

# --- Output ----------------------------------------------------------------

if (( JSON_MODE == 1 )); then
  printf '{"summary":{"pass":%d,"warn":%d,"fail":%d},"probes":[' "$PASS_COUNT" "$WARN_COUNT" "$FAIL_COUNT"
  first=1
  for r in "${RESULTS[@]}"; do
    status="${r%% *}"
    rest="${r#* }"
    name="${rest%% *}"
    detail="${rest#* }"
    if (( first )); then first=0; else printf ','; fi
    printf '{"status":"%s","name":"%s","detail":"%s"}' "$status" "$name" "$detail"
  done
  printf ']}\n'
else
  echo "8os smoke probe (attempts=$ATTEMPTS, $(date -u +%Y-%m-%dT%H:%M:%SZ))"
  echo "---------------------------------------------------------------"
  for r in "${RESULTS[@]}"; do
    case "${r%% *}" in
      PASS) printf "  \033[32m%s\033[0m  %s\n"  "PASS" "${r#PASS }" ;;
      WARN) printf "  \033[33m%s\033[0m  %s\n"  "WARN" "${r#WARN }" ;;
      FAIL) printf "  \033[31m%s\033[0m  %s\n"  "FAIL" "${r#FAIL }" ;;
      *)    printf "       %s\n" "$r" ;;
    esac
  done
  echo "---------------------------------------------------------------"
  echo "summary: $PASS_COUNT pass, $WARN_COUNT warn, $FAIL_COUNT fail"
fi

# Exit non-zero only on hard FAILs. WARNs (transient retries that recovered) do
# not fail the probe — they show in output so the agent can decide to mention them.
exit $FAIL_COUNT
