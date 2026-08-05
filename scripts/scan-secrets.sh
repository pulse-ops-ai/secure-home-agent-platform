#!/usr/bin/env bash
#
# scan-secrets.sh — look for secret-shaped VALUES in tracked files.
#
# Complements scripts/validate-scaffold.sh, which catches secret-shaped
# FILENAMES (.env, *.pem). Filename rules cannot catch a token pasted into a
# workflow, a README, or a test fixture. This can.
#
# ---------------------------------------------------------------------------
# TWO INVARIANTS. Do not weaken either.
# ---------------------------------------------------------------------------
#
# 1. NO SUPPRESSION MECHANISM OTHER THAN THE VALIDATED ALLOWLIST.
#
#    There is no sentinel, no magic comment, no in-line pragma of any spelling,
#    and no file-level exclusion. Every tracked file is scanned, including
#    .github/workflows/ and this script.
#
#    An earlier version filtered any result line containing a sentinel comment.
#    That was a repository-wide bypass token: anyone who read this file could
#    silence a finding by appending that comment to the offending line. It is
#    gone, and nothing like it may be reintroduced.
#
#    Self-matching is handled by CONSTRUCTION instead: patterns are assembled
#    from fragments at run time, so no complete pattern literal appears in this
#    file. If a future pattern edit breaks that, this script will report a
#    finding against its own definition line and fail — loudly, and correctly.
#    Fix the pattern; do not add an exemption.
#
# 2. THE ALLOWLIST IS VALIDATED BEFORE ANY SCANNING, AND FAILS CLOSED.
#
#    An entry is `path:line:sha256=<digest> # justification`. It identifies the
#    finding by a digest of the exact line content, so **no credential material
#    is ever written into the allowlist** — which matters, because the allowlist
#    is itself a tracked file that this scanner scans.
#
#    A digest also makes an entry self-invalidating: change the line and the
#    entry stops applying, forcing re-review rather than silently covering new
#    content. Entries are rejected if unjustified, wildcarded, stale, or
#    pointing at .github/workflows/. A malformed allowlist aborts the run
#    *without scanning*, so a broken allowlist can never read as "no findings".
#
# ---------------------------------------------------------------------------
#
# This repository's subject matter is credentials and authorization, so prose
# containing the words "token" or "secret" is expected and must not fail the
# build. Only assignment-shaped values and known credential formats are
# findings.
#
# Dependency-light: bash, git, grep, sha256sum. No network.
#
# Exit codes:
#   0  no findings
#   1  secret-shaped values found
#   2  allowlist invalid, or not a git repository (nothing was scanned)
#
# Governed by AGENTS.md, SECURITY.md, and scripts/README.md.

set -uo pipefail

if ! REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  printf 'Not a git repository — cannot scan tracked files.\n' >&2
  exit 2
fi
cd "$REPO_ROOT" || exit 2

ALLOWLIST="scripts/secret-scan-allowlist.txt"

# A short justification is how a narrow exception quietly becomes a broad one.
MIN_JUSTIFICATION_LEN=12

# Digest of a finding's line content. Deliberately not the raw value: the
# allowlist is tracked and scanned like any other file.
content_digest() { printf '%s' "$1" | sha256sum | cut -d' ' -f1; }

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_BOLD=$'\033[1m'; C_OFF=$'\033[0m'
else
  C_RED=''; C_GREEN=''; C_YELLOW=''; C_BOLD=''; C_OFF=''
fi

# ---------------------------------------------------------------------------
# Patterns, assembled from fragments.
#
# The assembly is not cosmetic: it is what allows this file to be scanned by
# its own patterns with no exemption. Keep each fragment individually
# non-matching, and never inline a complete pattern as one literal.
# ---------------------------------------------------------------------------

_kw='password|secret|token|api[_-]?key|bearer'
_gap='[[:space:]]*[:=][[:space:]]*'
_val='["'"'"']?[A-Za-z0-9_./+-]{12,}'
ASSIGNED="(${_kw})${_gap}${_val}"

_ghp='gh''[pousr]_[A-Za-z0-9]{20,}'
_openai='sk''-[A-Za-z0-9]{20,}'
_aws='AKIA''[0-9A-Z]{16}'
_pem='-----BEGIN'' [A-Z ]*PRIVATE KEY-----'
_jwt='eyJ''[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}'
KNOWN="(${_ghp}|${_openai}|${_aws}|${_pem}|${_jwt})"

# ---------------------------------------------------------------------------
# Allowlist: validate first, fail closed.
# ---------------------------------------------------------------------------

# Parallel arrays of validated entries.
AL_PATHS=(); AL_LINES=(); AL_DIGESTS=()

