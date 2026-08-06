#!/usr/bin/env bash
#
# validate-scaffold.sh — structural validation for secure-home-agent-platform.
#
# Deliberately dependency-light: bash, coreutils, grep, sed, and git. No jq, no
# Python, no network. It must run on a freshly-prepared Pi before any toolchain
# is installed, because it is the check that tells you whether the repository
# you just cloned is intact.
#
# Deep manifest validation is NOT done here — `uv sync` and `pnpm install` do
# that properly, and scripts/check.sh runs them. This script asserts structure.
#
# Exits non-zero when:
#   - a required navigation file is missing
#   - an INDEX.md references a document that does not exist
#   - a document exists but is not referenced by its INDEX.md
#   - a directory that must explain itself has no README.md
#   - an ADR is missing a required section
#   - a workspace manifest is structurally wrong
#   - an obvious secret file is tracked or staged
#   - a generated directory is tracked or staged
#   - a binary file is tracked (the secret scanner cannot inspect binary content)
#   - guidance names a stale unresolved-decision range (e.g. "U1-U10" after U11)
#   - the canonical taxonomy is violated (a backend process under apps/, etc.)
#
# Governed by AGENTS.md and scripts/README.md.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || exit 2

FAILURES=0
CHECKS=0

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_BOLD=$'\033[1m'; C_OFF=$'\033[0m'
else
  C_RED=''; C_GREEN=''; C_BOLD=''; C_OFF=''
fi

section() { printf '\n%s== %s ==%s\n' "$C_BOLD" "$1" "$C_OFF"; }
pass()    { CHECKS=$((CHECKS + 1)); printf '  %sok%s   %s\n' "$C_GREEN" "$C_OFF" "$1"; }
fail()    { CHECKS=$((CHECKS + 1)); FAILURES=$((FAILURES + 1)); printf '  %sFAIL%s %s\n' "$C_RED" "$C_OFF" "$1"; }
detail()  { printf '         %s\n' "$1"; }

# ---------------------------------------------------------------------------
# 1. Navigation files
#
# These are the files AGENTS.md tells every agent to start from. If one is
# missing, an agent traverses the repository with no contract.
# ---------------------------------------------------------------------------

section "Navigation files"

REQUIRED_FILES="
AGENTS.md
CLAUDE.md
CONTRIBUTING.md
README.md
SECURITY.md
pyproject.toml
package.json
pnpm-workspace.yaml
.npmrc
.gitignore
.editorconfig
.github/copilot-instructions.md
.github/pull_request_template.md
.github/agents/architecture.agent.md
.github/agents/implementation.agent.md
.github/agents/review.agent.md
.github/workflows/checks.yml
.github/dependabot.yml
docs/README.md
docs/architecture/INDEX.md
docs/decisions/INDEX.md
docs/operations/INDEX.md
scripts/validate-scaffold.sh
scripts/check.sh
scripts/scan-secrets.sh
scripts/secret-scan-allowlist.txt
scripts/check-workspace.mjs
scripts/affected-targets.mjs
.syncpackrc.json
"

for f in $REQUIRED_FILES; do
  if [ -f "$f" ]; then pass "$f"; else fail "$f is missing"; fi
done

# Subtrees that carry their own scoped AGENTS.md.
for d in agents deploy docs knowledge profiles services; do
  if [ -f "$d/AGENTS.md" ]; then pass "$d/AGENTS.md"; else fail "$d/AGENTS.md is missing"; fi
done

# ---------------------------------------------------------------------------
# 2. Index integrity — both directions
#
# An index that points at a missing file rots silently; a file that no index
# points at is unreachable. Both are failures.
# ---------------------------------------------------------------------------

section "Index integrity"

# Extract the markdown link targets from a file, keeping only local .md paths.
index_links() {
  grep -o '](\([^)#]*\.md\)' "$1" 2>/dev/null \
    | sed 's/^](//' \
    | grep -v '^http' \
    | sort -u
}

