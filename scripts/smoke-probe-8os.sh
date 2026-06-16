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
# Reference issues: OS-1180 (orig), OS-1192 (rev-5-compatible test patterns), OS-1199 (Location-header audit signal for /api/auth/google)

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

# json_escape STR — RFC 8259 string escape (handles \", \\, control chars).
# Used by the --json output path. Without this, the header_probe FAIL line
# would emit the regex (containing `\.`) as a literal `&\.`, which is
# invalid JSON (only \" \\ / \b \f \n \r \t \uXXXX are valid escapes).
json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//	/\\t}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  printf '%s' "$s"
}
FAIL_COUNT=0

# probe NAME METHOD URL EXPECTED_REGEX [BODY] [CONTENT_TYPE] [SHARE_KEY]
# EXPECTED_REGEX is matched against the HTTP status code (e.g. '^307$', '^(40[14]|405)$').
# SHARE_KEY is an optional label: if set, the captured body is stashed under
# that key (file: /tmp/smoke-body.<key>.<pid>) so a later body_probe with the
# same SHARE_KEY can reuse it without firing another request. This avoids
# the /api/waitlist 3/minute rate limit (orchestrator waitlist join has
# `@limiter.limit("3/minute;10/hour")`) when status and body assertions
# would otherwise fire two POSTs back-to-back. Without SHARE_KEY the probe
# makes a fresh request (back-compat).
probe() {
  local name="$1" method="$2" url="$3" expected="$4" body="${5:-}" ctype="${6:-application/json}" share_key="${7:-}"
  local attempt=1 last_code=000 last_body=""
  while (( attempt <= ATTEMPTS )); do
    if [[ -n "$body" ]]; then
      last_code=$(curl -s -m 10 -o /tmp/smoke-body.$$ -w "%{http_code}" -X "$method" "$url" -H "Content-Type: $ctype" -d "$body" 2>/dev/null || echo "000")
    else
      last_code=$(curl -s -m 10 -o /tmp/smoke-body.$$ -w "%{http_code}" -X "$method" "$url" 2>/dev/null || echo "000")
    fi
    last_body=$(head -c 240 /tmp/smoke-body.$$ 2>/dev/null | tr '\n' ' ' | tr -d '\r')
    if [[ -n "$share_key" ]]; then
      cp /tmp/smoke-body.$$ "/tmp/smoke-body.$share_key.$$" 2>/dev/null
    fi
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
# If SHARE_KEY matches a prior probe() with the same key, the cached body
# file is reused — no new HTTP request. Falls back to a fresh request if
# the cache is missing (e.g. the upstream probe failed and stashed nothing
# matching the expected status, in which case the body probe will retry
# with its own request).
body_probe() {
  local name="$1" method="$2" url="$3" expected_substr="$4" body="${5:-}" ctype="${6:-application/json}" share_key="${7:-}"
  local attempt=1 last_code=000 last_body=""
  while (( attempt <= ATTEMPTS )); do
    if [[ -n "$share_key" && -f "/tmp/smoke-body.$share_key.$$" ]]; then
      # Reuse cached body from a prior probe() with the same share_key.
      last_body=$(cat "/tmp/smoke-body.$share_key.$$" 2>/dev/null | tr '\n' ' ' | tr -d '\r')
      last_code="cached"
    else
      if [[ -n "$body" ]]; then
        last_code=$(curl -s -m 10 -o /tmp/smoke-body.$$ -w "%{http_code}" -X "$method" "$url" -H "Content-Type: $ctype" -d "$body" 2>/dev/null || echo "000")
      else
        last_code=$(curl -s -m 10 -o /tmp/smoke-body.$$ -w "%{http_code}" -X "$method" "$url" 2>/dev/null || echo "000")
      fi
      last_body=$(cat /tmp/smoke-body.$$ 2>/dev/null | tr '\n' ' ' | tr -d '\r')
      rm -f /tmp/smoke-body.$$
    fi

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

# Header probe (asserts the value of a named response header matches a regex).
# Use this to check e.g. the Location header on a 307 — status code alone is
# not enough to confirm the user-facing flow works.
# Args: name method url header_name expected_regex [body] [content_type]
header_probe() {
  local name="$1" method="$2" url="$3" header="$4" expected="$5" body="${6:-}" ctype="${7:-application/json}"
  local attempt=1 last_code=000 last_header=""
  while (( attempt <= ATTEMPTS )); do
    local hdrfile="/tmp/smoke-hdr.$$"
    if [[ -n "$body" ]]; then
      last_code=$(curl -s -m 10 -D "$hdrfile" -o /dev/null -w "%{http_code}" -X "$method" "$url" -H "Content-Type: $ctype" -d "$body" 2>/dev/null || echo "000")
    else
      last_code=$(curl -s -m 10 -D "$hdrfile" -o /dev/null -w "%{http_code}" -X "$method" "$url" 2>/dev/null || echo "000")
    fi
    # Header match is case-insensitive; print only the value column.
    last_header=$(awk -v IGNORECASE=1 -v want="$header" 'BEGIN{FS=": "} tolower($1)==tolower(want){sub(/\r$/,"",$2); print $2; exit}' "$hdrfile" 2>/dev/null)
    rm -f "$hdrfile"

    if [[ -n "$last_header" && "$last_header" =~ $expected ]]; then
      if (( attempt == 1 )); then
        RESULTS+=("PASS $name $header=$last_header")
        PASS_COUNT=$((PASS_COUNT + 1))
      else
        RESULTS+=("WARN $name $header=$last_header (transient retry $attempt)")
        WARN_COUNT=$((WARN_COUNT + 1))
        PASS_COUNT=$((PASS_COUNT + 1))
      fi
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 1
  done

  RESULTS+=("FAIL $name $header expected=$expected got=$last_code header=${last_header:0:120}")
  FAIL_COUNT=$((FAIL_COUNT + 1))
  return 1
}

# --- Probes ----------------------------------------------------------------

# OS-1144: defensive 307 on /api/auth/google when OAuth env vars are missing.
# A regression here (HTTP 500) silently disables Google sign-in.
probe "OS-1144 /api/auth/google defensive 307"   GET  https://8os.ai/api/auth/google                 '^307$'

# OS-1199: status code 307 alone is not enough — the Location header must
# point at Google's consent screen, not our error page. The previous probe
# passed while the user-facing flow was broken (defensive 307 → /login?error=…)
# because it only checked the status code. The 16:33Z CTO spot check used
# this probe and was GREEN even though /api/auth/google was unusable to a
# real user. This Location-header probe gives the T-7d audit the correct
# signal: RED when env vars are missing (Location is the error page), GREEN
# when the OAuth flow actually reaches Google.
#
# When working: Location: https://accounts.google.com/o/oauth2/v2/auth?…
# When broken:  Location: https://8os.ai/login?error=Google%20sign-in%20is%20temporarily%20unavailable
# Unblock: see OS-972 — board needs to set GOOGLE_CLIENT_ID,
# GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, and AUTH_FLOW_SECRET on
# prj_ra28Zh8IoehysZsknj1j7DKbqbBw.
header_probe "OS-1199 /api/auth/google Location is Google consent" \
  GET https://8os.ai/api/auth/google Location '^https://accounts\.google\.com/'

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
#
# SHARE_KEY "waitlist" is set on both probes so the body assertion reuses
# the cached response body from the status probe — fires only ONE POST
# against the orchestrator's 3/minute rate limit instead of two.
WAIT_BODY="{\"email\":\"test-alex-1180-smoke-$(date +%s)@paperclip.example\",\"source\":\"smoke-probe\"}"
probe     "OS-1173 /api/waitlist POST 200"       POST https://8os.ai/api/waitlist                    '^200$' "$WAIT_BODY" "" "waitlist"
body_probe "OS-1173 /api/waitlist body success:true" POST https://8os.ai/api/waitlist '"success":true' "$WAIT_BODY" "" "waitlist"

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
    printf '{"status":"%s","name":"%s","detail":"%s"}' "$status" "$(json_escape "$name")" "$(json_escape "$detail")"
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
exit_code=$FAIL_COUNT

# Clean up the body-cache files we stashed for share_key reuse. Each run
# has its own $$ (PID), but prior runs may have left stale files around;
# nuke any /tmp/smoke-body.* files older than 1 hour too.
rm -f /tmp/smoke-body.$$ "/tmp/smoke-body."*".$$" 2>/dev/null
find /tmp -maxdepth 1 -name 'smoke-body.*' -mmin +60 -delete 2>/dev/null

exit $exit_code
