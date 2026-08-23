# Implementation Tasks: runner-platform-adapters

## Contract

This file records execution state for the `runner-platform-adapters`
change. Planning artifacts under `openspec/` confer no implementation
authority; the authority is external and recorded below
(`openspec/AGENTS.md`). A checked box asserts work actually performed on
the branch `feat/runner-platform-adapters`, with evidence in the PR — a
box is never checked in advance.

## Implementation Authorization

### External authority

- **GitHub issue #55** — the L7 landing contract on the runner critical
  path: the Claude reference adapter and the Copilot adapter against
  accepted ADR-0013; the Copilot derived image (depends on the L5 base);
  the L2 neutrality proofs (EX-002, PROP-004) re-run; the PROP-006
  re-proof for transcript consumption. Expected scope:
  `agents/adapters/coding/claude-code/**`,
  `agents/adapters/coding/copilot-cli/**`, `deploy/images/**`,
  `pnpm-lock.yaml`. Completion intent: both adapters conform to accepted
  ADR-0013; the neutrality re-proof is green; the adapters remain
  unlaunchable (no L9 launcher). Prerequisites — L5 merged (#94),
  GATE-U6/ADR-0013 accepted, the L6 spike done — are all satisfied.
- **Owner instruction** (closing the #53 / PR #94 review, 2026-08-22):
  "After it merges, I would consider #53 / L5 complete. lets move to the
  runner critical path to #55 / L7."
- Base commit: main `59a8ea042591c55b8f88d9435987740ff39a9b04` (includes
  the #94 merge `f9ebace` and the #95 archive scrub), clean tree verified
  before branching.

### Status

**AUTHORIZED** — external task contract (#55) plus explicit owner
instruction, recorded above. Scope deviations this change knows about in
advance, disclosed rather than discovered: workspace admission requires
`pnpm-workspace.yaml` and `scripts/workspace-model.mjs` edits, CI wiring
requires one `checks.yml` step, the conformance suite lives at
`tests/framework-conformance/` per its landed README, and the
live-repository image-count control in `tests/test_image_lineage.py`
moves from three to four (the checker's rules were class-based already,
so ADMISSION needed no checker edit; one rule was later ADDED when
mutation PA-MUT-10 exposed a version-consumption gap — see the mutation
record) — all mechanically forced by the in-scope deliverables, none
touching `services/runner-control/`.

## Landing Plan

One PR (one landing, inert throughout), with the L5 digest-bootstrap
protocol for the new image:

1. change artifacts validated strictly; workspace admission; both adapter
   packages with unit tests; conformance suite; every static gate green;
2. Copilot image definition + sentinel lock entry; the PR's governed
   `images.yml` run fails verification loudly and emits real digests;
3. digests recorded from CI evidence (base/claude/gates digests must not
   move); the next run converges green;
4. docs reconciliation sweep; full validation ladder; adversarial and
   mutation rounds executed and recorded here; draft PR → review; STOP at
   review.

# PR-1 — Platform adapters

## Completion Definition

Both adapters landed and conformant; the shared suite green in CI;
`secure-home-runner-copilot` locked with governed digests; zero contract
diff; `services/runner-control/` byte-identical to base; every check in
the ladder run and reported, including the known local plain-`uv` rows.

## 0. Preflight

- [x] main synced to `59a8ea04…`, tree clean, branch
  `feat/runner-platform-adapters` created
- [x] baseline `bash scripts/validate-scaffold.sh` — 82 checks passed
- [x] frozen SPI, workspace rules, conformance README, L6 findings, L5
  conventions read; seam design decided (design.md)
- [x] Copilot npm identities resolved from registry.npmjs.org
  (1.0.79 main + linux-x64 + linux-arm64 + detect-libc 2.1.2)
- [ ] #55 body re-verified verbatim against the live issue before the PR
  opens (GitHub API unreachable at authoring time; scope recorded from
  the prior session's read)

## 1. Change artifacts

- [x] proposal.md, design.md, assurance.md, tasks.md, two spec deltas
- [x] `openspec validate runner-platform-adapters --strict` passes

## 2. Workspace admission

- [x] `pnpm-workspace.yaml`: `'agents/adapters/coding/*'` member glob
- [x] `scripts/workspace-model.mjs`: `MEMBER_GLOBS` + two `LAYERS`
  entries at layer 3, with rationale comment
- [x] `pnpm install` regenerates `pnpm-lock.yaml` with the two members
- [x] `check:workspace` + `check:imports` green with the members present

## 3. @secure-home/adapter-claude-code

- [x] package.json (zero runtime deps, devDeps only, four scripts),
  tsconfig pair, vitest config per repo convention
- [x] `src/spi.ts` mirror + closed wire validators, provenance comment
- [x] `src/plan.ts` — grant→allowed/disallowed tools, `-p` task,
  `--model` pass-through, stream-json capture flags
- [x] `src/observe.ts` — stream-json → observation; usage in native
  token units; hostile-input total behavior
- [x] `src/bin.ts` — wire entry, SIGTERM forwarding, stdout purity
- [x] unit tests incl. hostile corpus (committed fixtures)
- [x] README rewritten: implemented status, normalization basis, paired
  image, boundary rules preserved

## 4. @secure-home/adapter-copilot-cli

- [x] same package skeleton and wire entry
- [x] `src/plan.ts` — `--available-tools`/`--deny-tool`/`--no-ask-user`,
  explicit `--model`, per-run `COPILOT_HOME` obligation surfaced to the
  substrate as data
- [x] `src/observe.ts` — stdout JSON framing + persisted events;
  `toolCallId` correlation; denial dispositions; 124/0 disagreement
  carried; native token/request/credit units
- [x] unit tests incl. hostile corpus
- [x] README rewritten with the L6-traced normalization-basis table

## 5. Framework-conformance suite

- [x] stub CLIs (stdlib-only Node scripts): claude + copilot dialects,
  scenario-selected; deterministic
- [x] tether test (derive-or-refuse against frozen SPI source)
- [x] identical-contract golden run; cancellation; cannot-widen;
  failure-through-contract; stdout purity; exit semantics
- [x] unlaunchability + zero-runtime-deps + side-effect-free import +
  pinned-version agreement tests
- [x] README status flip; R0 mapping to runner-control's own proof
  recorded

## 6. Copilot image + lock

- [x] `deploy/images/runner-copilot/Dockerfile` (three verified tarballs,
  declaration+consumption, `copilot --version` assertion, curl purged)
- [x] lock entry with bootstrap sentinel; the class-based checker admits
  the fourth entry with no admission edit (the only count assertion
  lived in `tests/test_image_lineage.py`'s live-repository control,
  updated 3→4). One rule was ADDED after PA-MUT-10: a RUN must consume
  `${RUNTIME_VERSION}` as well as `${RUNTIME_PACKAGE}` (nothing
  weakened; new red fixture pins it); image-lineage suite green at 67
  cases
- [x] `tests/test_image_lineage.py` extended for the fourth entry
- [ ] governed CI run emits digests; recorded; base/claude/gates digests
  byte-identical to L5 (differential proof in PR)

## 7. CI wiring

- [x] `checks.yml` classifier job: build the two adapters (after the
  knowledge-toolchain build, before pytest), rationale comment in the
  workflow

## 8. Documentation sweep

- [x] adapters tier README, agents/AGENTS.md status line if stale, root
  README status row, architecture INDEX/status boxes, runner-model.md
  adapter status, deploy/images/README.md fourth row,
  CONTRIBUTING/copilot-instructions if they state adapter absence
- [x] `grep -rn` sweep for "no adapter is implemented" / "No adapter
  exists" / inventory-of-three statements; every hit reconciled

## 9. Validation ladder + adversarial rounds

- [x] `bash scripts/validate-scaffold.sh`, `bash scripts/scan-secrets.sh`
- [x] `node scripts/check-images.mjs`, workspace + imports checks
- [x] pnpm: install --frozen-lockfile, deps:check, format:check
  (prettier --write then --check LAST), lint, typecheck, test, build
- [x] pytest: full suite via the uv 3.13 override; the 5 plain-uv rows'
  local status disclosed as always (CI is authority)
- [x] PA-ADV-01…17 executed and recorded below with real outputs
- [x] PA-MUT-01…12 applied, killed, reverted, recorded below with real
  outputs

## Adversarial round record

Executed 2026-08-23 on the branch head after the full ladder ran green.
Transient probes were applied as real tree mutations, the gate observed
failing with the quoted output, then reverted (`git checkout`), with the
runner-control zero-diff re-verified after PA-ADV-12.
PA-ADV-06/07/08/09/10/16/17 are permanent committed tests rather than
transient probes; their kill evidence is the passing suite itself.

| ID | Result | Killing output (verbatim, abridged) |
|---|---|---|
| PA-ADV-01 | KILLED | undeclared variant: `spi.test.ts:161: imports "@secure-home/runner-control" without declaring it`; declared variant: `imports "@secure-home/runner-control", which is a service — nothing may import a service or an app` |
| PA-ADV-02 | KILLED | conformance `test_adapter_manifest_has_zero_runtime_dependencies[claude-code]` failed on the planted `dependencies: {zod}` |
| PA-ADV-03 | KILLED | check-workspace: `agents/adapters/coding/claude-code (layer 3) depends on the framework package "@nestjs/common" — contract-shaped packages describe shapes and must stay framework-neutral` |
| PA-ADV-04 | KILLED | tether: `@secure-home/adapter-claude-code spi.ts: TerminalObservations disagrees with the frozen SPI — missing ['signalled'], extra []` |
| PA-ADV-05 | KILLED (committed) | `test_underivable_frozen_source_refuses` — missing file, hollow file, and absent union all raise `TetherError` |
| PA-ADV-06 | KILLED (committed) | wire tests: unknown top-level and nested keys (`image`, `argv`, `mounts`, `sudo`, `host_path`) → `environmental_fault … unknown key` |
| PA-ADV-07 | KILLED (committed) | golden runs: disposition sequence `[permitted, denied]` both adapters; argv narrowed to the grant (`test_argv_narrows_to_the_grant`) |
| PA-ADV-08 | KILLED (committed) | `test_forged_report_content_cannot_become_the_report`: forged terminal never surfaces; forgery lands as claim content |
| PA-ADV-09 | KILLED (committed) | 14-entry hostile corpus per adapter (unit) + `hostile` stub scenario (conformance): every entry a well-formed report, zero uncaught exceptions |
| PA-ADV-10 | KILLED (committed) | copilot cancellation: `{exit_code: 124, reported_outcome: "0", signalled: "SIGTERM"}` carried unreconciled |
| PA-ADV-11 | KILLED | scan-secrets: `FINDING …copilot-cli/src/test-fixtures.ts:39: { name: 'empty', stdout: 'ghp_…' }` — no adapter allowlist entry exists |
| PA-ADV-12 | KILLED | conformance unlaunchability scan, both fields probed: `[dependencies]` and `[devDependencies]` each → `nothing may reference an adapter until a launcher lands (L9)`; runner-control diff re-verified 0 lines after revert |
| PA-ADV-13 | KILLED | check-images, three independent refusals: `runtime identity "copilot @github/copilot-claude" resolves to more than one provider (claude, copilot)`; neutrality token scan; ARG declaration mismatch |
| PA-ADV-14 | KILLED (mechanism) | faithful `set -eu` harness: wrong sha512 → `detect-libc.tgz: FAILED`, exit 1, the install line never reached; the governed build uses the same `set -eux` RUN. (First demo attempt wrongly wrapped the subshell in `\|\|`, which suppresses `-e` — redone without it.) |
| PA-ADV-15 | KILLED | check-images: `deploy/images/runner-codex/Dockerfile exists but is not registered in the lock`; the reverse direction is a committed L5 fixture case |
| PA-ADV-16 | KILLED (committed) | `test_no_model_identifier_constant_in_adapter_source` scans production source for model-identifier patterns |
| PA-ADV-17 | KILLED (committed) | `test_the_suite_is_one_suite`: no module hardcodes an adapter binary path or indexes a single adapter out of the registry |

## Mutation round record

Executed 2026-08-23. Every mutant applied with a VERIFYING patcher
(anchor asserted; on the one survival claim, the built `dist/` was
checked for the mutation before believing it), killed by the named
proof, then reverted and rebuilt clean.

| ID | Result | Killed by |
|---|---|---|
| PA-MUT-01 | KILLED | claude unit suite: 6 failed (unknown-key refusals) on the parser mutant |
| PA-MUT-02 | KILLED | claude unit suite: 5 failed (hostile corpus) on the rethrow mutant |
| PA-MUT-03 | KILLED | claude unit suite: 1 failed — empty grant emitted `default` instead of `""` |
| PA-MUT-04 | KILLED | conformance `test_valid_invocation_yields_exactly_one_report[claude-code]` on the stdout-diagnostic mutant |
| PA-MUT-05 | KILLED | conformance `test_malformed_invocation_refuses_through_the_contract[claude-code]` on the nonzero-exit mutant |
| PA-MUT-06 | KILLED (standing) | `test_underivable_frozen_source_refuses` — a hardcoded-list tether would pass the unreadable-source fixture and fail this assertion |
| PA-MUT-07 | KILLED | copilot unit suite: 2 failed — disagreement resolved instead of carried |
| PA-MUT-08 | KILLED | copilot unit suite: 1 failed — `requests.cost` mapped as usage |
| PA-MUT-09 | KILLED | check-images: `parent_digest sha256:…58d6 does not equal secure-home-runner-base's digest sha256:…58d5` |
| PA-MUT-10 | **SURVIVED, then fixed** | every `${RUNTIME_VERSION}` consumption replaced by a literal passed the package-only rule. Fixed forward: `check-images.mjs` now also requires a RUN consuming `${RUNTIME_VERSION}` (rule ADDED, none weakened); new red fixture `test_a_version_no_run_consumes_is_refused` pins it; mutant re-run now killed: `no RUN instruction consumes ${RUNTIME_VERSION}` ; live tree and all 67 image-lineage cases green |
| PA-MUT-11 | KILLED | via PA-ADV-12's two-field probe: the scan catches `devDependencies` references, not only `dependencies` |
| PA-MUT-12 | KILLED (after two harness defects) | first attempt: unreachable-code mutant failed `tsc` and the swallowed build error left dist clean — a false SURVIVED; second attempt verified `dist/` contained the mutation (SIGTERM registration removed, 4 vs 5 occurrences): `test_sigterm_reaches_the_provider_and_is_observed[claude-code]` FAILED on the mutant; reverted, rebuilt, re-verified |

Harness lessons recorded: (1) piping a probe through `\|\| echo` or
`\| tail` suppresses/masks the exit under test — both re-run cleanly;
(2) a mutant is only believed applied when the ARTIFACT under test
(built dist, not just src) demonstrably contains it.

## PR-1 Completion Gate

- [ ] every ladder check green in CI at the completion head (or its local
  status disclosed with CI as authority)
- [ ] `images.yml` green at the completion head with recorded digests;
  base/claude/gates identities byte-identical to the L5 record
- [ ] `git diff <base>..HEAD -- services/runner-control/` empty
- [ ] `git diff <base>..HEAD -- packages/contracts/schemas/` empty
- [ ] owner review verdict on the draft PR
