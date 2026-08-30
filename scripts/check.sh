#!/usr/bin/env bash
#
# check.sh — the aggregate check.
#
# Runs everything: scaffold structure, the secret scan, the TypeScript
# workspace (the primary stack), and the Python inference boundary. Its defining property is that **a skipped check
# is reported, never silent** — a check that quietly disappears is how a broken
# repository looks healthy.
#
# These are the same checks the merge gate runs (.github/workflows/checks.yml),
# so a green run here predicts a green run there.
#
# Exit codes:
#   0  everything that could run, passed
#   1  something failed
#   2  a check was skipped because a toolchain is missing (nothing failed)
#
# Governed by AGENTS.md and scripts/README.md.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || exit 1

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_BOLD=$'\033[1m'; C_OFF=$'\033[0m'
else
  C_RED=''; C_GREEN=''; C_YELLOW=''; C_BOLD=''; C_OFF=''
fi

PASSED=(); FAILED=(); SKIPPED=()

# Make nvm-managed Node visible without requiring the caller to source it —
# the Pi bootstrap runbook installs Node that way.
if ! command -v pnpm >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1 || true
fi

run() {
  local label="$1"; shift
  printf '\n%s>> %s%s\n    $ %s\n' "$C_BOLD" "$label" "$C_OFF" "$*"
  if "$@"; then
    PASSED+=("$label")
  else
    FAILED+=("$label ($*)")
  fi
}

skip() {
  SKIPPED+=("$1 — $2")
  printf '\n%s>> %s%s\n    %sSKIPPED: %s%s\n' "$C_BOLD" "$1" "$C_OFF" "$C_YELLOW" "$2" "$C_OFF"
}

# --- structure --------------------------------------------------------------

run "scaffold structure" bash scripts/validate-scaffold.sh
run "secret scan"        bash scripts/scan-secrets.sh
# Node standard library only, so it belongs with the structural checks rather
# than behind the TypeScript toolchain gate below. It still needs node itself —
# and a missing toolchain is a SKIP that gets reported, never a silent pass.
if command -v node >/dev/null 2>&1; then
  run "knowledge registry" node scripts/check-knowledge.mjs
  # Image lineage is stdlib-only for the same reason: the lock and its
  # invariants must be checkable before any workspace toolchain exists.
  run "image lineage"      node scripts/check-images.mjs
else
  skip "knowledge registry" "node is not installed (see docs/operations/pi-bootstrap.md)"
  skip "image lineage" "node is not installed (see docs/operations/pi-bootstrap.md)"
fi

# --- TypeScript workspace (primary stack) -----------------------------------

if command -v pnpm >/dev/null 2>&1; then
  run "typescript: lockfile"  pnpm install --frozen-lockfile
  run "typescript: manifests" pnpm run deps:check
  run "typescript: format"    pnpm run format:check
  run "typescript: workspace" pnpm run check:workspace
  # Separate from the line above on purpose: that one checks what manifests
  # DECLARE, this one checks what source IMPORTS. A manifest cannot prove
  # import direction, so neither check substitutes for the other.
  run "typescript: imports"   pnpm run check:imports
  run "typescript: lint"      pnpm lint
  run "typescript: types"     pnpm typecheck
  run "typescript: tests"     pnpm test
  run "typescript: build"     pnpm build
  # REAL repository content through the package's admission rules. It runs
  # after the build because it invokes the published package export rather than
  # a copy of the logic — which is the point: one admission authority, exercised
  # the way a consumer would exercise it.
  run "knowledge content"     pnpm run check:knowledge-content
  # Real release records handed to the toolchain, for the same reason: a
  # mechanism nothing calls is a mechanism nothing enforces.
  run "set releases"          pnpm run check:set-releases
  run "release history"       pnpm run check:release-history
  # Append-only review history is a repository property and belongs here.
  # The PRE-APPLY gate (openspec-review-gate.mjs verify) deliberately does NOT:
  # it refuses repository changes after the reviewed planning commit, so running
  # it unconditionally would fail every implementation commit that follows a
  # review. CI tests that mechanism; it does not re-execute the one-time
  # authorization.
  run "openspec review history" pnpm run check:review-history
elif command -v corepack >/dev/null 2>&1; then
  skip "typescript workspace" "pnpm not provisioned — run 'corepack enable' first"
else
  skip "typescript workspace" "node/corepack not installed (see docs/operations/pi-bootstrap.md)"
fi

# --- Python workspace (admitted inference boundary only) --------------------

if command -v uv >/dev/null 2>&1; then
  # --locked fails on a stale uv.lock rather than repairing it. Without it the
  # aggregate check could fix drift and then report success — reporting on a
  # repository state that does not exist.
  run "python: sync"          uv sync --all-packages --locked
  run "python: lint"          uv run ruff check .
  run "python: format"        uv run ruff format --check .
  run "python: types"         uv run mypy
  run "python: tests"         uv run pytest
else
  skip "python workspace" "uv is not installed (see docs/operations/pi-bootstrap.md)"
fi

# --- summary ----------------------------------------------------------------

printf '\n%s== Summary ==%s\n' "$C_BOLD" "$C_OFF"

for item in "${PASSED[@]:-}";  do [ -n "$item" ] && printf '  %sPASS%s    %s\n' "$C_GREEN" "$C_OFF" "$item"; done
for item in "${SKIPPED[@]:-}"; do [ -n "$item" ] && printf '  %sSKIP%s    %s\n' "$C_YELLOW" "$C_OFF" "$item"; done
for item in "${FAILED[@]:-}";  do [ -n "$item" ] && printf '  %sFAIL%s    %s\n' "$C_RED" "$C_OFF" "$item"; done

if [ "${#FAILED[@]}" -gt 0 ]; then
  printf '\n%s%d check(s) failed.%s\n' "$C_RED" "${#FAILED[@]}" "$C_OFF"
  [ "${#SKIPPED[@]}" -gt 0 ] && printf '%s%d check(s) were also skipped — report them.%s\n' "$C_YELLOW" "${#SKIPPED[@]}" "$C_OFF"
  exit 1
fi

if [ "${#SKIPPED[@]}" -gt 0 ]; then
  printf '\n%sAll %d check(s) that ran passed, but %d were SKIPPED.%s\n' \
    "$C_YELLOW" "${#PASSED[@]}" "${#SKIPPED[@]}" "$C_OFF"
  printf '%sReport every skipped check explicitly — see AGENTS.md.%s\n' "$C_YELLOW" "$C_OFF"
  exit 2
fi

printf '\n%sAll %d checks passed.%s\n' "$C_GREEN" "${#PASSED[@]}" "$C_OFF"
exit 0
