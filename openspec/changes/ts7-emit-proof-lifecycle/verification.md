# Verification: TS7 emit proof lifecycle

Validation ran on Linux x64 with Node 24.18.1, pnpm 11.18.0, and Python 3.13.3.
Base: `5447e78fa9d63ce2c20ea8de81a1cd321bdf9b6a`. No compiler/dependency pin or
lockfile changed. This is author validation; independent review remains pending.

## Commands and actual results

Commands using Node ran with
`PATH=/home/mike/.nvm/versions/node/v24.18.1/bin:$PATH`; Python commands used
`UV_PYTHON=3.13`. These select installed interpreters without changing repository
or global version configuration.

| Command | Observed result |
|---|---|
| `pnpm install --frozen-lockfile` | Exit 0; all 19 workspace projects; 205 packages; lockfile up to date. Existing lint-config/testing cycle warning |
| `UV_PYTHON=3.13 uv sync --all-packages --locked` | Exit 0; Python 3.13.3; 14 packages resolved, 13 installed |
| `bash scripts/validate-scaffold.sh` | `107 checks passed.` |
| `pnpm run check:emit-history` | `3 frozen blobs, seals, TS6 capture and cutover binding verified; no current-source or maintenance verdict` |
| `OPENSPEC_TELEMETRY=0 pnpm exec openspec validate ts7-emit-proof-lifecycle --strict` | `Change 'ts7-emit-proof-lifecycle' is valid` |
| `bash scripts/check.sh` | Exit 0: `All 28 checks passed.`; pytest: `1408 passed in 236.49s (0:03:56)` |
| `uv run pytest -q tests/test_ts7_emit_lifecycle.py` (final hostile net) | `25 passed in 21.34s` |
| `pnpm exec prettier --check scripts/check-emit-history.mjs` | `All matched files use Prettier code style!` |
| `uv run ruff check tests/test_ts7_emit_lifecycle.py` | `All checks passed!` |
| `uv run ruff format --check tests/test_ts7_emit_lifecycle.py` | `1 file already formatted` |
| `uv run mypy tests/test_ts7_emit_lifecycle.py` | `Success: no issues found in 1 source file` |
| `git diff --cached --check` | Exit 0; no whitespace errors |

The aggregate included scaffold, secrets, knowledge registry/content, image
lineage, review/release history, policy, retirement, toolchain boundaries,
dependency/frozen-lock/format checks, workspace/import checks, full TypeScript
lint/typecheck/test/build, historical emit integrity, OpenSpec schema, and Python
sync/lint/format/mypy/pytest. All passed; its summary reported no skips. Expected
negative-fixture diagnostics occurred inside passing tests.

The final targeted run adds symlink substitution and Git-index-hidden source
edits to the 20 lifecycle cases collected by the aggregate. The new guards and
25-case final net were checked after those additions; the whole aggregate was
not redundantly repeated.

## Hostile proof

- An ordinary captured `packages/logging/src/index.ts` is edited only in a
  disposable clone. The real normal compiler emits different JavaScript, while
  all three evidence hashes remain unchanged and historical integrity passes.
  Replay refuses that current revision.
- Each frozen artifact is edited, rebound and resealed, deleted, and replaced
  with a symlink to the original bytes. Every case is refused.
- Missing historical objects, tracked/untracked/ignored extra source, and edits
  hidden by `assume-unchanged` or `skip-worktree` are refused. The hidden-edit
  controls first prove that `git status` reports a clean tree.
- A different installed compiler identity cannot stand in for the initial
  cutover compiler.
- An exact detached checkout of `4de51a4ea30a2480fb003143fc7374218689225d`
  installs its frozen dependencies **offline**, rebuilds historical TS7 output,
  and passes the unchanged differential. It remains clean, and all TS6 hashes
  match before and after. No TS6 capture command runs.
- Two real Git-revision fixtures use the unchanged predecessor planner/checker:
  a synthetic compiler pin/derived-lock update is structurally eligible, but
  adding shared-compiler-policy drift or an always-success candidate checker is
  refused as `UNDECLARED_CHANGE`. Historical integrity passes in those candidates,
  proving its success cannot substitute for maintenance admission.
- Existing declaration/map/differential, compiler identity, maintenance
  classifier, trusted-boundary, and governance suites passed in the aggregate.

## Frozen identities and scope

`git hash-object` still returns the original Git blobs:

| Artifact | Blob |
|---|---|
| `tests/evidence/ts6-emit-baseline.json` | `e97f80f94b37030f7058f831ba9eb15a89806868` |
| `tests/evidence/ts6-migration-projection.json` | `d1d94422d10665a19e2a021a8c9471ce7225d599` |
| `tests/evidence/ts6-migration-projection-v2.json` | `db14bbae068e97599f4391e2b9c2394ff693abda` |

The scoped `git diff --cached --exit-code -- <protected paths>` returned 0 for
all evidence, maintenance policy/planner/verifier/workflows, native platform
workflow, catalog/lock, service/agent/package source, governance state, all
archives, the governance-substrate change, accepted/proposed ADRs, unresolved
decisions, and canonical OpenSpec specs. Only the emit step changed in CI/local
aggregate wiring. No historical binding registration changed.

`gh pr view 126 --json headRefOid,state,isDraft,url` confirmed `OPEN`, draft,
and `7309acb17e8e8d4a855d25c4d24317f621692b82` after validation. The original
workspace remains clean at `cbd0c288b60fce0f7ea022c9e7423fbf8af3b3d9`;
all correction work is in its separate branch/worktree.

## Setup failures resolved and checks not run

The ambient Node 20/pnpm wrapper initially reported a missing pnpm 11.18.0
executable (`ENOENT`). The ambient uv Python request resolved to 3.11.12 and
failed the `>=3.13` requirement. Selecting the already installed versions above
resolved both. Initial Ruff found four overlong lines in the new test; formatting
resolved them and the final checks passed.

Hosted CI and native ARM64 execution are not awaited; the user monitors CI.
No trusted maintenance dispatch was run: this changes no compiler pin, and the
offline classifier fixtures are not represented as real maintenance evidence.
Independent review, merge, and validated canonical spec sync/archive remain
pending by the user's requested draft-review boundary. No TS6 capture,
infrastructure operation, or protected PR mutation was performed.

## Related

- [Contract inspection and lifecycle rationale](design.md)
- [Assurance and traceability](assurance.md)
- [Tasks](tasks.md)
