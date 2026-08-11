# Implementation Tasks: runner-core

## Contract

Implementation is governed by:

- `proposal.md`
- `specs/runner-authority/spec.md`
- `specs/runner-path-decisions/spec.md`
- `specs/runner-workspace-observation/spec.md`
- `specs/runner-evidence-derivation/spec.md`
- `design.md`
- `assurance.md`

plus the inherited canonical contract `openspec/specs/runner-adoption/spec.md`
and the archived `runner-baseline-adoption` L3 decomposition.

Task completion does not redefine the specification, architecture, or
assurance model.

Check alias used in task metadata: `repo-check` = `bash scripts/check.sh`
(scaffold validation, secret scan, knowledge registry, workspace and
source-import direction, lint, typecheck, tests, build, and the Python
boundary). Every proof this change introduces is a **package-level test** under
`packages/runner-core/**`, reached by the existing aggregate gate. No task
names an undeclared check, and no task modifies a script outside #52's
authorized paths.

Path authority for this change, from #52:

- `packages/runner-core/**`
- `packages/README.md`
- `scripts/workspace-model.mjs`
- `pnpm-workspace.yaml`
- `pnpm-lock.yaml`
- `openspec/changes/runner-core/**` (this change's own artifacts)

Anything else is out of scope. If L2's public API proves insufficient during
implementation, **stop and report the contract gap** — do not modify
`packages/contracts` or `packages/events` inside this landing.

**Recorded deviation (owner-authorized 2026-08-10).** L2's C-EX-004
inertness test hard-codes its consumer allowlist, so the authorized
arrival of this landing's package fails it — the ratified "inert
contract × first consumer arrives" transition. The stop-and-report rule
above was followed; the owner authorized a **one-line allowlist
amendment** to `packages/contracts/src/conformance/inertness.test.ts`
(adding `packages/runner-core`) inside this PR, under #51 and #52
jointly, disclosed here and in the PR for the seam review. No other
contracts/events file is touched, and any importer beyond the
authorized consumer still fails the test.

---

## Implementation Authorization

This section RECORDS external authorization. It can never create it.

### External authority

| Field | Value |
|---|---|
| Source type | `github_issue` |
| Source id / link | pulse-ops-ai/secure-home-agent-platform#52 |
| Authorized scope | Landing L3 — the trusted `packages/runner-core`: enforced dependency direction; authority capture and eligibility; path policy, protected context, and bounds; workspace observation and reconciliation; evidence catalog and independent verifier — with the full proof net landing alongside |
| Constraints | inert on landing; framework-neutral; no `services/**`, `apps/**`, provider adapter, Home Assistant client, OpenFGA client, or database client import; no U2/U4/U6 decision; no container, network, or resource behavior; no modification of `packages/contracts` or `packages/events` |
| Owner | repository owner (@mikegtech) |
| Recorded at | 2026-08-09 |

### Status

**`AUTHORIZED`** — recorded 2026-08-10:

- The original trust-critical questions (Q1–Q4) were closed by the delta
  review of 2026-08-10 — Q1/Q2 by direction into the L2
  `runner-contract-corrections` change, Q3 confirmed, Q4 by removing
  L3-owned I/O ports (design D3/D4).
- The prerequisite correction is fully landed: planning PR #64,
  implementation PR #65 (`path-policy` 2.0.0 typed rules;
  `evidence-bundle` 2.0.0 required per-contract authority identities),
  canonical-spec sync PR #66. This seam was rebased and reconciled
  against it.
