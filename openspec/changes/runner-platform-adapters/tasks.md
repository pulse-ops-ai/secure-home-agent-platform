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
moves from three to four (the checker itself needed no edit — its rules
were class-based already) — all mechanically forced by the in-scope
deliverables, none touching `services/runner-control/`.

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
- [x] lock entry with bootstrap sentinel; NO `check-images.mjs` edit was
  needed — the checker was class-based already and admits the fourth
  entry under the existing rules (the only count assertion lived in
  `tests/test_image_lineage.py`'s live-repository control, updated
  3→4); L5 adversarial corpus green (132 image-lineage cases pass)
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
- [ ] PA-ADV-01…17 executed and recorded below with real outputs
- [ ] PA-MUT-01…12 applied, killed, reverted, recorded below with real
  outputs

## Adversarial round record

To be filled during implementation, one row per probe, with the actual
killing output. An unexecuted probe stays unrecorded — this section never
contains predicted results.

## Mutation round record

Same rule: recorded only as executed, with the proof that killed each
mutant and verification that the tree was restored.

## PR-1 Completion Gate

- [ ] every ladder check green in CI at the completion head (or its local
  status disclosed with CI as authority)
- [ ] `images.yml` green at the completion head with recorded digests;
  base/claude/gates identities byte-identical to the L5 record
- [ ] `git diff <base>..HEAD -- services/runner-control/` empty
- [ ] `git diff <base>..HEAD -- packages/contracts/schemas/` empty
- [ ] owner review verdict on the draft PR