validate_allowlist() {
  [ -f "$ALLOWLIST" ] || return 0

  local lineno=0 bad=0 raw entry justification path rest linenum digest

  while IFS= read -r raw || [ -n "$raw" ]; do
    lineno=$((lineno + 1))
    raw="${raw%$'\r'}"
    case "$raw" in ''|'#'*) continue ;; esac

    reject() {
      printf '  %sinvalid%s %s:%d — %s\n' "$C_RED" "$C_OFF" "$ALLOWLIST" "$lineno" "$1"
      bad=$((bad + 1))
    }

    # Structure: "<entry> # <justification>"
    case "$raw" in
      *" # "*) ;;
      *) reject "no justification; expected 'path:line:sha256=<digest> # why this is not a secret'"; continue ;;
    esac
    entry="${raw%% # *}"
    justification="${raw#* # }"

    if [ "${#justification}" -lt "$MIN_JUSTIFICATION_LEN" ]; then
      reject "justification too short (<${MIN_JUSTIFICATION_LEN} chars) — explain why this is not a secret"
      continue
    fi

    # Structure: path:line:sha256=<digest>
    case "$entry" in
      *:*:*) ;;
      *) reject "expected 'path:line:sha256=<digest>', got '$entry' — path-only and whole-file entries are rejected"; continue ;;
    esac
    path="${entry%%:*}"
    rest="${entry#*:}"
    linenum="${rest%%:*}"
    digest="${rest#*:}"

    case "$linenum" in
      ''|*[!0-9]*) reject "line number must be numeric, got '$linenum'"; continue ;;
    esac

    case "$path" in
      .github/workflows/*)
        reject "paths under .github/workflows/ may never be allowlisted — workflows define execution permissions"
        continue ;;
      *'*'*|*'?'*|*'['*)
        reject "wildcards are not permitted in a path"; continue ;;
      '') reject "empty path"; continue ;;
    esac

    if ! git ls-files --error-unmatch -- "$path" >/dev/null 2>&1; then
      reject "path '$path' is not a tracked file — stale entries must be removed"
      continue
    fi

    case "$digest" in
      sha256=*) digest="${digest#sha256=}" ;;
      *) reject "expected 'sha256=<64 hex digits>', got '$digest' — never paste the value itself"; continue ;;
    esac
    case "$digest" in
      *[!0-9a-f]*|"") reject "digest must be 64 lowercase hex digits"; continue ;;
    esac
    if [ "${#digest}" -ne 64 ]; then
      reject "digest must be exactly 64 hex digits (got ${#digest}) — no prefixes"
      continue
    fi

    AL_PATHS+=("$path"); AL_LINES+=("$linenum"); AL_DIGESTS+=("$digest")
  done < "$ALLOWLIST"

  [ "$bad" -eq 0 ]
}

# An entry matches only on exact path AND exact line number AND an exact digest
# of the line content — never as a free substring of the result line.
allowlisted() {
  local path="$1" lineno="$2" content="$3" i actual
  [ "${#AL_PATHS[@]}" -gt 0 ] || return 1
  actual="$(content_digest "$content")"
  for i in "${!AL_PATHS[@]}"; do
    [ "${AL_PATHS[$i]}" = "$path" ]     || continue
    [ "${AL_LINES[$i]}" = "$lineno" ]   || continue
    [ "${AL_DIGESTS[$i]}" = "$actual" ] || continue
    return 0
  done
  return 1
}

# ---------------------------------------------------------------------------
# Scan
# ---------------------------------------------------------------------------

scan() {
  local label="$1" pattern="$2" hits=0 line path rest lineno content
  printf '\n%s== %s ==%s\n' "$C_BOLD" "$label" "$C_OFF"

  while IFS= read -r line; do
    [ -n "$line" ] || continue
    path="${line%%:*}"
    rest="${line#*:}"
    lineno="${rest%%:*}"
    content="${rest#*:}"

    if allowlisted "$path" "$lineno" "$content"; then
      printf '  %sallowlisted%s %s:%s\n' "$C_YELLOW" "$C_OFF" "$path" "$lineno"
      continue
    fi
    printf '  %sFINDING%s %s\n' "$C_RED" "$C_OFF" "$line"
    printf '          to allowlist, add: %s:%s:sha256=%s # <why this is safe>\n' \
      "$path" "$lineno" "$(content_digest "$content")"
    hits=$((hits + 1))
  done <<< "$(git grep -nIE "$pattern" -- . 2>/dev/null)"

  if [ "$hits" -gt 0 ]; then
    printf '  %s%d finding(s).%s\n' "$C_RED" "$hits" "$C_OFF"
    return 1
  fi
  printf '  %snone%s\n' "$C_GREEN" "$C_OFF"
  return 0
}

printf '%s== Allowlist ==%s\n' "$C_BOLD" "$C_OFF"
if ! validate_allowlist; then
  printf '\n%sAllowlist is invalid — nothing was scanned.%s\n' "$C_RED" "$C_OFF"
  printf 'Fix %s before this check can run.\n' "$ALLOWLIST"
  exit 2
fi
printf '  %s%d validated entr(ies)%s\n' "$C_GREEN" "${#AL_PATHS[@]}" "$C_OFF"

status=0
scan "assignment-shaped values" "$ASSIGNED" || status=1
scan "known credential formats" "$KNOWN"    || status=1

printf '\n%s== Coverage ==%s\n' "$C_BOLD" "$C_OFF"
printf '  scanned %s tracked file(s)\n' "$(git ls-files | wc -l | tr -d ' ')"
printf '  no file-level exclusions, no sentinel, no line-level bypass\n'

if [ "$status" -ne 0 ]; then
  printf '\n%sSecret-shaped values found.%s\n' "$C_RED" "$C_OFF"
  printf 'If a finding is genuinely not a secret, add a narrow validated entry to\n'
  printf '%s rather than widening or disabling the scan.\n' "$ALLOWLIST"
  exit 1
fi

printf '\n%sNo secret-shaped values found.%s\n' "$C_GREEN" "$C_OFF"
exit 0
