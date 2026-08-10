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

**`NOT_AUTHORIZED`**

The GitHub issue authorizes the L3 landing scope. Implementation nevertheless
starts only after the complete planning seam receives its required review and
the explicit post-review authorization task (0.1) is performed.

Two additional conditions gate 0.1 here, both trust-critical and both recorded
in `design.md` § Open Questions:

- **Q1** — the `prohibited_rules` interpretation (D8) must be confirmed or
  redirected. An unconfirmed rule language means the protected-path decision
  has no agreed semantics.
- **Q2** — neither the evidence bundle nor the canonical `runner-evidence`
  requirement can record the path-policy or gate-registry digest. The review
  must accept option A (proceed and report the gap) or direct option B
  (amending a **ratified capability spec** plus the bundle, which is outside
  this landing's path authority and would sequence before L3). Options C and D
  are set out in `design.md` and rejected there with reasons.

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

- [ ] **0.1 Flip authorization on planning-review approval**
  <!-- agent-task: 0.1 paths=openspec/changes/runner-core/tasks.md checks=repo-check risk=low prerequisites=none -->

  **Implements**

  - The review gate of the ratified standing model.

  **Change**

  On the planning review approving this artifact set **and** closing Q1 and Q2:
  record the approval and flip the Status above from `NOT_AUTHORIZED` to
  `AUTHORIZED`, citing the review and the resolution of both questions.

  This task changes **only** the Status block of this file. It changes no
  design, spec, or assurance content. Any planning correction happens *before*
  this task, as its own edit, reviewed on its own terms.

  **Proof required**

  - `repo-check` green.

  **Completion**

  Status reads `AUTHORIZED` with the review and both question resolutions
  cited. Tasks 1.1 onward may begin; not before.

## 1. Package registration and architecture guards

- [ ] **1.1 Register the workspace member**
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

- [ ] **1.2 Dependency-direction negative proof**
  <!-- agent-task: 1.2 paths=packages/runner-core/** checks=repo-check risk=high prerequisites=1.1 -->

  **Implements** — INV-001; `runner-adoption` "Trusted core is extraction-ready".

  **Proof required** — `EX-001`: a test proving that a `services/*` or `apps/*`
  import in this package is rejected by the direction checks. The negative case
  must be demonstrated to fail without the guard, not merely asserted.

- [ ] **1.3 Dependency allowlist and I/O guards**
  <!-- agent-task: 1.3 paths=packages/runner-core/** checks=repo-check risk=high prerequisites=1.1 -->

  **Implements** — Design D2, D3; RC-INV-01, RC-INV-04.

  **Proof required** — `RC-EX-01` (runtime dependency set is exactly the two
  workspace packages; adding one fails); `RC-EX-04` (no `node:fs`,
  `node:child_process`, `node:net`, `node:http(s)`, or `node:dgram` import
  anywhere in `src/**`).

- [ ] **1.4 Result algebra and refusal vocabulary**
  <!-- agent-task: 1.4 paths=packages/runner-core/src/decision/**,packages/runner-core/src/primitives/** checks=repo-check risk=high prerequisites=1.1 -->

  **Implements** — Design D5; RC-INV-06, INV-003.

  **Change** — `Decision<T>`, `Refusal` with a stable `RefusalCode` and the
  violated element, `OperationalFailure` as a distinct variant; the
  deterministic primitives (digest, canonical ordering, path normalization,
  bound comparison) that both producer and verifier may share.

  **Proof required** — `RC-PROP-01`; `EX-003` seed distinguishing refusal from
  operational failure.

## 2. Authority capture and eligibility

- [ ] **2.1 Capture-once snapshots**
  <!-- agent-task: 2.1 paths=packages/runner-core/src/authority/**,packages/runner-core/src/ports/** checks=repo-check risk=high prerequisites=1.4 -->

  **Implements** — Requirement "Authority inputs are captured once and
  digest-bound", "Captured authority carries a validated contract identity"
  (`runner-authority`); INV-007; Design D3, D4.

  **Proof required** — `ADV-003` (source mutated after capture; decisions
  unchanged); `RC-ADV-11` (contract mismatch refuses); `MUT-002` registered.

- [ ] **2.2 Snapshot-only decision signatures**
  <!-- agent-task: 2.2 paths=packages/runner-core/src/** checks=repo-check risk=high prerequisites=2.1 -->

  **Implements** — RC-INV-02; Design D4.

  **Proof required** — `RC-EX-02`: no exported decision parameter is a path,
  handle, reader, or port. `RC-MUT-05` registered.

- [ ] **2.3 Eligibility decisions**
  <!-- agent-task: 2.3 paths=packages/runner-core/src/eligibility/** checks=repo-check risk=high prerequisites=2.1 -->

  **Implements** — Requirement "Eligibility refuses rather than defaults"
  (`runner-authority`); the eligibility decision table in `design.md`.

  **Proof required** — one deterministic fixture per table row, including the
  undecidable row; `RC-ADV-10` (duplicate gate identity); `RC-MUT-04`
  registered.

- [ ] **2.4 Refusal-versus-operational classification**
  <!-- agent-task: 2.4 paths=packages/runner-core/src/decision/**,packages/runner-core/src/authority/** checks=repo-check risk=high prerequisites=2.1 -->

  **Implements** — Requirement "Refusal is a recordable value, not an
  exception" (`runner-authority`); INV-003.

  **Proof required** — `EX-003`; `RC-ADV-03` (port failure yields operational
  failure with no refusal code).

## 3. Path decisions, protected context, bounds

- [ ] **3.1 Normalization and write-root decisions**
  <!-- agent-task: 3.1 paths=packages/runner-core/src/policy/** checks=repo-check risk=high prerequisites=1.4 -->

  **Implements** — Requirements "Write eligibility derives from captured policy
  alone", "Paths are decided after normalization, and escapes refuse"
  (`runner-path-decisions`).

  **Proof required** — traversal, alias-escape (`RC-ADV-05`), and
  undecidable-normalization fixtures.

- [ ] **3.2 Protected governing material**
  <!-- agent-task: 3.2 paths=packages/runner-core/src/policy/** checks=repo-check risk=high prerequisites=3.1 -->

  **Implements** — Requirement "Governing material is never writable by the
  run" (`runner-path-decisions`); INV-008 data/path side; Design D8, D9.

  **Proof required** — `ADV-005` (whole set refused, nothing dropped);
  protection-outranks-root fixture; `RC-ADV-04` and `RC-EX-06` (unrecognized
  rule form refuses at capture); `MUT-001` and `RC-MUT-01` registered.

- [ ] **3.3 Bounds refuse, never truncate**
  <!-- agent-task: 3.3 paths=packages/runner-core/src/policy/** checks=repo-check risk=high prerequisites=3.1 -->

  **Implements** — Requirement "Security-relevant bounds refuse, never
  truncate" (`runner-path-decisions`); INV-010; Design D10.

  **Proof required** — `ADV-009`; `PROP-003` including exactly-at-bound
  (`RC-ADV-06`); the API-shape guard that no truncating mode is expressible;
  `MUT-006` and `RC-MUT-03` registered.

## 4. Workspace observation and reconciliation

- [ ] **4.1 Authoritative change-set derivation**
  <!-- agent-task: 4.1 paths=packages/runner-core/src/workspace/**,packages/runner-core/src/ports/** checks=repo-check risk=high prerequisites=1.4 -->

  **Implements** — Requirement "The authoritative change set derives from host
  observation" (`runner-workspace-observation`); INV-006.

  **Proof required** — the derivation interface accepts observation only;
  `RC-ADV-12` (empty-but-readable) versus `RC-ADV-03` (unreadable) kept
  distinct.

- [ ] **4.2 Claim reconciliation**
  <!-- agent-task: 4.2 paths=packages/runner-core/src/reconciliation/** checks=repo-check risk=high prerequisites=4.1 -->

  **Implements** — Requirements "Reconciliation records disagreement without
  resolving it in favor of claims", "Materialization eligibility is a distinct
  decision from agreement" (`runner-workspace-observation`).

  **Proof required** — `ADV-002`; `RC-ADV-01`; `RC-ADV-09`; `RC-PROP-02`
  (order-independent, observed-equals-authoritative); `RC-MUT-02` registered.

## 5. Evidence construction

- [ ] **5.1 Construct evidence from authoritative inputs**
  <!-- agent-task: 5.1 paths=packages/runner-core/src/evidence/** checks=repo-check risk=high prerequisites=2.1,3.2,4.2 -->

  **Implements** — Requirement "Evidence is constructed only from authoritative
  inputs" (`runner-evidence-derivation`).

  **Change** — Construct an `EvidenceBundle` as authored in
  `packages/events`. Record the Q2 gap in the module: the policy and
  gate-registry digests are captured and compared internally but have no field
  in the ratified bundle.

  **Proof required** — `RC-ADV-02` (bound refusal precedes construction; no
  partial bundle); claims reach only the claim fields.

- [ ] **5.2 Seal-eligibility predicate**
  <!-- agent-task: 5.2 paths=packages/runner-core/src/evidence/** checks=repo-check risk=high prerequisites=5.1 -->

  **Implements** — Requirements "Seal eligibility is a deterministic decision
  with named prerequisites", "A failure to establish evidence is never success"
  (`runner-evidence-derivation`); Design D7.

  **Proof required** — undecided-prerequisite refusal; `ADV-011`; the predicate
  writes nothing and sequences nothing; `RC-MUT-07` registered.

  **Boundary** — L3 owns the predicate. **Sealing order is L4** and is not
  claimed here.

## 6. Independent verification

- [ ] **6.1 Verifier independence guard**
  <!-- agent-task: 6.1 paths=packages/runner-core/src/verification/** checks=repo-check risk=high prerequisites=5.1 -->

  **Implements** — RC-INV-03; Design D6.

  **Proof required** — `RC-EX-03`: zero import edges between
  `src/evidence/**` and `src/verification/**` in either direction, with shared
  deterministic primitives explicitly permitted. `RC-MUT-08` registered.

  This guard lands **before** the verifier body, so the verifier cannot be
  written against the producer and refactored apart afterwards.

- [ ] **6.2 Independent re-derivation**
  <!-- agent-task: 6.2 paths=packages/runner-core/src/verification/** checks=repo-check risk=high prerequisites=6.1 -->

  **Implements** — Requirement "Independent verification re-derives rather than
  re-reads the producer" (`runner-evidence-derivation`); INV-011.

  **Proof required** — `EX-006`; `PROP-005` (single-artifact mutation flagged);
  `RC-ADV-07` (extra unaccounted artifact); `RC-ADV-08` (ambiguity); missing
  artifact; `MUT-003` and `RC-MUT-06` registered.

- [ ] **6.3 Final-consumer trust boundary**
  <!-- agent-task: 6.3 paths=packages/runner-core/src/verification/** checks=repo-check risk=high prerequisites=6.2 -->

  **Implements** — Requirement "Verifying an intermediate never authorizes a
  later artifact" (`runner-evidence-derivation`); INV-015.

  **Proof required** — `ADV-014`; `PROP-006`; `MUT-008` registered; the
  verification result identifies the artifact bytes actually consumed.

## 7. Verification Net for PR-1

- [ ] **7.1 Cross-cutting architecture guards over the finished tree**
  <!-- agent-task: 7.1 paths=packages/runner-core/** checks=repo-check risk=high prerequisites=6.3 -->

  **Proof required** — `RC-EX-02`, `RC-EX-03`, `RC-EX-04` re-run over the
  complete source tree; `RC-EX-05` (inert: no module-load side effect, zero
  importers in the repository).

- [ ] **7.2 Full property run**
  <!-- agent-task: 7.2 paths=packages/runner-core/** checks=repo-check risk=high prerequisites=6.3 -->

  **Proof required** — `PROP-003`, `PROP-005`, `PROP-006`, `RC-PROP-01`,
  `RC-PROP-02` at their declared generation breadth.

- [ ] **7.3 Mutation sweep**
  <!-- agent-task: 7.3 paths=packages/runner-core/** checks=repo-check risk=high prerequisites=7.1,7.2 -->

  **Proof required** — every target in `assurance.md` § Mutation Targets
  (`MUT-001`, `MUT-002`, `MUT-003`, `MUT-006`, `MUT-008`, `RC-MUT-01` …
  `RC-MUT-08`) killed by its named test. A surviving mutant is a missing proof
  and blocks the landing.

- [ ] **7.4 First-consumer contract conformance**
  <!-- agent-task: 7.4 paths=packages/runner-core/** checks=repo-check risk=high prerequisites=7.1 -->

  **Implements** — the ratified "inert contract × first consumer arrives"
  interaction: the consuming landing re-runs the neutrality and coherence
  proofs rather than assuming them.

  **Proof required** — every L2 contract this package consumes is validated by
  this package's own suite, not by trusting L2's passing suite.

- [ ] **7.5 Report the L2 contract gaps**
  <!-- agent-task: 7.5 paths=openspec/changes/runner-core/** checks=repo-check risk=low prerequisites=7.4 -->

  **Change** — Record, in the landing's report, the contract gaps found in
  practice: Q2 (no policy or gate-registry digest field in
  `EvidenceIdentities`) and any further gap encountered. **Report them; do not
  fix them here** — `packages/contracts` and `packages/events` are outside this
  landing's path authority.

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