- The **final focused review** approved the reconciled seam at head
  `2c10a634345bc378962a689118083090306ea2ef` (reviewer, 2026-08-10:
  "the earlier blockers are now genuinely closed, not just planned …
  task 0.1 can record this review and flip NOT_AUTHORIZED → AUTHORIZED
  with no other planning changes"; review posted on PR #62). The owner
  approved and merged the planning seam (PR #62, squash `3ba26b5`).
- `openspec validate runner-core --strict` ran successfully on the
  reviewed head; CI green on the same exact head.

Implementation proceeds on this change against the frozen artifacts; any
further planning change requires a new review before continuing.

Status derivation rules (inherited):

- Missing, ambiguous, or unverifiable provenance ⇒ `NOT_AUTHORIZED`.
- Authority narrower than the landing scope ⇒ `NOT_AUTHORIZED` for the
  uncovered work.
- Assurance completeness is necessary but never sufficient.
- An unresolved trust-critical question ⇒ `NOT_AUTHORIZED` regardless of
  recorded authority.
- This landing is ungated by U-decisions (it depends on none of U1–U11).

**While the status is `NOT_AUTHORIZED`, no implementation task below may
begin.**

---

## Landing Plan

One PR. L3 is a single atomic seam: the trusted core and its proof net land
together, because a core whose guarantees are unproven is not a trusted core.

Verification ships with the mechanism it protects — task groups 2 through 6
each carry their own fixtures and properties. Group 7 adds only the
cross-cutting net that requires the whole tree to exist.

---

# PR-1 — Trusted runner-core

## Completion Definition

The landing is complete when:

- every task below is done with its declared proof green;
- the full proof net in `assurance.md` runs in the aggregate gate;
- every mutation target is killed by its named test;
- the package is inert — no importer, no module-load side effect;
- `repo-check` is green with nothing skipped;
- no file outside the declared path authority is modified.

## 0. Post-review authorization

- [x] **0.1 Flip authorization on planning-review approval**
  <!-- agent-task: 0.1 paths=openspec/changes/runner-core/tasks.md checks=repo-check risk=low prerequisites=none -->

  **Implements**

  - The review gate of the ratified standing model.

  **Change**

  On the focused delta review approving the reconciled artifact set, with the
  `runner-contract-corrections` change landed and strict validation run:
  record the approval and flip the Status above from `NOT_AUTHORIZED` to
  `AUTHORIZED`, citing the review, the landed correction, and the validation
  run.

  This task changes **only** the Status block of this file. It changes no
  design, spec, or assurance content. Any planning correction happens *before*
  this task, as its own edit, reviewed on its own terms.

  **Proof required**

  - `repo-check` green.

  **Completion**

  Status reads `AUTHORIZED`, citing the focused delta review, the landed
  `runner-contract-corrections` change, and the strict validation run. Tasks
  1.1 onward may begin; not before.

## 1. Package registration and architecture guards

- [x] **1.1 Register the workspace member**
  <!-- agent-task: 1.1 paths=packages/runner-core/**,pnpm-workspace.yaml,pnpm-lock.yaml,scripts/workspace-model.mjs,packages/README.md checks=repo-check risk=medium prerequisites=0.1 -->

  **Implements** — Design D1.

  **Change** — Create `packages/runner-core` with the standard build template
  (`tsconfig.json` extending `@secure-home/tsconfig/test`,
  `tsconfig.build.json` extending `.../library`, `eslint.config.js`,
  `vitest.config.ts`, README). Add `'packages/runner-core': 3` to `LAYERS`.
  Declare `@secure-home/contracts` and `@secure-home/events` as `workspace:*`
  runtime dependencies. Add the package to the `packages/README.md` layout
  table.

  **Proof required** — `repo-check` green; both direction checks accept the two
  inward edges and nothing else.

  **Completion** — Frozen install, lint, typecheck, and build pass on an empty
  package.

- [x] **1.2 Dependency-direction negative proof**
  <!-- agent-task: 1.2 paths=packages/runner-core/** checks=repo-check risk=high prerequisites=1.1 -->

  **Implements** — INV-001; `runner-adoption` "Trusted core is extraction-ready".

  **Proof required** — `EX-001`: a test proving that a `services/*` or `apps/*`
  import in this package is rejected by the direction checks. The negative case
  must be demonstrated to fail without the guard, not merely asserted.

- [x] **1.3 Dependency allowlist and I/O guards**
  <!-- agent-task: 1.3 paths=packages/runner-core/** checks=repo-check risk=high prerequisites=1.1 -->

  **Implements** — Design D2, D3; RC-INV-01, RC-INV-04.

  **Proof required** — `RC-EX-01` (runtime dependency set is exactly the two
  workspace packages; adding one fails); `RC-EX-04` (no `node:fs`,
  `node:child_process`, `node:net`, `node:http(s)`, or `node:dgram` import
  anywhere in `src/**`).

- [x] **1.4 Result algebra and refusal vocabulary**
  <!-- agent-task: 1.4 paths=packages/runner-core/src/decision/**,packages/runner-core/src/primitives/** checks=repo-check risk=high prerequisites=1.1 -->

  **Implements** — Design D5; RC-INV-06, INV-003.

  **Change** — `Decision<T>`, `Refusal` with a stable `RefusalCode` and the
  violated element, `OperationalFailure` as a distinct variant; the
  deterministic primitives (digest, canonical ordering, path normalization,
  bound comparison) that both producer and verifier may share.

  **Proof required** — `RC-PROP-01`; `EX-003` seed distinguishing refusal from
  operational failure.

## 2. Authority capture and eligibility

- [x] **2.1 Immutable snapshot construction**
  <!-- agent-task: 2.1 paths=packages/runner-core/src/authority/** checks=repo-check risk=high prerequisites=1.4 -->

  **Implements** — Requirement "Captured authority is an immutable,
  digest-bound snapshot", "Captured authority carries a validated contract
  identity" (`runner-authority`); INV-007 (L3 half); Design D3, D4 —
  including the `AuthorityBytes` input value type. Acquisition is L4 and is
  not implemented here.

  **Proof required** — `ADV-003` (source mutated after capture; decisions
  unchanged); `RC-ADV-11` (contract mismatch refuses); `MUT-002` registered.

- [x] **2.2 Snapshot-only decision signatures**
  <!-- agent-task: 2.2 paths=packages/runner-core/src/** checks=repo-check risk=high prerequisites=2.1 -->

  **Implements** — RC-INV-02; Design D4.

  **Proof required** — `RC-EX-02`: no exported decision parameter is a path,
  handle, reader, or port. `RC-MUT-05` registered.

- [x] **2.3 Eligibility decisions**
  <!-- agent-task: 2.3 paths=packages/runner-core/src/eligibility/** checks=repo-check risk=high prerequisites=2.1 -->

  **Implements** — Requirement "Eligibility refuses rather than defaults"
  (`runner-authority`); the eligibility decision table in `design.md`.

  **Proof required** — one deterministic fixture per table row, including the
  undecidable row; `RC-ADV-10` (duplicate gate identity); `RC-MUT-04`
  registered.

- [x] **2.4 Refusal-versus-operational classification**
  <!-- agent-task: 2.4 paths=packages/runner-core/src/decision/**,packages/runner-core/src/authority/** checks=repo-check risk=high prerequisites=2.1 -->

  **Implements** — Requirement "Refusal is a recordable value, not an
  exception" (`runner-authority`); INV-003.

  **Proof required** — `EX-003`; `RC-ADV-03` (a reported observation failure yields operational
  failure with no refusal code).

## 3. Path decisions, protected context, bounds

- [x] **3.1 Normalization and write-root decisions**
  <!-- agent-task: 3.1 paths=packages/runner-core/src/policy/** checks=repo-check risk=high prerequisites=1.4 -->

  **Implements** — Requirements "Write eligibility derives from captured policy
  alone", "Paths are decided after normalization, and escapes refuse"
  (`runner-path-decisions`).

  **Proof required** — traversal, alias-escape (`RC-ADV-05`), and
  undecidable-normalization fixtures.

- [x] **3.2 Protected governing material**
  <!-- agent-task: 3.2 paths=packages/runner-core/src/policy/** checks=repo-check risk=high prerequisites=3.1 -->

  **Implements** — Requirement "Governing material is never writable by the
  run" (`runner-path-decisions`); INV-008 data/path side; Design D8, D9.

  **Proof required** — `ADV-005` (whole set refused, nothing dropped);
  protection-outranks-root fixture; `RC-ADV-04` and `RC-EX-06` (unrecognized
  rule form refuses at capture); `MUT-001` and `RC-MUT-01` registered.

- [x] **3.3 Bounds refuse, never truncate**
  <!-- agent-task: 3.3 paths=packages/runner-core/src/policy/** checks=repo-check risk=high prerequisites=3.1 -->

  **Implements** — Requirement "Security-relevant bounds refuse, never
  truncate" (`runner-path-decisions`); INV-010; Design D10.

  **Proof required** — `ADV-009`; `PROP-003` including exactly-at-bound
  (`RC-ADV-06`); the API-shape guard that no truncating mode is expressible;
  `MUT-006` and `RC-MUT-03` registered.

## 4. Workspace observation and reconciliation

- [x] **4.1 Authoritative change-set derivation**
  <!-- agent-task: 4.1 paths=packages/runner-core/src/workspace/** checks=repo-check risk=high prerequisites=1.4 -->

  **Implements** — Requirement "The authoritative change set derives from host
  observation" (`runner-workspace-observation`); INV-006; the
  `WorkspaceObservation` and `ArtifactObservation` input value types (D3) —
  values only, no observer abstraction.

  **Proof required** — the derivation interface accepts observation values
  only; `RC-ADV-12` (empty-but-readable) versus `RC-ADV-03` (reported
  unreadable) kept distinct.

- [x] **4.2 Claim reconciliation**
  <!-- agent-task: 4.2 paths=packages/runner-core/src/reconciliation/** checks=repo-check risk=high prerequisites=4.1 -->

  **Implements** — Requirements "Reconciliation records disagreement without
  resolving it in favor of claims", "Materialization eligibility is a distinct
  decision from agreement" (`runner-workspace-observation`).

  **Proof required** — `ADV-002`; `RC-ADV-01`; `RC-ADV-09`; `RC-PROP-02`
  (order-independent, observed-equals-authoritative); `RC-MUT-02` registered.

## 5. Evidence construction

- [x] **5.1 Construct evidence from authoritative inputs**
  <!-- agent-task: 5.1 paths=packages/runner-core/src/evidence/** checks=repo-check risk=high prerequisites=2.1,3.2,4.2 -->

  **Implements** — Requirement "Evidence is constructed only from authoritative
  inputs" (`runner-evidence-derivation`).

  **Change** — Construct an `EvidenceBundle` as amended by
  `runner-contract-corrections`: populate `identities.path_policy` and
  `identities.gate_registry` as `AuthorityIdentity` values derived from the
  captured snapshots (contract identity, exact version, digest of the
  captured bytes). The verifier (task 6.2) compares both against its own
  independently supplied captures.

  **Proof required** — `RC-ADV-02` (bound refusal precedes construction; no
  partial bundle); claims reach only the claim fields; a bundle whose
  authority identities do not match the captured snapshots is never
  constructed.

- [x] **5.2 Seal-eligibility predicate**
  <!-- agent-task: 5.2 paths=packages/runner-core/src/evidence/** checks=repo-check risk=high prerequisites=5.1 -->

  **Implements** — Requirements "Seal eligibility is a deterministic decision
  with named prerequisites", "A failure to establish evidence is never success"
  (`runner-evidence-derivation`); Design D7.

  **Proof required** — undecided-prerequisite refusal; `ADV-011`; the predicate
  writes nothing and sequences nothing; `RC-MUT-07` registered.

  **Boundary** — L3 owns the predicate. **Sealing order is L4** and is not
  claimed here.

## 6. Independent verification

- [x] **6.1 Verifier independence guard**
  <!-- agent-task: 6.1 paths=packages/runner-core/src/verification/** checks=repo-check risk=high prerequisites=5.1 -->

  **Implements** — RC-INV-03; Design D6.

  **Proof required** — `RC-EX-03`: zero import edges between
  `src/evidence/**` and `src/verification/**` in either direction, with shared
  deterministic primitives explicitly permitted. `RC-MUT-08` registered.

  This guard lands **before** the verifier body, so the verifier cannot be
  written against the producer and refactored apart afterwards.

- [x] **6.2 Independent re-derivation**
  <!-- agent-task: 6.2 paths=packages/runner-core/src/verification/** checks=repo-check risk=high prerequisites=6.1 -->

  **Implements** — Requirement "Independent verification re-derives rather than
  re-reads the producer" (`runner-evidence-derivation`); INV-011.

  **Proof required** — `EX-006`; `PROP-005` (single-artifact mutation flagged);
  `RC-ADV-07` (extra unaccounted artifact); `RC-ADV-08` (ambiguity); missing
  artifact; the bundle's `identities.path_policy` and
  `identities.gate_registry` compared against the verifier's own captures,
  failing on any divergence; `MUT-003` and `RC-MUT-06` registered.

- [x] **6.3 Final-consumer trust boundary**
  <!-- agent-task: 6.3 paths=packages/runner-core/src/verification/** checks=repo-check risk=high prerequisites=6.2 -->

  **Implements** — Requirement "Verifying an intermediate never authorizes a
  later artifact" (`runner-evidence-derivation`); INV-015.

  **Proof required** — `ADV-014`; `PROP-006`; `MUT-008` registered; the
  verification result identifies the artifact bytes actually consumed.

## 7. Verification Net for PR-1

- [x] **7.1 Cross-cutting architecture guards over the finished tree**
  <!-- agent-task: 7.1 paths=packages/runner-core/** checks=repo-check risk=high prerequisites=6.3 -->

  **Proof required** — `RC-EX-02`, `RC-EX-03`, `RC-EX-04` re-run over the
  complete source tree; `RC-EX-05` (inert: no module-load side effect, zero
  importers in the repository).

- [x] **7.2 Full property run**
  <!-- agent-task: 7.2 paths=packages/runner-core/** checks=repo-check risk=high prerequisites=6.3 -->

  **Proof required** — `PROP-003`, `PROP-005`, `PROP-006`, `RC-PROP-01`,
  `RC-PROP-02` at their declared generation breadth.

- [x] **7.3 Mutation sweep**
  <!-- agent-task: 7.3 paths=packages/runner-core/** checks=repo-check risk=high prerequisites=7.1,7.2 -->

  **Proof required** — every target in `assurance.md` § Mutation Targets
  (`MUT-001`, `MUT-002`, `MUT-003`, `MUT-006`, `MUT-008`, `RC-MUT-01` …
  `RC-MUT-08`) killed by its named test. A surviving mutant is a missing proof
  and blocks the landing.

- [x] **7.4 First-consumer contract conformance**
  <!-- agent-task: 7.4 paths=packages/runner-core/** checks=repo-check risk=high prerequisites=7.1 -->

  **Implements** — the ratified "inert contract × first consumer arrives"
  interaction: the consuming landing re-runs the neutrality and coherence
  proofs rather than assuming them.

  **Proof required** — every L2 contract this package consumes is validated by
  this package's own suite, not by trusting L2's passing suite.

- [x] **7.5 Report any further L2 contract gap**
  <!-- agent-task: 7.5 paths=openspec/changes/runner-core/** checks=repo-check risk=low prerequisites=7.4 -->

  **Change** — The gaps this seam originally carried (Q1, Q2) are corrected
  in L2 by `runner-contract-corrections`. Record, in the landing's report,
  any **further** contract gap encountered during implementation. **Report
  it; do not fix it here** — `packages/contracts` and `packages/events` are
  outside this landing's path authority.

## PR-1 Completion Gate

The landing is complete only when every box above is checked with its declared
proof green, `repo-check` reports no failure and no skip, and the mutation
sweep leaves no survivor.

Task checkbox state is progress tracking. It is never proof and never
authorization.

---

# Additional Landings

None. L3 is one PR.

Work explicitly belonging to later landings — lifecycle state machine, gate
scheduling and execution, evidence finalization ordering, orchestration
provenance, container launch, network enforcement, resource ceilings, provider
adapters — is enumerated in `proposal.md` § Out of scope and traced to its
landing in `assurance.md` § Traceability Plan. None of it may be absorbed into
this landing.
