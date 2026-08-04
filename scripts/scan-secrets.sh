#!/usr/bin/env bash
#
# scan-secrets.sh — look for secret-shaped VALUES in tracked files.
#
# Complements scripts/validate-scaffold.sh, which catches secret-shaped
# FILENAMES (.env, *.pem). Filename rules cannot catch a token pasted into a
# workflow, a README, or a test fixture. This can.
#
# Coverage rule: **every tracked file is scanned, with no file-level
# exclusions.** That explicitly includes .github/workflows/, which is one of the
# most consequential places for a credential to leak, and it includes this
# script.
#
# Self-matching is handled by line, not by file: the pattern definitions below
# each carry the sentinel comment `scan-secrets:pattern`, and only lines
# carrying that sentinel are filtered from results. Everything else in this file
# is scanned like any other file.
#
# This repository's subject matter is credentials and authorization, so prose
# containing the words "token" or "secret" is expected and must not fail the
# build. Only assignment-shaped values and known credential formats are
# findings.
#
# Genuine false positives go in scripts/secret-scan-allowlist.txt — one
# `path:line-content-fragment` per line — so a false positive narrows the scan
# rather than disabling it.
#
# Dependency-light: bash, git, grep. No network.
#
# Governed by AGENTS.md, SECURITY.md, and scripts/README.md.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || exit 2

SENTINEL='scan-secrets:pattern'
ALLOWLIST="scripts/secret-scan-allowlist.txt"

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_BOLD=$'\033[1m'; C_OFF=$'\033[0m'
else
  C_RED=''; C_GREEN=''; C_BOLD=''; C_OFF=''
fi

# --- patterns ---------------------------------------------------------------
# Each definition line carries the sentinel so it can be filtered from results
# by line. Do not add a pattern without the sentinel, and do not move these into
# a file that is excluded from scanning.

# A credential-ish keyword assigned a value that looks like a real secret.
ASSIGNED='(password|secret|token|api[_-]?key|bearer)[[:space:]]*[:=][[:space:]]*["'"'"']?[A-Za-z0-9_./+-]{12,}' # scan-secrets:pattern

# Formats that are unambiguously credentials wherever they appear.
KNOWN='(gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,})' # scan-secrets:pattern

# --- helpers ----------------------------------------------------------------

allowlisted() {
  # $1 = "path:lineno:content"
  [ -f "$ALLOWLIST" ] || return 1
  while IFS= read -r entry; do
    case "$entry" in ''|'#'*) continue ;; esac
    case "$1" in *"$entry"*) return 0 ;; esac
  done < "$ALLOWLIST"
  return 1
}

# Run one pattern over every tracked file. Text files only (-I), so a binary
# blob cannot produce noise.
scan() {
  label="$1"; pattern="$2"
  printf '\n%s== %s ==%s\n' "$C_BOLD" "$label" "$C_OFF"

  hits=0
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    # Drop the pattern-definition lines themselves — by line, never by file.
    case "$line" in *"$SENTINEL"*) continue ;; esac
    if allowlisted "$line"; then
      printf '  %sallowlisted%s %s\n' "$C_GREEN" "$C_OFF" "${line%%:*}"
      continue
    fi
    printf '  %sFINDING%s %s\n' "$C_RED" "$C_OFF" "$line"
    hits=$((hits + 1))
  done <<< "$(git grep -nIE "$pattern" -- . 2>/dev/null)"

  if [ "$hits" -gt 0 ]; then
    printf '  %s%d finding(s).%s\n' "$C_RED" "$hits" "$C_OFF"
    return 1
  fi
  printf '  %snone%s\n' "$C_GREEN" "$C_OFF"
  return 0
}

# --- run --------------------------------------------------------------------

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  printf '%sNot a git repository — cannot scan tracked files.%s\n' "$C_RED" "$C_OFF"
  exit 2
fi

status=0
scan "assignment-shaped values" "$ASSIGNED" || status=1
scan "known credential formats" "$KNOWN"    || status=1

printf '\n%s== Coverage ==%s\n' "$C_BOLD" "$C_OFF"
printf '  scanned %s tracked file(s), no file-level exclusions\n' "$(git ls-files | wc -l | tr -d ' ')"

if [ "$status" -ne 0 ]; then
  printf '\n%sSecret-shaped values found.%s\n' "$C_RED" "$C_OFF"
  printf 'If a finding is genuinely not a secret, add a narrow entry to %s\n' "$ALLOWLIST"
  printf 'rather than widening or disabling the scan.\n'
  exit 1
fi

printf '\n%sNo secret-shaped values found.%s\n' "$C_GREEN" "$C_OFF"
exit 0
