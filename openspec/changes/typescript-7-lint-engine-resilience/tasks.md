# Implementation Tasks: TypeScript 7 and lint-engine resilience

## Contract and Ownership

| Source | What it owns |
|---|---|
| `proposal.md` | motivation, three-PR scope, impact, non-goals |
| `specs/**` | observable normative behavior |
| `design.md` | architecture, decisions, verified feasibility, landing seams |
| `assurance.md` | invariants, proof obligations, authority allocation, review exit |
| Proposed ADR-0022 | capability authority model, only after explicit acceptance |
| `AUTH-*` canonical artifacts | exact mutable facts in their allocated families, including semantic policy, per-engine mappings, and maintenance transition classes |
| `tasks.md` | sequencing, paths, prerequisites, checks, progress, review scopes |
| `preimplementation-review.md` | current independent decision over pinned planning bytes |

Task completion cannot redefine a requirement, decision, invariant, canonical
authority, or authorization. Historical `reviews/**` is evidence only.

## Pre-Implementation Gate

Before any PR-B or PR-C implementation task begins:

- `pnpm exec openspec validate typescript-7-lint-engine-resilience --strict`
  must pass;
- the current review epoch for the selected scope must pass
  `pnpm run review:verify --change typescript-7-lint-engine-resilience
  --base origin/main --remote origin/main` (or the trusted hosted boundary);
- the verdict must be `ARCHITECTURE_ACCEPTED` with zero unresolved P1 and zero
  unassigned P2/P3;
- ADR-0022 must be explicitly accepted by the repository owner; and
- a new external task contract must authorize the selected implementation scope.

Stop on any refusal. PR-A planning validation is not implementation authority.

---

## Implementation Authorization

This section records authority; it does not create it.

### External authority

| Field | Value |
|---|---|
| Source type | `user_task` |
| Source id / link | repository-owner instruction dated 2026-08-31 for PR-A planning only |
| Authorized scope | create and open the planning/architecture PR containing Proposed ADR-0022 and this v2 package |
| Constraints | do not implement Scope 1 or Scope 2; do not modify/stack/cherry-pick/rebase PR #113; stop after opening draft PR-A |
| Owner | repository owner / task author |
| Recorded at | base `70f23f43a6ca95f128de664c242187ad6026a67d`, 2026-08-31 |

### Status

**`NOT_AUTHORIZED`**

Reason: the explicit task authorizes PR-A planning only; ADR-0022 is Proposed;
the first independent review required focused closure and the corrected planning
bytes have not yet received a fresh accepting review; neither implementation
scope has an accepted review epoch or an external implementation task contract.

---

## Landing Plan

| Landing | Ships | Authority posture | Required canonical authorities | Completion condition |
|---|---|---|---|---|
| PR-A | Proposed ADR and complete v2 planning package | inert / proposed | AUTH-ADR-TS7, AUTH-REVIEW-SCOPES | planning validation green; independent review and owner acceptance still external |
| PR-B | replacement authority / parity foundation | dual blocking lint; TypeScript 6 remains compiler | AUTH-LINT-POLICY-SCHEMA, AUTH-LINT-POLICY, AUTH-LEGACY-EXTRACTOR, AUTH-LINT-CONFIG, AUTH-LINT-CONFORMANCE, AUTH-MEMBER-ROLES, AUTH-TS6-CONSUMERS, AUTH-PLATFORM-MATRIX, AUTH-ENGINE-PINS | complete parity and native x64/arm64 proof; ESLint retained |
| PR-C | TypeScript 7 cutover / ESLint retirement | TS7 compiler authority; replacement lint only | AUTH-TS-PINS plus accepted PR-B authorities | repeated audit, native x64/arm64 proof, no ESLint residue, all gates green |

PR-B and PR-C are the only independently releasable implementation scopes.

---

# PR-B — Scope 1: replacement authority / parity foundation

<!-- review-scope: replacement-authority-parity -->

## Completion Definition

PR-B is complete only when the canonical policy and boundary authorities exist,
ESLint and Oxlint/tsgolint both block on the complete corpus, the source-import
gate uses the bounded compatibility API without semantic drift, exact package
installation needs no script exception, and native Linux AMD64/ARM64 command
packs pass. TypeScript remains 6.0.3 and ESLint remains installed.

## 1. Contract and implementation tasks

- [ ] **1.1 Create semantic-policy, engine-mapping, and toolchain-boundary schemas**
  <!-- agent-task: 1.1 paths=packages/lint-config/policy.schema.json,packages/lint-config/engine-mappings.schema.json,scripts/toolchain-boundaries.schema.json,packages/lint-config/package.json,packages/lint-config/README.md,scripts/workspace-model.mjs,tests/test_source_imports.py checks=lint-policy-schema-tests,workspace-tooling-boundary,scaffold risk=high prerequisites=none -->

  **Task type**

  `contract-first`

  **Implements / proves**

  - Requirements: `REQ-LP-001`, `REQ-LP-003`, `REQ-TA-004`, `REQ-SC-003`,
    `REQ-SC-006`
  - Scenarios: missing disposition, missing fixture mapping, unapproved
    compatibility consumer
  - Invariants: `INV-TS7-04`, `INV-TS7-13`, `INV-TS7-19`,
    `INV-TS7-25`, `INV-TS7-26`
  - Decisions: `D1`, `D5`, `D10`, `D12`, `D13`
  - Authorities: `AUTH-LINT-POLICY-SCHEMA`,
    `AUTH-LINT-ENGINE-MAPPINGS-SCHEMA`,
    `AUTH-TOOLCHAIN-BOUNDARIES-SCHEMA`
  - Proofs: `PROP-LP-003`, `PROP-MAP-001`, `PROP-TS6-002`,
    `PROP-REV-001`, `PROP-MAINT-001`, `MUT-ARCH-003`

  **Change**

  Create the capability-oriented `packages/lint-config` package and closed
  schemas for the future engine-neutral policy manifest, per-engine mappings,
  and toolchain boundaries. The policy schema must require stable IDs, exact
  one-of disposition, role applicability, semantic options, blocking posture,
  and proof references without requiring a vendor identity. The mapping schema
  must key each legacy/replacement rule or parser mechanism to a stable policy
  ID and prohibit semantic-policy fields. Historical ESLint origin is bootstrap
  provenance in the legacy mapping/extractor, not permanent policy identity.
  The boundary schema must express compatibility-consumer, platform, and closed
  maintenance-class allowed/protected projections without package versions.

  Add `packages/lint-config` to the existing layer-0/build-tooling model so
  production source cannot import it. The package-retirement task must remove
  `packages/eslint-config` from the same authority later.

  **Does not own**

  Rule rows, mapping rows, version pins, generated engine configuration, or
  implementation behavior.

  **Affected paths**

  - `packages/lint-config/{package.json,README.md,policy.schema.json,engine-mappings.schema.json}`
  - `scripts/toolchain-boundaries.schema.json`
  - `scripts/workspace-model.mjs`
  - focused schema tests

  **Proof required**

  - positive minimal semantic-policy, mapping, and boundary documents validate;
  - unknown fields, missing/duplicate dispositions, malformed scope IDs, and
    missing proof references fail;
  - vendor rule IDs in semantic policy and semantic fields in engine mappings
    fail;
  - production import of `@secure-home/lint-config` fails the source-architecture
    gate;
  - scaffold/index rules pass for new files/package.

  **Size and atomicity**

  One focused day: schemas/package scaffold and their validators only. Both
  schemas land before any canonical instance or consumer.

  **Completion**

  Complete only when positive/negative schema tests pass and no functional lint
  or compiler path changed.