check_index() {
  index_file="$1"
  index_dir="$(dirname "$index_file")"

  [ -f "$index_file" ] || { fail "$index_file is missing"; return; }

  # Forward: every referenced document must exist.
  missing=""
  for link in $(index_links "$index_file"); do
    case "$link" in
      /*) target="${link#/}" ;;
      *)  target="$index_dir/$link" ;;
    esac
    if [ ! -f "$target" ]; then
      missing="$missing $link"
    fi
  done

  if [ -n "$missing" ]; then
    fail "$index_file references missing documents"
    for m in $missing; do detail "$m"; done
  else
    pass "$index_file — all referenced documents exist"
  fi

  # Reverse: every sibling document must be referenced.
  unreferenced=""
  for doc in "$index_dir"/*.md; do
    [ -f "$doc" ] || continue
    base="$(basename "$doc")"
    case "$base" in INDEX.md|README.md|AGENTS.md) continue ;; esac
    if ! grep -qF "($base)" "$index_file" && ! grep -qF "]($base" "$index_file"; then
      unreferenced="$unreferenced $base"
    fi
  done

  if [ -n "$unreferenced" ]; then
    fail "$index_file does not reference documents that exist beside it"
    for u in $unreferenced; do detail "$u"; done
  else
    pass "$index_file — every sibling document is indexed"
  fi
}

check_index docs/architecture/INDEX.md
check_index docs/decisions/INDEX.md
check_index docs/operations/INDEX.md

# ---------------------------------------------------------------------------
# 3. Directories must explain themselves
#
# Rule: every directory needs a README.md (or an INDEX.md, for indexed
# folders), EXCEPT a pure grouping directory — one that holds only
# subdirectories and no files of its own. Package source trees are excluded:
# they are code, and the package's README already covers them.
# ---------------------------------------------------------------------------

section "Directory READMEs"

SCAN_ROOTS="agents apps deploy docs knowledge packages profiles schemas scripts services tests"
readme_missing=""

for root in $SCAN_ROOTS; do
  [ -d "$root" ] || { fail "$root/ is missing"; continue; }
  while IFS= read -r dir; do
    case "$dir" in */src|*/src/*) continue ;; esac
    [ -f "$dir/README.md" ] && continue
    [ -f "$dir/INDEX.md" ] && continue
    # A pure grouping directory holds no files of its own.
    if [ -z "$(find "$dir" -maxdepth 1 -type f -print -quit)" ] \
       && [ -n "$(find "$dir" -mindepth 1 -maxdepth 1 -type d -print -quit)" ]; then
      continue
    fi
    readme_missing="$readme_missing $dir"
  done <<< "$(find "$root" -type d \
      ! -path '*/node_modules*' ! -path '*/.venv*' ! -path '*/__pycache__*' \
      ! -path '*/.mypy_cache*' ! -path '*/.ruff_cache*' ! -path '*/.pytest_cache*' \
      ! -path '*/dist*' ! -path '*/build*' ! -name '*.egg-info')"
done

if [ -n "$readme_missing" ]; then
  fail "directories with no README.md"
  for d in $readme_missing; do detail "$d/"; done
else
  pass "every non-grouping directory has a README.md or INDEX.md"
fi

# ---------------------------------------------------------------------------
# 4. ADR completeness
#
# Every ADR carries the same sections, so a reviewer always knows where the
# security and availability reasoning is.
# ---------------------------------------------------------------------------

section "ADR completeness"

ADR_SECTIONS="## Context|## Decision|## Consequences|## Alternatives considered|## Security implications|## Availability implications|## Validation and follow-up obligations"

adr_count=0
for adr in docs/decisions/ADR-*.md; do
  [ -f "$adr" ] || continue
  adr_count=$((adr_count + 1))
  missing=""
  IFS='|'
  for section_heading in $ADR_SECTIONS; do
    grep -qF "$section_heading" "$adr" || missing="$missing|$section_heading"
  done
  unset IFS
  grep -q '^- \*\*Status:\*\*' "$adr" || missing="$missing|Status line"
  grep -q '^- \*\*Date:\*\*' "$adr"   || missing="$missing|Date line"

  if [ -n "$missing" ]; then
    fail "$(basename "$adr") is missing required sections"
    IFS='|'
    for m in $missing; do [ -n "$m" ] && detail "$m"; done
    unset IFS
  fi
done

if [ "$adr_count" -eq 0 ]; then
  fail "no ADRs found in docs/decisions/"
else
  pass "$adr_count ADRs present, all carrying the required sections"
fi

# ---------------------------------------------------------------------------
# 5. Workspace manifests (structural only)
#
# `uv sync` and `pnpm install` do the real validation; scripts/check.sh runs
# them. This catches the structural mistakes that would make those tools fail
# confusingly.
# ---------------------------------------------------------------------------

section "Workspace manifests"

if grep -q '^\[tool\.uv\.workspace\]' pyproject.toml; then
  pass "pyproject.toml declares [tool.uv.workspace]"
else
  fail "pyproject.toml has no [tool.uv.workspace] section"
fi

py_member_problems=""
for manifest in services/workers/*/pyproject.toml; do
  [ -f "$manifest" ] || continue
  grep -q '^\[project\]' "$manifest"      || py_member_problems="$py_member_problems $manifest:no-[project]"
  grep -q '^name = '     "$manifest"      || py_member_problems="$py_member_problems $manifest:no-name"
  grep -q '^\[build-system\]' "$manifest" || py_member_problems="$py_member_problems $manifest:no-[build-system]"
done

if [ -n "$py_member_problems" ]; then
  fail "Python workspace members are structurally invalid"
  for p in $py_member_problems; do detail "$p"; done
else
  pass "every Python workspace member declares [project], name, and [build-system]"
fi

grep -q '"private": true'    package.json && pass 'package.json is private' \
  || fail 'package.json must set "private": true'
grep -q '"packageManager"'   package.json && pass 'package.json pins packageManager' \
  || fail 'package.json must pin "packageManager" for Corepack'
grep -q '^packages:'         pnpm-workspace.yaml && pass 'pnpm-workspace.yaml declares packages' \
  || fail 'pnpm-workspace.yaml has no packages: list'

ts_member_problems=""
for manifest in services/*/package.json services/workers/*/package.json apps/*/package.json packages/*/package.json; do
  [ -f "$manifest" ] || continue
  grep -q '"private": true' "$manifest" || ts_member_problems="$ts_member_problems $manifest:not-private"
  grep -q '"name"'          "$manifest" || ts_member_problems="$ts_member_problems $manifest:no-name"
done

if [ -n "$ts_member_problems" ]; then
  fail "TypeScript workspace members are structurally invalid"
  for p in $ts_member_problems; do detail "$p"; done
else
  pass "every TypeScript workspace member is private and named"
fi

# ---------------------------------------------------------------------------
# 6. Tracked secrets
#
# .gitignore does not stop `git add -f`. This does. Checks the index, so it
# catches a secret that is staged but not yet committed.
# ---------------------------------------------------------------------------

section "Tracked secrets"

if git rev-parse --git-dir >/dev/null 2>&1; then
  tracked="$(git ls-files 2>/dev/null)"

  SECRET_PATTERNS='(^|/)\.env($|\.)|\.pem$|\.key$|\.p12$|\.pfx$|\.jks$|(^|/)id_rsa$|(^|/)id_ed25519$|(^|/)credentials\.json$|(^|/)secrets\.ya?ml$|\.kubeconfig$|\.tfstate($|\.)'
  offenders="$(printf '%s\n' "$tracked" | grep -Ei "$SECRET_PATTERNS" | grep -v '\.env\.example$')"

  if [ -n "$offenders" ]; then
    fail "secret-shaped files are tracked or staged"
    printf '%s\n' "$offenders" | while IFS= read -r o; do detail "$o"; done
  else
    pass "no secret-shaped file is tracked or staged"
  fi

  GENERATED_PATTERNS='(^|/)node_modules/|(^|/)\.venv/|(^|/)__pycache__/|(^|/)\.mypy_cache/|(^|/)\.ruff_cache/|(^|/)\.pytest_cache/|(^|/)dist/|(^|/)build/|\.egg-info/'
  generated="$(printf '%s\n' "$tracked" | grep -E "$GENERATED_PATTERNS")"

  if [ -n "$generated" ]; then
    fail "generated directories are tracked or staged"
    printf '%s\n' "$generated" | head -20 | while IFS= read -r g; do detail "$g"; done
  else
    pass "no generated directory is tracked or staged"
  fi
else
  fail "not a git repository — cannot check tracked files"
fi

# ---------------------------------------------------------------------------
# 7. No tracked binaries
#
# scripts/scan-secrets.sh finds secret-shaped values by pattern matching, and
# `git grep -I` cannot inspect binary content — a credential inside a binary
# blob would simply not be found. Rather than leave that as an unstated
# assumption, the assumption is enforced: this repository tracks text only.
#
# This is a policy check, not a capability limit. If binary artifacts ever need
# to be tracked, the correct response is a reviewed decision that also says how
# they will be checked for embedded credentials — not deleting this check.
# ---------------------------------------------------------------------------

section "No tracked binaries"

if git rev-parse --git-dir >/dev/null 2>&1; then
  # git ls-files --eol reports index content classification; i/-text is binary.
  binaries="$(git ls-files --eol 2>/dev/null | awk '$1=="i/-text" {sub(/^[^\t]*\t/, ""); print}')"

  if [ -n "$binaries" ]; then
    fail "binary files are tracked — the secret scanner cannot inspect them"
    printf '%s\n' "$binaries" | head -20 | while IFS= read -r b; do detail "$b"; done
    detail "tracking a binary requires a reviewed decision covering how it is"
    detail "checked for embedded credentials — see scripts/scan-secrets.sh"
  else
    pass "no binary file is tracked (secret scanning covers all tracked content)"
  fi
else
  fail "not a git repository — cannot check for tracked binaries"
fi

# ---------------------------------------------------------------------------
# 8. Canonical taxonomy (ADR-0012 §5)
#
# Directory role is determined by what a thing IS, not what language it is
# written in. The rule most likely to be violated is a deployable backend
# process appearing under apps/, which would also break the dependency rule that
# nothing may import an application.
#
# Deep workspace validation (naming, scripts, dependency direction) is
# scripts/check-workspace.mjs, which needs Node. This check is dependency-light
# so it still runs on a bare checkout.
# ---------------------------------------------------------------------------

section "Canonical taxonomy"

for d in services apps packages agents; do
  if [ -d "$d" ]; then pass "$d/ exists"; else fail "$d/ is missing"; fi
done

# A backend process must not live under apps/.
misplaced=""
for name in control-plane runner-control worker workers; do
  [ -d "apps/$name" ] && misplaced="$misplaced apps/$name"
done
if [ -n "$misplaced" ]; then
  fail "deployable backend processes found under apps/"
  for m in $misplaced; do detail "$m — belongs under services/"; done
else
  pass "no deployable backend process under apps/"
fi

# The canonical deployables exist where ADR-0012 puts them.
for d in services/control-plane services/runner-control services/workers apps/web; do
  if [ -d "$d" ]; then pass "$d/"; else fail "$d/ is missing"; fi
done

# Python is confined to the admitted inference boundary.
stray_py="$(find services apps packages agents -name pyproject.toml \
    -not -path 'services/workers/python-inference/*' 2>/dev/null || true)"
if [ -n "$stray_py" ]; then
  fail "Python manifests outside the admitted inference boundary"
  printf '%s\n' "$stray_py" | while IFS= read -r f; do detail "$f"; done
  detail "Python is permitted only under services/workers/ (ADR-0012 §6)"
else
  pass "Python is confined to services/workers/python-inference"
fi

# ---------------------------------------------------------------------------
# 9. Unresolved-decision range references are current
#
# Authoritative guidance states the open set as a range — "acceptance resolved
# none of U1-U11". When a new item is added, every one of those references must
# move with it. A stale range UNDERSTATES what is blocked, which in the one case
# that mattered would have read as unblocking persistence work.
#
# Historical statements must not use the range form; say "every item then open"
# instead, so every range in the repository is a present-tense claim and this
# check needs no exceptions.
# ---------------------------------------------------------------------------

section "Unresolved-decision ranges"

if [ -f docs/architecture/unresolved-decisions.md ]; then
  # Highest U-number that actually has a section.
  max_u="$(grep -o '^## U[0-9][0-9]*' docs/architecture/unresolved-decisions.md \
    | sed 's/^## U//' | sort -n | tail -1)"

  if [ -z "$max_u" ]; then
    fail "no '## U<n>' sections found in unresolved-decisions.md"
  else
    stale="$(grep -rn 'U1[–-]U[0-9][0-9]*' --include='*.md' . 2>/dev/null \
      | grep -v "U1[–-]U${max_u}\b" || true)"

    if [ -n "$stale" ]; then
      fail "guidance names a stale unresolved-decision range (current: U1-U${max_u})"
      printf '%s\n' "$stale" | head -10 | while IFS= read -r line; do detail "$line"; done
      detail "a stale range understates what is blocked — update it, or drop the"
      detail "range form if the statement is historical"
    else
      pass "every U-range reference names the current set (U1-U${max_u})"
    fi
  fi
else
  fail "docs/architecture/unresolved-decisions.md is missing"
fi

# ---------------------------------------------------------------------------

section "Result"

if [ "$FAILURES" -eq 0 ]; then
  printf '  %s%d checks passed.%s\n\n' "$C_GREEN" "$CHECKS" "$C_OFF"
  exit 0
fi

printf '  %s%d of %d checks FAILED.%s\n\n' "$C_RED" "$FAILURES" "$CHECKS" "$C_OFF"
exit 1