- [ ] **1.2 Extract and commit semantic policy plus legacy/replacement mappings**
  <!-- agent-task: 1.2 paths=packages/lint-config/src/extract-legacy-policy.mjs,packages/lint-config/policy.json,packages/lint-config/engine-mappings.json,packages/lint-config/tests/** checks=legacy-policy-bijection,mapping-referential-integrity risk=high prerequisites=1.1 -->

  **Task type**

  `contract-first | proof`

  **Implements / proves**

  - Requirement: `REQ-LP-001`
  - Scenarios: inherited rule omitted; current engine changes
  - Invariants: `INV-TS7-02`, `INV-TS7-19`, `INV-TS7-21`,
    `INV-TS7-25`
  - Decisions: `D1`, `D2`, `D13`
  - Authorities: `AUTH-LINT-POLICY`, `AUTH-LINT-ENGINE-MAPPINGS`,
    `AUTH-LEGACY-EXTRACTOR`, `AUTH-MEMBER-ROLES`
  - Proofs: `PROP-LP-001`, `PROP-MAP-001`, `MUT-LP-001`,
    `MUT-MAP-001`, `ADV-ROLE-002`

  **Change**

  Resolve every effective ESLint mode through the real ESLint API, normalize the
  resulting semantics, and commit the schema-valid canonical policy plus
  separate legacy/replacement mappings. Capture recommended-preset rules,
  explicit options, blocking severity, roles, config/JavaScript behavior,
  ignores, adapter-bin exception, and the exported-test-vs-consumer distinction.
  Assign every semantic row one allowed disposition and proof placeholder; keep
  vendor rule/parser identities and normalization only in mapping authority.

  **Does not own**

  New lint policy, engine defaults, package versions, or fixture semantics.

  **Affected paths**

  - `packages/lint-config/src/extract-legacy-policy.mjs`
  - `packages/lint-config/policy.json`
  - `packages/lint-config/engine-mappings.json`
  - policy extraction/drift tests

  **Proof required**

  - normalized extracted set bijects with manifest;
  - every mapping references exactly one stable policy ID and no policy row
    contains a vendor rule identity;
  - deleting or changing any current rule/role/ignore causes drift failure;
  - all current 117 identities and exact role behavior are accounted for;
  - no policy is classified `DROPPED`.

  **Size and atomicity**

  One focused day: extraction, committed baseline, and bijection tests. Stop if
  effective current config cannot be represented by the schema.

  **Completion**

  Complete only when the manifest is the declared single authority and the
  current ESLint config is a drift-checked legacy projection.

- [ ] **1.3 Implement policy, mapping, and source/fixture referential checks**
  <!-- agent-task: 1.3 paths=packages/lint-config/src/check-policy.mjs,packages/lint-config/tests/**,package.json,scripts/check.sh,.github/workflows/checks.yml checks=policy-integrity risk=high prerequisites=1.2 -->

  **Task type**

  `implementation | proof`

  **Implements / proves**

  - Requirements: `REQ-LP-001`, `REQ-LP-003`, `REQ-LP-005`,
    `REQ-SC-006`
  - Scenarios: missing disposition/mapping; implicit default
  - Invariants: `INV-TS7-16`, `INV-TS7-19`, `INV-TS7-24`,
    `INV-TS7-25`
  - Decisions: `D1`, `D4`, `D13`
  - Authorities: `AUTH-LINT-POLICY`, `AUTH-LINT-ENGINE-MAPPINGS`
  - Proofs: `PROP-LP-003`, `PROP-MAP-001`, `MUT-LP-004`,
    `MUT-MAP-001`

  **Change**

  Add a deterministic checker consumed by local aggregate and CI that validates
  schema, stable ID uniqueness, role references, blocking posture, exact one
  disposition, mapping support, fixture/proof references, and absence of orphan
  fixtures. Validate policy and mapping files independently before joining them.

  **Does not own**

  Engine execution or policy decisions.

  **Affected paths**

  - `packages/lint-config/src/check-policy.mjs`
  - package/root scripts and checks workflow invocation
  - checker tests

  **Proof required**

  Hostile documents for duplicate/missing IDs, unsupported disposition,
  warning-only active policy, unreferenced fixture, unknown role,
  implicit/default-only mapping, mapping without policy, and vendor identity in
  semantic policy all fail.

  **Size and atomicity**

  One focused day; checker and unconditional invocation land together.

  **Completion**

  Complete only when a policy manifest cannot be partially consumed.

- [ ] **1.4 Pin replacement engines and generate the explicit Oxlint config**
  <!-- agent-task: 1.4 paths=pnpm-workspace.yaml,pnpm-lock.yaml,package.json,packages/lint-config/src/render-oxlint.mjs,packages/lint-config/generated/oxlint.json,packages/lint-config/tests/** checks=frozen-install,config-drift risk=high prerequisites=1.2,1.3 -->

  **Task type**

  `implementation | proof`

  **Implements / proves**

  - Requirements: `REQ-TA-003`, `REQ-LP-002`, `REQ-LP-005`, `REQ-SC-001`,
    `REQ-SC-002`
  - Scenarios: global binary mismatch, default rule added, exact frozen install
  - Invariants: `INV-TS7-09`, `INV-TS7-11`, `INV-TS7-12`, `INV-TS7-16`
  - Decisions: `D3`, `D4`, `D9`
  - Authorities: `AUTH-ENGINE-PINS`, `AUTH-RESOLVED-GRAPH`,
    `AUTH-LINT-ENGINE-MAPPINGS`, `AUTH-LINT-CONFIG`,
    `AUTH-INSTALL-POLICY`
  - Proofs: `EX-INSTALL-001`, `PROP-LP-002`, `PROP-INSTALL-001`,
    `ADV-LP-001`, `MUT-INSTALL-001`, `MUT-INSTALL-002`

  **Change**

  Add exact audited catalog pins for Oxlint and tsgolint, update the frozen lock,
  and generate the Oxlint config from semantic policy joined with the selected
  engine mapping. Explicitly neutralize all engine categories/defaults, select
  required plugins and type-aware mode, keep type-check mode off, and normalize
  engine-specific options only in mapping authority with assigned fixtures
  (including `preserve-caught-error`).

  **Does not own**

  Policy rows, compiler authority, architecture direction, or formatting.

  **Affected paths**

  - `pnpm-workspace.yaml`, `pnpm-lock.yaml`, root/package manifests
  - `packages/lint-config/src/render-oxlint.mjs`
  - `packages/lint-config/generated/oxlint.json`
  - config/version/install tests

  **Proof required**

  - empty-tree frozen install under `onlyBuiltDependencies: []`;
  - no selected/transitive native package needs lifecycle approval;
  - workspace binaries report exact pins;
  - generated config byte drift fails;
  - adding a default/category or `typeCheck` fails.

  **Size and atomicity**

  One focused day: dependency graph, generator, generated config, and install/
  drift proof. Do not add an install-script exception.

  **Completion**

  Complete only when config loads under the exact engine and contains no policy
  not authorized by the manifest.

- [ ] **1.5 Build parser and syntax-correctness fixture shard**
  <!-- agent-task: 1.5 paths=packages/lint-config/tests/fixtures/parser-syntax/**,packages/lint-config/policy.json checks=parser-syntax-corpus risk=high prerequisites=1.3,1.4 -->

  **Task type**

  `proof`

  **Implements / proves**

  - Requirement: `REQ-LP-003`
  - Scenarios: parser diagnostic; intended-policy attribution
  - Invariants: `INV-TS7-02`, `INV-TS7-15`, `INV-TS7-19`
  - Decision: `D2`
  - Authority: `AUTH-LINT-CONFORMANCE`
  - Proofs: `EX-LP-001`, `EX-LP-002`, `ADV-LP-003`, `MUT-LP-003`

  **Change**

  Add bounded fixtures for parser/syntax policy, including the Oxlint parser-
  diagnostic replacements for duplicate arguments and octal syntax and the
  current syntax-error rule family. Bind each case to manifest policy IDs.

  **Does not own**

  Policy mapping, role assignment, or compiler diagnostics.

  **Affected paths**

  - `packages/lint-config/tests/fixtures/parser-syntax/**`
  - proof references in `AUTH-LINT-POLICY`

  **Proof required**

  Both engines reject each negative for the intended policy, valid controls
  pass, and parser failure counts only where declared as the replacement.

  **Size and atomicity**

  One focused day: one bounded parser/syntax family and its manifest mappings.

  **Completion**

  Complete only when no row in this assigned shard lacks executable evidence.

- [ ] **1.6 Build core control-flow and runtime-correctness fixture shard**
  <!-- agent-task: 1.6 paths=packages/lint-config/tests/fixtures/core-control/**,packages/lint-config/policy.json checks=core-control-corpus risk=high prerequisites=1.3,1.4 -->

  **Task type**

  `proof`

  **Implements / proves**

  - Requirement: `REQ-LP-003`
  - Scenarios: governed defect; semantic mismatch
  - Invariants: `INV-TS7-02`, `INV-TS7-15`, `INV-TS7-19`
  - Decision: `D2`
  - Authority: `AUTH-LINT-CONFORMANCE`
  - Proofs: `EX-LP-001`, `EX-LP-002`, `ADV-LP-002`, `ADV-LP-004`,
    `MUT-LP-003`

  **Change**

  Add the bounded core control-flow/runtime-correctness fixture family (branch,
  loop, exception/finally, regex, optional-chain, generator, and related
  existing core policies) with intended-rule attribution.

  **Does not own**

  Type-aware policy or new correctness rules.

  **Affected paths**

  - `packages/lint-config/tests/fixtures/core-control/**`
  - proof references in `AUTH-LINT-POLICY`

  **Proof required**

  Legacy and replacement accept/reject parity per assigned manifest row;
  unrelated parser/compiler failures do not count. Every active negative must
  produce a blocking command result rather than a warning-only diagnostic.

  **Size and atomicity**

  One focused day: a manifest-defined bounded semantic shard, not the whole
  core inventory.

  **Completion**

  Complete only when the shard's manifest set equals its proven cases.

- [ ] **1.7 Build core hygiene, restriction, and JavaScript-config fixture shard**
  <!-- agent-task: 1.7 paths=packages/lint-config/tests/fixtures/core-policy/**,packages/lint-config/policy.json checks=core-policy-corpus risk=high prerequisites=1.3,1.4 -->

  **Task type**

  `proof`

  **Implements / proves**

  - Requirements: `REQ-LP-003`, `REQ-LP-004`
  - Scenarios: negative fixture; JavaScript/config policy
  - Invariants: `INV-TS7-02`, `INV-TS7-15`, `INV-TS7-19`
  - Decisions: `D2`, `D4`
  - Authority: `AUTH-LINT-CONFORMANCE`
  - Proofs: `EX-LP-001`, `EX-LP-002`, `ADV-LP-003`, `MUT-LP-003`

  **Change**

  Add the bounded core unused/hygiene/restriction/modernization and additional
  JavaScript-config fixture family, including exact repository options and
  exemptions assigned by the manifest.

  **Does not own**

  Role globs, framework policy, or formatting.

  **Affected paths**

  - `packages/lint-config/tests/fixtures/core-policy/**`
  - proof references in `AUTH-LINT-POLICY`

  **Proof required**

  Valid and negative cases prove each assigned current core/JS policy and its
  relevant options under both engines. Warning-only mappings fail even when a
  diagnostic is present.

  **Size and atomicity**

  One focused day: one manifest-defined bounded semantic shard.

  **Completion**

  Complete only when no assigned row is unproven or orphaned.

- [ ] **1.8 Build TypeScript static-policy fixture shard**
  <!-- agent-task: 1.8 paths=packages/lint-config/tests/fixtures/typescript-static/**,packages/lint-config/policy.json checks=typescript-static-corpus risk=high prerequisites=1.3,1.4 -->

  **Task type**

  `proof`

  **Implements / proves**

  - Requirement: `REQ-LP-003`
  - Scenarios: rule registers but semantics differ
  - Invariants: `INV-TS7-02`, `INV-TS7-15`, `INV-TS7-19`
  - Decisions: `D2`, `D3`
  - Authority: `AUTH-LINT-CONFORMANCE`
  - Proofs: `EX-LP-001`, `EX-LP-002`, `ADV-LP-002`, `MUT-LP-003`

  **Change**

  Add fixtures for the current non-type-aware TypeScript-plugin policy: type
  import hygiene, suppressions, explicit-any, boundary types, namespaces,
  wrapper/function types, assertion syntax, and related manifest rows.

  **Does not own**

  Typed tsgolint policies or compiler diagnostics.

  **Affected paths**

  - `packages/lint-config/tests/fixtures/typescript-static/**`
  - proof references in `AUTH-LINT-POLICY`

  **Proof required**

  Each assigned row has valid/negative cases accepted/rejected by both engines
  for intended policy. Existing options that select fix output, including
  `consistent-type-imports.fixStyle`, have deterministic fixed-output golden
  cases rather than accept/reject evidence alone.

  **Size and atomicity**

  One focused day: the audited static TypeScript shard only.

  **Completion**

  Complete only when its manifest subset has complete executable parity.

- [ ] **1.9 Build typed promise/control-policy fixture shard**
  <!-- agent-task: 1.9 paths=packages/lint-config/tests/fixtures/typescript-typed-control/**,packages/lint-config/policy.json checks=typescript-typed-control-corpus risk=high prerequisites=1.3,1.4 -->

  **Task type**

  `proof`

  **Implements / proves**

  - Requirements: `REQ-LP-002`, `REQ-LP-003`
  - Scenarios: promise misuse; type-aware semantic mismatch
  - Invariants: `INV-TS7-02`, `INV-TS7-08`, `INV-TS7-15`, `INV-TS7-19`
  - Decisions: `D2`, `D3`
  - Authority: `AUTH-LINT-CONFORMANCE`
  - Proofs: `EX-LP-001`, `EX-LP-002`, `ADV-LP-002`, `MUT-LP-003`

  **Change**

  Add the bounded tsgolint promise/control/type-analysis fixture family,
  including floating/misused promises, await-thenable, require-await, implied
  eval, array iteration, throw/reject, and unbound-method policies assigned by
  the manifest.

  **Does not own**

  Unsafe-any propagation or compiler typecheck.

  **Affected paths**

  - `packages/lint-config/tests/fixtures/typescript-typed-control/**`
  - proof references in `AUTH-LINT-POLICY`

  **Proof required**

  Both engines run with type information and reject intended defects; a missing
  type-aware backend is a failure, not a skip.

  **Size and atomicity**

  One focused day: one bounded typed policy shard.

  **Completion**

  Complete only when each assigned type-aware row has attributed parity.

- [ ] **1.10 Build typed unsafe/data-policy fixture shard**
  <!-- agent-task: 1.10 paths=packages/lint-config/tests/fixtures/typescript-typed-unsafe/**,packages/lint-config/policy.json checks=typescript-typed-unsafe-corpus risk=high prerequisites=1.3,1.4 -->

  **Task type**

  `proof`

  **Implements / proves**

  - Requirements: `REQ-LP-002`, `REQ-LP-003`
  - Scenarios: unsafe any propagation; type-aware semantic mismatch
  - Invariants: `INV-TS7-02`, `INV-TS7-08`, `INV-TS7-15`, `INV-TS7-19`
  - Decisions: `D2`, `D3`
  - Authority: `AUTH-LINT-CONFORMANCE`
  - Proofs: `EX-LP-001`, `EX-LP-002`, `ADV-LP-002`, `MUT-LP-003`

  **Change**

  Add the bounded typed unsafe/data fixture family: unsafe assignment, argument,
  call, member access, return, enum/unary operations, base-to-string, duplicate/
  redundant constituents, unnecessary assertions, and restricted expression
  policies assigned by the manifest.

  **Does not own**

  Static TypeScript policy or compiler strictness.

  **Affected paths**

  - `packages/lint-config/tests/fixtures/typescript-typed-unsafe/**`
  - proof references in `AUTH-LINT-POLICY`

  **Proof required**

  Both type-aware engines reject each assigned negative for intended policy and
  accept valid controls.

  **Size and atomicity**

  One focused day: one bounded typed unsafe/data shard.

  **Completion**

  Complete only when the shard's manifest rows and evidence are complete.

- [ ] **1.11 Prove roles, exceptions, ignores, neutrality, and formatting separation**
  <!-- agent-task: 1.11 paths=packages/lint-config/tests/fixtures/roles/**,packages/lint-config/policy.json,packages/lint-config/tests/** checks=role-policy-corpus risk=high prerequisites=1.5,1.6,1.7,1.8,1.9,1.10 -->

  **Task type**

  `proof`

  **Implements / proves**

  - Requirement: `REQ-LP-004`
  - Scenarios: library process access, service access, adapter bin, framework
    rule, ignored fixture
  - Invariants: `INV-TS7-06`, `INV-TS7-21`, `INV-TS7-24`
  - Decisions: `D4`, `D8`, `D12`
  - Authorities: `AUTH-MEMBER-ROLES`, `AUTH-LINT-POLICY`,
    `AUTH-LINT-ENGINE-MAPPINGS`, `AUTH-LINT-CONFORMANCE`,
    `AUTH-FORMAT-POLICY`
  - Proofs: `EX-ROLE-001`, `ADV-ROLE-001`, `ADV-ROLE-002`,
    `MUT-ROLE-001`, `PROP-FMT-001`, `MUT-FMT-001`

  **Change**

  Build role/path fixtures and validators covering all current role assignments,
  the exported test role, actual test consumers, JavaScript/config behavior,
  process/console restrictions, adapter bin exception, ignore globs, framework
  neutrality, and absence of formatting policy.

  **Does not own**

  New role policy or framework-specific lint behavior.

  **Affected paths**

  - `packages/lint-config/tests/fixtures/roles/**`
  - role/neutrality tests and manifest proof references

  **Proof required**

  Narrow exceptions pass only where admitted; broadened globs, test-role
  misapplication, framework rules, stylistic rules, or warning-only active
  policies fail.

  **Size and atomicity**

  One focused day: role/neutrality proof as one coherent family after rule shards.

  **Completion**

  Complete only when role differences are behaviorally proven, not source-string
  asserted.

- [ ] **1.12 Add the dual-engine lint runner and stable entry-point checks**
  <!-- agent-task: 1.12 paths=packages/lint-config/src/run-lint.mjs,package.json,*/package.json,agents/adapters/coding/*/package.json,scripts/check.sh,.github/workflows/checks.yml,tests/** checks=dual-engine-entrypoints risk=high prerequisites=1.4,1.5,1.6,1.7,1.8,1.9,1.10,1.11 -->

  **Task type**

  `implementation | proof`

  **Implements / proves**

  - Requirements: `REQ-LP-002`, `REQ-LP-006`, `REQ-TA-002`
  - Scenarios: one engine skipped; stable commands
  - Invariants: `INV-TS7-07`, `INV-TS7-08`, `INV-TS7-20`
  - Decisions: `D2`, `D6`, `D12`
  - Authorities: `AUTH-LINT-POLICY`, `AUTH-LINT-CONFIG`,
    `AUTH-TS-ENTRYPOINTS`
  - Proofs: `EX-ENTRY-001`, `PROP-SEP-001`, `PROP-SEP-002`,
    `ADV-LP-004`, `MUT-ENTRY-001`

  **Change**

  Introduce the capability runner and update root/member wiring so `pnpm lint`
  executes legacy and replacement paths as separate blocking results, while
  `pnpm typecheck`, `pnpm build`, and `check:imports` remain independent.
  Preserve existing member-specific prerequisite commands such as `pnpm run
  deps`; preserve the JSON-only `packages/tsconfig` lint contract; and prohibit a
  member from bypassing the capability runner through direct standalone
  `tsgolint`.

  **Does not own**

  Policy content, compiler version, or ESLint retirement.

  **Affected paths**

  - lint runner/wrapper
  - root and member lint scripts/config projections as required
  - `scripts/check.sh`, `.github/workflows/checks.yml`
  - workflow/entry-point tests

  **Proof required**

  Mutating out either engine, architecture check, or typecheck fails structural
  and behavioral tests. Diagnostic aggregation must not turn one failure into
  success. Dropping a current pre-lint prerequisite, changing a blocking policy
  to warning-only, or invoking standalone `tsgolint` fails.

  **Size and atomicity**

  One focused day: runner and all entry-point projections land atomically.

  **Completion**

  Complete only when every current member remains covered and both engines block.

- [ ] **1.13 Establish and guard the TypeScript 6 compatibility seam**
  <!-- agent-task: 1.13 paths=pnpm-workspace.yaml,pnpm-lock.yaml,package.json,scripts/check-source-imports.mjs,scripts/toolchain-boundaries.json,scripts/check-toolchain-boundaries.mjs,tests/test_source_imports.py,tests/test_toolchain_boundaries.py,scripts/README.md checks=source-import-compatibility risk=high prerequisites=1.1 -->

  **Task type**

  `implementation | proof`

  **Implements / proves**

  - Requirements: `REQ-TA-001`, `REQ-TA-004`, `REQ-TC-003`, `REQ-SC-001`
  - Scenarios: admitted gate, unapproved import, unavailable parser, behavior
    drift
  - Invariants: `INV-TS7-03`, `INV-TS7-04`, `INV-TS7-05`, `INV-TS7-18`
  - Decisions: `D5`, `D7`, `D9`
  - Authorities: `AUTH-TS6-CONSUMERS`, `AUTH-ARCH-IMPORT-GATE`,
    `AUTH-ENGINE-PINS`, `AUTH-RESOLVED-GRAPH`
  - Proofs: `EX-ARCH-001`, `EX-TS6-001`, `PROP-TS6-001`, `PROP-TS6-002`,
    `ADV-TS6-001`, `ADV-TS6-002`, `MUT-TS6-001`, `MUT-TS6-002`

  **Change**

  Add the exact compatibility package and locked API identity, switch only
  `check-source-imports.mjs` to it, create the schema-valid boundary document
  with initial singleton allowlist/platform/maintenance-class set, and add a
  closed AST-based import and compiler-entry-point guard. Literal package
  imports are enumerated; any unmodeled/non-literal module-load form capable of
  resolving `@typescript/typescript6` fails closed rather than being ignored.

  **Does not own**

  Source architecture semantics, normal compiler authority, or permission for
  any additional consumer.

  **Affected paths**

  - catalog/lock/root manifest
  - source-import gate import only
  - boundary policy/checker/tests
  - source-import tether/docs

  **Proof required**

  All existing source-import behavior passes; a normal-TS7 import, unapproved
  compatibility import, ambiguous dynamic module load, or direct `tsc6`
  build/typecheck/generator command fails; actual compatibility API version is
  exact.

  **Size and atomicity**

  One focused day: package, singleton allowlist, import switch, guard, and
  regression corpus land together.

  **Completion**

  Complete only when the gate remains fail-closed and no compatibility spread is
  possible.

- [ ] **1.14 Add deterministic install and native platform proof**
  <!-- agent-task: 1.14 paths=scripts/toolchain-boundaries.json,scripts/check-toolchain-boundaries.mjs,.github/workflows/checks.yml,tests/test_toolchain_boundaries.py checks=amd64-arm64-toolchain-matrix risk=high prerequisites=1.4,1.12,1.13 -->

  **Task type**

  `proof | implementation`

  **Implements / proves**

  - Requirements: `REQ-SC-001`, `REQ-SC-002`, `REQ-SC-003`
  - Scenarios: frozen graph, only AMD64, native ARM64, missing optional package
  - Invariants: `INV-TS7-11`, `INV-TS7-12`, `INV-TS7-13`
  - Decisions: `D9`, `D10`
  - Authorities: `AUTH-PLATFORM-MATRIX`, `AUTH-INSTALL-POLICY`,
    `AUTH-RESOLVED-GRAPH`
  - Proofs: `EX-INSTALL-001`, `EX-PLAT-001`, `PROP-INSTALL-001`,
    `ADV-INSTALL-001`, `ADV-PLAT-001`, `MUT-PLAT-001`

  **Change**

  Add a checked workflow matrix projection on standard GitHub-hosted
  `ubuntu-24.04` and `ubuntu-24.04-arm`. Scope 1's command pack includes empty-
  tree frozen install, exact versions/native packages, legacy + replacement
  lint, current TypeScript 6 typecheck, compatibility-backed import gate, and
  focused/full tests as allocated.

  **Does not own**

  New self-hosted infrastructure, image builds, or platform policy beyond the
  canonical two-platform set.

  **Affected paths**

  - boundary policy/checker
  - `.github/workflows/checks.yml` and workflow tests

  **Proof required**

  Both native jobs execute all required commands. Removing/skipping ARM64,
  typed lint, or import checking fails projection/completion tests.

  **Size and atomicity**

  One focused day: policy projection, workflow, and tests. Hosted execution is
  required before completion.

  **Completion**

  Complete only with exact hosted run IDs/results for both architectures.

- [ ] **1.15 Prove predecessor-bound vulnerability-driven substitution**
  <!-- agent-task: 1.15 paths=packages/lint-config/engine-mappings.json,packages/lint-config/tests/**,scripts/toolchain-boundaries.json,scripts/check-toolchain-boundaries.mjs,tests/test_toolchain_boundaries.py,packages/lint-config/README.md,scripts/README.md checks=engine-substitution-conformance,maintenance-predecessor-continuity risk=high prerequisites=1.3,1.4,1.5,1.6,1.7,1.8,1.9,1.10,1.11,1.14 -->

  **Task type**

  `proof | documentation`

  **Implements / proves**

  - Requirements: `REQ-TA-001`, `REQ-TA-003`, `REQ-SC-004`,
    `REQ-SC-005`, `REQ-SC-006`
  - Scenarios: advisory replacement; patch upgrade; policy loss; row/fixture
    co-deletion; compiler-policy relaxation; unknown predecessor
  - Invariants: `INV-TS7-01`, `INV-TS7-09`, `INV-TS7-10`,
    `INV-TS7-23`, `INV-TS7-24`, `INV-TS7-25`, `INV-TS7-26`
  - Decisions: `D1`, `D3`, `D5`, `D9`, `D13`
  - Authorities: `AUTH-LINT-POLICY`, `AUTH-LINT-CONFORMANCE`,
    `AUTH-LINT-ENGINE-MAPPINGS`, `AUTH-ENGINE-PINS`,
    `AUTH-TS-CONFIGS`, `AUTH-TS-CONFORMANCE`, `AUTH-MAINTENANCE-CLASSES`,
    `AUTH-PLATFORM-MATRIX`
  - Proofs: `EX-MAINT-001`, `PROP-MAP-001`, `PROP-MAINT-001`,
    `ADV-CVE-001`, `ADV-MAINT-001`, `MUT-CVE-001`, `MUT-MAP-001`,
    `MUT-MAINT-001`, `MUT-MAINT-002`, `MUT-MAINT-003`

  **Change**

  Add a testable maintenance classifier and engine-adapter substitution path.
  Scope 1 creates the genesis maintenance class under the ordinary full
  dual-engine/review/platform proof; it must not classify PR-B itself as
  maintenance.

  The checker resolves one exact trusted predecessor through the repository/CI
  boundary, loads the closed class/checker contract from the predecessor,
  permits only its implementation-specific projections, and requires every
  protected semantic/config/corpus/harness projection to match. Candidate edits
  cannot widen their own class. Lockfile change is restricted to the selected
  package roots and their deterministically derived transitive closure. Missing
  base, unreadable diff, malformed class, unrelated graph movement, or
  unexpected protected drift fails closed.

  Document runtime dependency vs PR-byte parser vs local-only utility
  classification. Exercise changed engine and compatibility mappings/pins
  against unchanged protected authorities, and a later exact normal TypeScript
  pin against unchanged compiler-policy/conformance authority.

  **Does not own**

  Response SLAs, merge-time freshness policy, or permission to delete policy
  during an emergency.

  **Affected paths**

  - conformance/substitution and two-revision Git tests
  - toolchain boundary policy/checker
  - lint/tooling documentation

  **Proof required**

  - an admitted pin/mapping-only change passes against the exact predecessor;
  - deleting a policy row and its only fixture together fails;
  - changing a TypeScript pin while relaxing shared tsconfig or its negative
    fixture fails;
  - changing platform, install, format, architecture, or TS6-consumer authority
    under maintenance fails;
  - widening the candidate's maintenance class/checker or changing an unrelated
    lockfile importer/package fails;
  - missing/malformed/unreadable predecessor identity fails closed; and
  - version changes rerun frozen install and native matrix rather than trusting
    registration.

  **Size and atomicity**

  One focused day: closed maintenance table, predecessor checker, two-revision
  mutations, substitution seam, and operator documentation.

  **Completion**

  Complete only when the answer to “what proves replacement Y?” is one
  predecessor-bound executable command/corpus, not candidate-local prose or
  self-consistency.

## PR-B Verification Net

- [ ] **2.1 Policy completeness and authority proof**
  <!-- agent-task: 2.1 paths=packages/lint-config/** checks=policy-schema,mapping-schema,bijection,config-drift risk=high prerequisites=1.1,1.2,1.3,1.4 -->

  **Proves**

  - `PROP-LP-001/002/003`, `PROP-MAP-001`,
    `MUT-LP-001/004`, `MUT-MAP-001`

- [ ] **2.2 Complete dual-engine parity corpus**
  <!-- agent-task: 2.2 paths=packages/lint-config/tests/** checks=legacy-and-replacement-parity risk=high prerequisites=1.5,1.6,1.7,1.8,1.9,1.10,1.11,1.12 -->

  **Proves**

  - `EX-LP-001/002`, `EX-ROLE-001`, `ADV-LP-002/003`,
    `ADV-ROLE-001`, `ADV-ROLE-002`, `MUT-LP-003`, `MUT-ROLE-001`

- [ ] **2.3 Compatibility and authority-separation proof**
  <!-- agent-task: 2.3 paths=scripts/check-source-imports.mjs,scripts/toolchain-boundaries*,tests/**,scripts/check.sh,.github/workflows/checks.yml checks=compatibility-import,separate-gates risk=high prerequisites=1.12,1.13 -->

  **Proves**

  - `EX-ARCH-001`, `EX-TS6-001`, `PROP-TS6-001`, `PROP-TS6-002`,
    `PROP-SEP-001`, `PROP-SEP-002`, `MUT-ARCH-002`, `MUT-ENTRY-001`

- [ ] **2.4 Supply-chain and native platform proof**
  <!-- agent-task: 2.4 paths=pnpm-workspace.yaml,pnpm-lock.yaml,.github/workflows/checks.yml,tests/** checks=frozen-install,amd64-arm64 risk=high prerequisites=1.14 -->

  **Proves**

  - `EX-INSTALL-001`, `EX-PLAT-001`, `PROP-INSTALL-001`,
    `ADV-INSTALL-001`, `ADV-PLAT-001`, `MUT-INSTALL-001`, `MUT-INSTALL-002`,
    `MUT-PLAT-001`

- [ ] **2.5 Predecessor-bound maintenance transition proof**
  <!-- agent-task: 2.5 paths=scripts/toolchain-boundaries.json,scripts/check-toolchain-boundaries.mjs,packages/lint-config/**,packages/tsconfig/tests/**,tests/test_toolchain_boundaries.py checks=maintenance-predecessor-continuity risk=high prerequisites=1.15,2.1,2.2,2.3,2.4 -->

  **Proves**

  - `EX-MAINT-001`, `PROP-MAINT-001`, `ADV-MAINT-001`,
    `MUT-MAINT-001/002/003`, `MUT-CVE-001`

- [ ] **2.6 Scope 1 full gate and frozen-head review**
  <!-- agent-task: 2.6 paths=repository checks=bash-scripts-check,strict-openspec,hosted-checks risk=high prerequisites=2.5 -->

  **Proves**

  - all PR-B requirements/invariants/proofs and implementation-review completion

## PR-B Completion Gate

- [ ] Every PR-B task and proof is complete.
- [ ] Manifest bijects with complete effective legacy policy.
- [ ] Every policy row has one disposition and executable evidence.
- [ ] Semantic policy is engine-neutral; per-engine mappings are separate and
      referentially complete.
- [ ] Both engines pass valid cases and reject intended negative cases.
- [ ] Active policies remain blocking; fix-bearing option semantics have golden
      output evidence.
- [ ] TypeScript remains 6.0.3 authoritative.
- [ ] ESLint remains installed and blocking.
- [ ] Source-import gate behavior is unchanged through bounded TS6 API.
- [ ] `onlyBuiltDependencies: []` is unchanged.
- [ ] Native AMD64 and ARM64 command packs pass.
- [ ] An admitted pin/mapping-only maintenance candidate passes against a trusted
      predecessor.
- [ ] Row-plus-fixture deletion, compiler-policy relaxation, protected-authority
      drift, and unknown predecessor mutations fail closed.
- [ ] Required mutations are killed.
- [ ] Full deterministic repository gates pass.
- [ ] Implementation review completed against one frozen head.

---

# PR-C — Scope 2: TypeScript 7 cutover / ESLint retirement

<!-- review-scope: typescript7-cutover -->

## Completion Definition

PR-C is complete only when PR-B is merged/accepted, a fresh Scope 2 review epoch
is valid, the then-current repository passes the complete TS7 audit, TypeScript
7.0.2 is the sole normal compiler, every lint entry point consumes the canonical
replacement policy, ESLint is removed without residue, the compatibility seam
remains bounded, and native Linux AMD64/ARM64 full command packs pass.

## 3. Cutover tasks

- [ ] **3.1 Repeat and freeze the complete TS7 compatibility audit**
  <!-- agent-task: 3.1 paths=packages/tsconfig/**,**/tsconfig*.json,**/package.json,scripts/**,tests/** checks=ts7-compatibility-inventory risk=high prerequisites=PR-B-merged,scope2-review-epoch -->

  **Task type**

  `proof | contract-first`

  **Implements / proves**

  - Requirement: `REQ-TC-001`
  - Scenarios: missed tsconfig; absent removed option; CLI-output consumer
  - Invariants: `INV-TS7-01`, `INV-TS7-05`, `INV-TS7-17`
  - Decisions: `D5`, `D11`
  - Authorities: `AUTH-TS-CONFIGS`, `AUTH-TS-ENTRYPOINTS`, `AUTH-TS-PINS`
  - Proofs: `ADV-TC-001`, `ADV-TC-002`

  **Change**

  Regenerate tracked tsconfig, compiler command, generator, direct API, and
  option-consumer inventory against current main; run TS7 showConfig, typecheck,
  build, generator, and existing compiler fixture probes in a controlled branch.
  Assign only actual incompatibilities. Add TS7-language fixtures containing
  governed import edges and prove the TS6 parser either extracts them
  equivalently or fails closed.

  **Does not own**

  Hypothetical migrations or lint-engine changes.

  **Affected paths**

  - audit tests/evidence only initially; actual fixes limited to discovered paths

  **Proof required**

  Inventory completeness mutation; all used configs/commands exercised; actual
  findings have regression tests; a TS7-accepted forbidden import edge cannot
  disappear through TS6 parser recovery.

  **Size and atomicity**

  One focused day for audit and bounded actual findings. Stop/replan if findings
  require an authority change.

  **Completion**

  Complete only when no used compiler surface is untested.

- [ ] **3.2 Cut the authoritative compiler to TypeScript 7.0.2**
  <!-- agent-task: 3.2 paths=pnpm-workspace.yaml,pnpm-lock.yaml,package.json,**/package.json,packages/tsconfig/**,tests/** checks=ts7-typecheck-build-version risk=high prerequisites=3.1 -->

  **Task type**

  `implementation | proof`

  **Implements / proves**

  - Requirements: `REQ-TA-001`, `REQ-TC-002`, `REQ-SC-001`
  - Scenarios: Scope 2 authority; full typecheck/build; wrong compiler copy
  - Invariants: `INV-TS7-01`, `INV-TS7-07`, `INV-TS7-11`, `INV-TS7-18`
  - Decisions: `D5`, `D6`, `D9`
  - Authorities: `AUTH-TS-PINS`, `AUTH-RESOLVED-GRAPH`,
    `AUTH-TS-CONFIGS`, `AUTH-TS-ENTRYPOINTS`
  - Proofs: `EX-TS-001`, `MUT-TS-001`, `MUT-INSTALL-001`

  **Change**

  Update the catalog and frozen graph to TypeScript 7.0.2; apply only audit-
  proven config/command fixes; strengthen version identity tests across every
  member compiler entry point.

  **Does not own**

  Lint policy, TS6 API allowlist, or architecture semantics.

  **Affected paths**

  - catalog/lock and actual incompatible compiler/config/test paths

  **Proof required**

  `pnpm typecheck`, `pnpm build`, generators, tsconfig fixtures, and version
  identity all pass with normal compiler 7.0.2.

  **Size and atomicity**

  One focused day if audit found only bounded fixes. If not, stop and split via
  focused planning correction rather than partial cutover.

  **Completion**

  Complete only when no ordinary command resolves TS6 or unstable TS7 APIs.

- [ ] **3.3 Move every lint entry point to the capability package**
  <!-- agent-task: 3.3 paths=package.json,agents/**/package.json,apps/**/package.json,packages/**/package.json,services/**/package.json,**/eslint.config.js,packages/lint-config/**,tests/** checks=replacement-entrypoints risk=high prerequisites=3.2 -->

  **Task type**

  `implementation | proof`

  **Implements / proves**

  - Requirements: `REQ-LP-004`, `REQ-LP-006`, `REQ-TC-004`
  - Scenarios: retirement complete; stable commands; independent typecheck
  - Invariants: `INV-TS7-06`, `INV-TS7-07`, `INV-TS7-20`, `INV-TS7-21`
  - Decisions: `D6`, `D8`, `D12`
  - Authorities: `AUTH-LINT-POLICY`, `AUTH-LINT-CONFIG`,
    `AUTH-MEMBER-ROLES`, `AUTH-TS-ENTRYPOINTS`
  - Proofs: `EX-ENTRY-001`, `EX-ROLE-001`, `PROP-SEP-001`,
    `MUT-ENTRY-001`

  **Change**

  Update every member and root lint entry point/config projection to use the
  capability package and replacement engine only, preserving all roles,
  exceptions, ignores, framework neutrality, and formatting separation.

  **Does not own**

  Policy expansion or compiler typechecking.

  **Affected paths**

  - all member/root lint scripts and obsolete config projections
  - capability runner/config/tests

  **Proof required**

  Complete member inventory; no unlinted member; role corpus and stable command
  tests pass; `--type-check` remains non-authoritative/off.

  **Size and atomicity**

  One focused day: all entry-point projections land together.

  **Completion**

  Complete only when `pnpm lint` covers every current member through one policy
  authority.

- [ ] **3.4 Remove the legacy ESLint implementation atomically**
  <!-- agent-task: 3.4 paths=pnpm-workspace.yaml,pnpm-lock.yaml,packages/eslint-config/**,scripts/workspace-model.mjs,**/eslint.config.js,**/package.json,tests/**,docs/** checks=no-eslint-residue,workspace-tooling-boundary risk=high prerequisites=3.3 -->

  **Task type**

  `implementation | proof | documentation`

  **Implements / proves**

  - Requirement: `REQ-LP-006`
  - Scenarios: one policy lacks parity; retirement complete
  - Invariants: `INV-TS7-02`, `INV-TS7-08`, `INV-TS7-20`
  - Decisions: `D2`, `D11`, `D12`
  - Authorities: `AUTH-ENGINE-PINS`, `AUTH-RESOLVED-GRAPH`,
    `AUTH-LINT-POLICY`
  - Proofs: `MUT-LP-002`, `MUT-LP-005`, `MUT-CVE-001`

  **Change**

  Remove `eslint`, `@eslint/js`, `typescript-eslint`, `globals`, the legacy
  config package, imports, lock entries, and legacy-only tests/extractor. Preserve
  the policy manifest, separate replacement mapping, replacement config,
  fixtures, roles, and predecessor-bound engine-substitution conformance. Remove
  `packages/eslint-config` from the canonical workspace layer/build-tooling sets
  while keeping `packages/lint-config` classified there.

  **Does not own**

  Deleting or reclassifying policy; compatibility package retirement.

  **Affected paths**

  - exact legacy package/config/member residue
  - catalog/lock/docs/tests

  **Proof required**

  Repository-wide package/import/path/layer scan finds no legacy residue;
  complete corpus still passes; deliberate orphan residue is caught; production
  import of the surviving lint policy package remains forbidden.

  **Size and atomicity**

  One focused day: removal and all projections/tests are one atomic seam.

  **Completion**

  Complete only after PR-B parity evidence is re-proven on the cutover tree.

- [ ] **3.5 Re-prove the bounded architecture compatibility seam under TS7**
  <!-- agent-task: 3.5 paths=scripts/check-source-imports.mjs,scripts/toolchain-boundaries.json,scripts/check-toolchain-boundaries.mjs,tests/test_source_imports.py,tests/test_toolchain_boundaries.py checks=ts7-source-import-gate risk=high prerequisites=3.2,3.4 -->

  **Task type**

  `proof`

  **Implements / proves**

  - Requirements: `REQ-TA-004`, `REQ-TC-003`, `REQ-TC-004`
  - Scenarios: TS7 lacks API; invalid syntax; drift; type-check separation
  - Invariants: `INV-TS7-03`, `INV-TS7-04`, `INV-TS7-05`, `INV-TS7-14`
  - Decisions: `D5`, `D6`, `D7`
  - Authorities: `AUTH-TS6-CONSUMERS`, `AUTH-ARCH-IMPORT-GATE`,
    `AUTH-TS-ENTRYPOINTS`
  - Proofs: `EX-ARCH-001`, `PROP-TS6-001`, `PROP-TS6-002`, `PROP-SEP-002`,
    `ADV-TC-002`, `MUT-ARCH-001`, `MUT-ARCH-002`, `MUT-TS6-001`

  **Change**

  Re-run the full source-import corpus under normal TS7 plus the exact TS6 API
  seam; verify singleton imports and absence of `tsc6` commands. Include the
  TS7-language/TS6-parser differential fixtures from task 3.1.

  **Does not own**

  Architecture rule changes or new consumers.

  **Affected paths**

  - compatibility boundary/gate tests; implementation path changes only if audit
    proves required

  **Proof required**

  Current positive/negative/hostile/mutation source-import suite; API import
  mutation; TS7-accepted forbidden-edge parser-recovery mutation; independent
  workflow/check invocation.

  **Size and atomicity**

  One focused day for re-proof and bounded fixes only.

  **Completion**

  Complete only when TypeScript 7 cannot bypass or replace the architecture gate.

- [ ] **3.6 Run the native Scope 2 platform and supply-chain matrix**
  <!-- agent-task: 3.6 paths=.github/workflows/checks.yml,scripts/toolchain-boundaries.json,tests/test_toolchain_boundaries.py checks=ts7-amd64-arm64-full-matrix risk=high prerequisites=3.2,3.3,3.4,3.5 -->

  **Task type**

  `proof`

  **Implements / proves**

  - Requirements: `REQ-SC-001`, `REQ-SC-002`, `REQ-SC-003`, `REQ-TC-005`
  - Scenarios: cutover platform failure; native ARM64; missing package
  - Invariants: `INV-TS7-11`, `INV-TS7-12`, `INV-TS7-13`
  - Decisions: `D9`, `D10`, `D11`
  - Authorities: `AUTH-PLATFORM-MATRIX`, `AUTH-INSTALL-POLICY`,
    `AUTH-RESOLVED-GRAPH`
  - Proofs: `EX-INSTALL-001`, `EX-PLAT-001`, `MUT-INSTALL-002`,
    `MUT-PLAT-001`

  **Change**

  Execute the Scope 2 command pack natively on GitHub-hosted AMD64 and ARM64:
  empty-tree frozen install, exact versions/native packages, replacement lint,
  TypeScript 7 typecheck/build, compatibility-backed architecture gate, and full
  repository tests.

  **Does not own**

  Platform expansion or self-hosted infrastructure.

  **Affected paths**

  - workflow projection/tests only if Scope 2 command pack changes

  **Proof required**

  Exact run IDs, runner architecture evidence, commands, and results for both
  rows. Metadata alone is insufficient.

  **Size and atomicity**

  One focused day including hosted reruns/correction of cutover-attributable
  failures.

  **Completion**

  Complete only when both native rows are green.

- [ ] **3.7 Reconcile documentation and security-maintenance procedure**
  <!-- agent-task: 3.7 paths=packages/lint-config/README.md,packages/tsconfig/README.md,scripts/README.md,CONTRIBUTING.md,docs/**,tests/** checks=documented-authority-drift risk=medium prerequisites=3.4,3.6 -->

  **Task type**

  `documentation | proof`

  **Implements / proves**

  - Requirements: `REQ-TA-003`, `REQ-SC-004`, `REQ-SC-005`
  - Scenarios: security replacement and policy-loss refusal
  - Invariants: `INV-TS7-09`, `INV-TS7-10`, `INV-TS7-23`, `INV-TS7-24`
  - Decisions: `D1`, `D12`
  - Authorities: references to accepted ADR and executable authorities only
  - Proof: `ADV-CVE-001`

  **Change**

  Update developer documentation to state the final authority topology,
  compatibility seam, version-update proof, platform commands, and rollback.
  Any portable knowledge update is a generated/reviewed projection of accepted
  canonical sources, not a new original.

  **Does not own**

  Policy values, SLA, or engine identity as architecture.

  **Affected paths**

  - capability/config/tooling docs and required index/projection checks

  **Proof required**

  Documentation references current commands/paths; no stale ESLint authority;
  canonical authority and projection boundaries stated.

  **Size and atomicity**

  One focused day after final paths are stable.

  **Completion**

  Complete only when docs cannot be read as making Oxlint authoritative.

## PR-C Verification Net

- [ ] **4.1 Compiler and config compatibility proof**
  <!-- agent-task: 4.1 paths=packages/tsconfig/**,**/tsconfig*.json,**/package.json,tests/** checks=ts7-showconfig-typecheck-build-generators risk=high prerequisites=3.1,3.2 -->

  **Proves**

  - `EX-TS-001`, `ADV-TC-001`, `MUT-TS-001`

- [ ] **4.2 Replacement-only lint and retirement proof**
  <!-- agent-task: 4.2 paths=packages/lint-config/**,pnpm-workspace.yaml,pnpm-lock.yaml,**/package.json,tests/** checks=full-policy,no-eslint-residue risk=high prerequisites=3.3,3.4 -->

  **Proves**

  - all PR-B parity properties remain; `MUT-LP-002/003/005`,
    `MUT-CVE-001`, `MUT-ROLE-001`, `MUT-FMT-001`

- [ ] **4.3 Compatibility and separation proof**
  <!-- agent-task: 4.3 paths=scripts/**,tests/**,scripts/check.sh,.github/workflows/checks.yml checks=source-import,independent-gates risk=high prerequisites=3.5 -->

  **Proves**

  - `EX-ARCH-001`, `PROP-TS6-001`, `PROP-TS6-002`, `PROP-SEP-001`, `PROP-SEP-002`,
    `MUT-ARCH-001`, `MUT-ARCH-002`, `MUT-SEP-001`, `MUT-ENTRY-001`

- [ ] **4.4 Native cutover proof**
  <!-- agent-task: 4.4 paths=.github/workflows/checks.yml,scripts/toolchain-boundaries.json,tests/** checks=amd64-arm64-full risk=high prerequisites=3.6 -->

  **Proves**

  - `EX-INSTALL-001`, `EX-PLAT-001`, `MUT-INSTALL-001`, `MUT-INSTALL-002`,
    `MUT-PLAT-001`

- [ ] **4.5 Scope 2 full gate and frozen-head review**
  <!-- agent-task: 4.5 paths=repository checks=bash-scripts-check,strict-openspec,hosted-checks risk=high prerequisites=3.7,4.1,4.2,4.3,4.4 -->

  **Proves**

  - all PR-C requirements/invariants/proofs and implementation-review completion

## PR-C Completion Gate

- [ ] PR-B is merged and its authority/conformance artifacts remain intact.
- [ ] A fresh review epoch covers `typescript7-cutover`.
- [ ] Every tracked compiler/config/entry point is audited on current main.
- [ ] Normal `typescript` reports exactly 7.0.2 everywhere.
- [ ] `pnpm typecheck` remains independent `tsc --noEmit` behavior.
- [ ] `pnpm lint` enforces the complete manifest through Oxlint + tsgolint.
- [ ] No ESLint package, config, import, script, lock entry, or test remains.
- [ ] Source-import architecture behavior is unchanged through bounded TS6 API.
- [ ] TS7-accepted syntax cannot hide a governed import edge from the TS6 parser
      seam.
- [ ] `onlyBuiltDependencies: []` remains.
- [ ] Native AMD64 and ARM64 full command packs pass.
- [ ] Predecessor-bound maintenance proofs remain intact after ESLint retirement.
- [ ] Required mutations are killed.
- [ ] Full deterministic repository gates pass.
- [ ] Implementation review completed against one frozen head.

---

## Review scopes

This file owns exactly two implementation scopes:

- `replacement-authority-parity` — PR-B;
- `typescript7-cutover` — PR-C.

An epoch number is not a scope ordinal. Base movement may require another epoch
for the same scope. The current review file targets
`replacement-authority-parity`, records focused closure against the original
planning commit, and must be replaced by a fresh independent epoch-1 review of
the corrected planning bytes.

## Program stopping rules

Stop and return to architecture review only when closure requires changing an
invariant, authority allocation, trust boundary, prerequisite, or external
identity/ownership model. Implementation defects inside allocated schemas,
generators, mappings, fixtures, commands, or platform projections are P2/P3 and
must receive executable regression evidence in their owning scope.

Do not begin PR-B or PR-C under this task contract.
