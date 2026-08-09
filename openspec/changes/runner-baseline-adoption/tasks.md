# Implementation Tasks: runner-baseline-adoption

## Contract

Implementation is governed by:

- `proposal.md`
- `specs/runner-adoption/spec.md`
- `design.md`
- `assurance.md`

These artifacts define the accepted change contract.

Task completion does not redefine the specification, architecture, or
assurance model.

Check alias used in task metadata: `repo-check` = `bash scripts/check.sh`
(scaffold validation including the OpenSpec governance section, secret scan,
and the workspace checks). The platform gate registry and verification packs
are themselves deliverables of L2/L4; until they exist, `repo-check` is the
only declared check and no task may name an undeclared one.

---

## Implementation Authorization

This section RECORDS external authorization. It can never create it.

OpenSpec artifacts are planning documents. The implementation authority is a
GitHub issue, an explicit user task, or another repository-approved task
contract — never this file, and never the assurance artifact.

### External authority

| Field            | Value                                                       |
| ---------------- | ----------------------------------------------------------- |
| Source type      | `github_issue`                                              |
| Source id / link | to be minted from this change's landings after ratification |
| Authorized scope | none yet                                                    |
| Constraints      | none recorded                                               |
| Owner            | repository owner (@mikegtech)                               |
| Recorded at      | —                                                           |

### Status

**`NOT_AUTHORIZED`**

Status derivation rules:

- Missing, ambiguous, or unverifiable provenance ⇒ `NOT_AUTHORIZED`.
- Authority narrower than the landing plan ⇒ `NOT_AUTHORIZED` for every
  uncovered landing; name them explicitly.
- Assurance completeness is necessary but never sufficient. A complete
  assurance artifact with no external authority is `NOT_AUTHORIZED`.
- Gated landings additionally require their accepted ADR: L7 the U6 ADR
  (#11), L9 the U4 ADR (#9) — per the assurance authorization table.
- Every landing additionally requires its own externally authorized child
  OpenSpec change before implementation begins — see the landing
  implementation contract below.

If the status is `NOT_AUTHORIZED`, implementation tasks must not begin.

Authorization is recorded **per landing** as issues are minted: add a row
per landing (issue id, scope, constraints, date) and update the status for
that landing only. One landing's authority never covers another.

### Landing implementation contract — this parent is a constitution

**L2–L10 are decomposition and authorization boundaries, not direct
implementation contracts.** Before implementation begins for any landing,
that landing SHALL have its own externally authorized
`governed-spec-driven-v1` OpenSpec change. The child change inherits all
applicable `runner-adoption` requirements and SHALL define its
landing-specific proposal, specification delta where required, design,
assurance model, tasks, state-space interactions, proof obligations,
hostile corpus, mutation targets, and completion gate — its assurance and
tasks artifacts complete **before** implementation (the schema's apply gate
enforces this).

Changes arising from a later ADR, spike finding, or implementation
discovery are absorbed by the affected child change or a new superseding
change; **they do not turn this parent ratification into a running
implementation diary.** After merge, this parent changes only by
superseding change.

Trust-critical child changes additionally carry the Authority Chain table
and the before × after transition matrix defined in `assurance.md`'s
standing model.

The task groups below therefore define each landing's inherited scope,
authority boundary, prerequisite DAG, and proof obligations — the contract
every child change starts from, not a task list any agent may implement
from this file.

---

## Landing Plan

| Landing | Ships                                                        | Authority posture | Completion condition                                        |
| ------- | ------------------------------------------------------------ | ----------------- | ----------------------------------------------------------- |
| L1      | ratification effects: issues minted, #19/#27 revised, docs pointers | inert       | issues exist and are recorded above; docs updated           |
| L2      | runner domain contracts (`packages/contracts`, `packages/events`) + generated schemas | inert | contracts validate; EX-002/007, PROP-001/004 green          |
| L3      | `packages/runner-core` + its proof net                        | inert             | EX-001/003/006, ADV-002…005, ADV-009, PROP-003/005, MUT-001…003/006 green |
| L4      | runner-control orchestration (state machine, ports; no launch) | inert            | EX-004, EX-005A, PROP-002, ADV-001/006/007, MUT-004/005 green; boundary proven both directions |
| L5      | image lineage: runner-base, gates-toolchain, Claude reference derived image | inert   | images build reproducibly, digest-pinned, unreferenced      |
| L6      | Copilot capability/credential spike                           | inert             | SPIKE-01…05 answered with captured evidence                 |
| — GATE  | #11 / U6 SPI ADR (human)                                      | —                 | ADR accepted                                                |
| L7      | platform adapters: Claude reference + Copilot + Copilot derived image | inert     | adapters conform to accepted SPI; EX-002/PROP-004 re-run    |
| L8      | coding-adapter conformance seed                               | inert             | same profile, same run → same events/evidence across both adapters |
| — GATE  | #9 / U4 placement ADR (human)                                 | —                 | ADR accepted                                                |
| L9      | concrete launcher + network default-deny + resource ceilings  | **enforce**       | enforcement active; EX-005B, EX-008/ADV-013, MUT-007 green; rollout/rollback obligations met |
| L10     | framework-neutral conformance (deterministic-loop adapter)    | inert             | ADR-0003 uniform-across-adapters claim proven at full strength |

A landing is the unit that may be independently merged. Do not merge a
partial atomic seam. Verification required to trust a component lands with
that component.

The machine-readable `prerequisites=` graph below is **authoritative** over
the visual ordering of this document:

```text
L2 ← L1        L3 ← L2        L4 ← L3        L5 ← L4
L6 ← L1        (intentionally parallel with L2–L5)
L7 ← L5 + GATE-U6   (Copilot adapter additionally ← L6)
L8 ← L7
L9 ← L8 + GATE-U4
L10 ← L8 + L9
```

---

# L1 — Ratification effects

## Completion Definition

L1 is complete only when the child issues exist, #19/#27 are revised from
this change, the documentation pointers are updated, and every citation
audit passes (MAN-001).

## 1. Ratification

- [ ] **1.1 Mint the child issues and record authority**
  <!-- agent-task: 1.1 paths=none checks=repo-check risk=low prerequisites=none -->

  **Implements**

  - Requirement: `Landings stay on the near side of U2, U4, and U6`
  - Invariant(s): `INV-014`, `INV-013`

  **Change**

  **Human-only.** The repository owner mints one issue per landing (L2–L10)
  plus the two ADR issues' scope updates, from this landing plan. Coding
  agents never create issues. Each minted issue id is recorded in the
  External authority section above, per landing.

  **Proof required**

  - `MAN-002` — authorization table applied; per-landing rows recorded

  **Completion**

  Issues exist, are linked to this change, and the authorization table
  carries one row per landing.

- [ ] **1.2 Revise #19 and #27 from the ratified plan**
  <!-- agent-task: 1.2 paths=none checks=repo-check risk=low prerequisites=1.1 -->

  **Implements**

  - Design decision(s): `D6` (the #27 revision input), the landing plan

  **Change**

  **Human-owned, agent-assistable.** #19's body becomes the L2–L10 tree;
  #27's scope names the orchestration interface list from D6 and its U4
  gate.

  **Proof required**

  - `MAN-001` — issue text cites the pin and this change, nothing floating

  **Completion**

  Both issues reference this change as their source of truth.

- [ ] **1.3 Update the documentation pointers**
  <!-- agent-task: 1.3 paths=profiles/README.md,docs/architecture/runner-model.md checks=repo-check risk=low prerequisites=1.1 -->

  **Implements**

  - Design: Compatibility and Migration (the `profiles/README.md`
    runner-baseline note is discharged by this review)

  **Change**

  Point the `profiles/README.md` runner-baseline paragraph and the
  `runner-model.md` "not implemented" status notes at the merged change.
  Docs only; no contract content moves.

  **Proof required**

  - `repo-check` (scaffold + indexes stay coherent)

  **Completion**

  Pointers cite the merged change; scaffold validation green.

---

# L2 — Runner domain contracts

## Completion Definition

L2 is complete only when the contracts validate, generate deterministic
JSON Schema, carry no provider name structurally, and the neutrality and
runtime-neutrality proofs are green — with nothing consuming them yet.

## 2. Contracts

- [ ] **2.1 Author the execution-profile, launch, policy, and gate contracts**
  <!-- agent-task: 2.1 paths=packages/contracts/**,schemas/**,pnpm-workspace.yaml,pnpm-lock.yaml checks=repo-check risk=high prerequisites=L1 -->

  **Implements**

  - Requirement: `Contracts are provider-neutral in structural positions`,
    `Contracts are container-runtime neutral`, `Authority comes only from
    an execution profile`
  - Invariant(s): `INV-002`, `INV-005`, `INV-012`
  - Design decision(s): `D3`, `D9`

  **Change**

  Zod-authored: execution-profile (field groups per `runner-model.md`;
  `adapter` as opaque value), launch assertion (argv as data, env-var-name
  credential transport, secret-bearing argv unrecordable), path policy,
  gate registry (`network` inexpressible as anything but none), verification
  packs.

  **Proof required**

  - `EX-002`, `EX-007`, `PROP-001`, `PROP-004`

  **Completion**

  Contracts validate; generated schemas deterministic; proofs green; no
  consumer exists.

- [ ] **2.2 Author the run-event and evidence contracts in packages/events**
  <!-- agent-task: 2.2 paths=packages/events/**,schemas/**,pnpm-workspace.yaml,pnpm-lock.yaml checks=repo-check risk=high prerequisites=L1 -->

  **Implements**

  - Requirement: `Evidence outranks claims` (record shape),
    `The run lifecycle is an explicit state machine` (event vocabulary),
    `Outcome classification is preserved`
  - Invariant(s): `INV-003`, `INV-004` (shape), `INV-006` (shape)
  - Design decision(s): `D9`

  **Change**

  Run record, run events (stable dotted names, provider identity as data),
  evidence bundle/catalog shapes, outcome classification vocabulary
  (`change-attributable` / `operational`, terminal states incl.
  `INDETERMINATE` as a failure class).

  **Proof required**

  - `EX-002`, `PROP-004` (events corpus included in the scan)

  **Completion**

  Same bar as 2.1; `packages/events` charter respected (no transport, no
  optional evidence).

- [ ] **2.3 Contract conformance suite**
  <!-- agent-task: 2.3 paths=packages/contracts/**,packages/events/**,schemas/** checks=repo-check risk=high prerequisites=2.1,2.2 -->

  **Proves**

  - `EX-002`, `EX-007`, `PROP-001`, `PROP-004` as repeatable suites the
    later landings re-run (L7, L8)

  **Completion**

  Suites runnable standalone; wired into the workspace checks.

## L2 Completion Gate

- [ ] Every L2 task complete; every proof green.
- [ ] No provider or framework name in any structural position.
- [ ] No consumer imports the contracts yet (inert verified).
- [ ] Required review completed on the frozen final head.

---

# L3 — Trusted runner-core

## Completion Definition

L3 is complete only when `packages/runner-core` implements the adopted
decision mechanisms with its full proof net green, and nothing else
consumes it yet.

## 3. Trusted core

- [ ] **3.1 Package boundary and dependency direction**
  <!-- agent-task: 3.1 paths=packages/runner-core/**,packages/README.md,scripts/workspace-model.mjs,pnpm-workspace.yaml,pnpm-lock.yaml checks=repo-check risk=high prerequisites=L2 -->

  **Implements**

  - Requirement: `Trusted core is extraction-ready`
  - Invariant(s): `INV-001`

  **Change**

  Create the classified package (README, manifest, workspace registration
  per D9); dependency-direction check refuses `services/*`/`apps/*`
  imports.

  **Proof required**

  - `EX-001`

- [ ] **3.2 Authority-input capture and eligibility**
  <!-- agent-task: 3.2 paths=packages/runner-core/** checks=repo-check risk=trust-critical prerequisites=3.1 -->

  **Implements**

  - Requirement: `Authority inputs are captured once and digest-bound`
  - Invariant(s): `INV-007`; refuse-don't-default eligibility (matrix)

  **Proof required**

  - `ADV-003`, `ADV-004`, `MUT-002`

- [ ] **3.3 Path policy, protected context, and bounds**
  <!-- agent-task: 3.3 paths=packages/runner-core/** checks=repo-check risk=trust-critical prerequisites=3.1 -->

  **Implements**

  - Requirement: `A run cannot alter what judges it`,
    `Security-relevant bounds refuse, never truncate`
  - Invariant(s): `INV-008`, `INV-010`

  **Proof required**

  - `ADV-005`, `ADV-009`, `PROP-003`, `MUT-001`, `MUT-006`

- [ ] **3.4 Workspace observation and claim reconciliation**
  <!-- agent-task: 3.4 paths=packages/runner-core/** checks=repo-check risk=trust-critical prerequisites=3.1 -->

  **Implements**

  - Requirement: `Evidence outranks claims`,
    `Outcome classification is preserved`
  - Invariant(s): `INV-006`, `INV-003`

  **Proof required**

  - `ADV-002`, `EX-003`

- [ ] **3.5 Evidence catalog and independent verifier**
  <!-- agent-task: 3.5 paths=packages/runner-core/** checks=repo-check risk=trust-critical prerequisites=3.2,3.3,3.4 -->

  **Implements**

  - Requirement: `Evidence is sealed, independently re-derivable, and
    fail-closed`
  - Invariant(s): `INV-011`

  **Proof required**

  - `EX-006`, `PROP-005`, `ADV-011`, `MUT-003`

## L3 Completion Gate

- [ ] Every L3 task complete; the full L3 proof net green.
- [ ] Mutation targets MUT-001/002/003/006 demonstrably killed.
- [ ] No expired traceability debt; deferred re-proofs still named.
- [ ] Required review completed on the frozen final head.

---

# L4 — runner-control orchestration

## Completion Definition

L4 is complete only when the lifecycle state machine, consent, cancellation
and timeout, workspace lifecycle, gate scheduling, and evidence finalization
exist behind an execution port with **no container launch**, and the
core/control boundary is proven in both directions.

## 4. Orchestration

- [ ] **4.1 The typed run-lifecycle state machine**
  <!-- agent-task: 4.1 paths=services/runner-control/**,pnpm-workspace.yaml,pnpm-lock.yaml checks=repo-check risk=trust-critical prerequisites=L3 -->

  **Implements**

  - Requirement: `The run lifecycle is an explicit state machine`
  - Invariant(s): `INV-004`
  - Design decision(s): `D6`

  **Proof required**

  - `EX-004`, `PROP-002`, `ADV-012`, `MUT-005`

- [ ] **4.2 Consent to spend and profile resolution**
  <!-- agent-task: 4.2 paths=services/runner-control/** checks=repo-check risk=trust-critical prerequisites=4.1 -->

  **Implements**

  - Requirement: `Authority comes only from an execution profile`
  - Invariant(s): `INV-005`; consent-vs-authority interaction (assurance)

  **Proof required**

  - `ADV-001` plus the consent-without-profile refusal example

- [ ] **4.3 Gate scheduling against the registry**
  <!-- agent-task: 4.3 paths=services/runner-control/** checks=repo-check risk=trust-critical prerequisites=4.1 -->

  **Implements**

  - Requirement: `Gates execute only from the exact-argv registry`
  - Invariant(s): `INV-009`

  **Proof required**

  - `EX-005A`, `ADV-006`, `ADV-007`, `MUT-004`

- [ ] **4.4 Workspace lifecycle, cancellation, timeout, evidence finalization ports**
  <!-- agent-task: 4.4 paths=services/runner-control/** checks=repo-check risk=trust-critical prerequisites=4.1 -->

  **Implements**

  - Requirement: `Authority inputs are captured once…` (workspace
    derivation), `Evidence is sealed…` (finalization port)
  - Invariant(s): `INV-007`, `INV-011`

  **Proof required**

  - `EX-003` (cancellation/timeout terminal classification), `ADV-011`

- [ ] **4.5 Prove the core/control boundary**
  <!-- agent-task: 4.5 paths=packages/runner-core/**,services/runner-control/** checks=repo-check risk=high prerequisites=4.1,4.2,4.3,4.4 -->

  **Implements**

  - Design: D6 responsibility split — decisions cannot orchestrate,
    orchestration cannot decide

  **Proof required**

  - dependency-direction checks in both directions; `EX-001` extended

## L4 Completion Gate

- [ ] Every L4 task complete; L4 proof net green; no container launch
      anywhere (#27 constraints intact, launcher absent).
- [ ] Boundary proven both directions.
- [ ] Required review completed on the frozen final head.

---

# L5 — Image lineage

- [ ] **5.1 `secure-home-runner-base`** — neutral substrate only; no
      provider content; digest-pinned build.
  <!-- agent-task: 5.1 paths=deploy/images/** checks=repo-check risk=high prerequisites=L4 -->
- [ ] **5.2 Gates-toolchain image** — outside the runner lineage; name and
      registry placement confirmed here (proposal Q2).
  <!-- agent-task: 5.2 paths=deploy/images/** checks=repo-check risk=high prerequisites=5.1 -->
- [ ] **5.3 Claude reference derived image** — base + one pinned CLI,
      nothing else (ADR-0011).
  <!-- agent-task: 5.3 paths=deploy/images/** checks=repo-check risk=high prerequisites=5.1 -->

**Completion gate:** reproducible builds, digest pins recorded, no profile
references them (inert), base contains no provider name (MAN-001-style
audit + PROP-004 over image metadata).

---

# L6 — Copilot capability and credential spike

- [ ] **6.1 SPIKE-01 structured output** · **6.2 SPIKE-02 fail-closed tool
      allowlist** · **6.3 SPIKE-03 machine-readable transcript** ·
      **6.4 SPIKE-04 cost/usage reporting** · **6.5 SPIKE-05 credential
      injection/isolation** — each answered with captured evidence
      artifacts, each explicitly answerable "no" (a "no" shapes L7's
      wrapper design; it does not fail the spike).
  <!-- agent-task: 6.x paths=docs/** checks=repo-check risk=medium prerequisites=L1 -->

**Completion gate:** five evidence artifacts recorded; findings summarized
as input to the U6 ADR (#11); no platform contract modified by the spike.

---

## GATE — #11 / U6 adapter-SPI ADR

Human decision through the decisions process. L7 tasks are
`NOT_AUTHORIZED` until the ADR is `Accepted` (assurance authorization
table). This change contributes evidence (L6 findings, upstream transcript
adapter analysis at the pin); it does not write the ADR.

---

# L7 — Platform adapters (post-U6)

- [ ] **7.1 Claude reference adapter** against the accepted SPI.
  <!-- agent-task: 7.1 paths=agents/adapters/coding/claude-code/**,pnpm-lock.yaml checks=repo-check risk=trust-critical prerequisites=L5,GATE-U6 -->
- [ ] **7.2 Copilot adapter** against the accepted SPI, shaped by L6
      findings.
  <!-- agent-task: 7.2 paths=agents/adapters/coding/copilot-cli/**,pnpm-lock.yaml checks=repo-check risk=trust-critical prerequisites=L5,L6,GATE-U6 -->
- [ ] **7.3 Copilot derived image** (base + pinned Copilot CLI).
  <!-- agent-task: 7.3 paths=deploy/images/** checks=repo-check risk=high prerequisites=7.2,L5 -->
- [ ] **7.4 Re-run neutrality proofs** — `EX-002`, `PROP-004` over the
      contract corpus now that adapters exist.
  <!-- agent-task: 7.4 paths=packages/contracts/**,packages/events/** checks=repo-check risk=high prerequisites=7.1,7.2 -->

**Completion gate:** both adapters conform to the accepted SPI; neutrality
re-proof green; adapters unlaunchable (no launcher exists yet — inert).

---

# L8 — Coding-adapter conformance seed

- [ ] **8.1 Conformance harness**: same profile, same run → same events and
      evidence across the Claude and Copilot adapters (execution-port
      level). Explicitly a **seed**, not framework conformance.
  <!-- agent-task: 8.1 paths=tests/framework-conformance/** checks=repo-check risk=high prerequisites=L7 -->

**Completion gate:** conformance suite green across both adapters;
divergences are named findings, not averaged away.

---

## GATE — #9 / U4 placement ADR

Human decision. L9 tasks are `NOT_AUTHORIZED` until the ADR is `Accepted`.
Placement, resource-starvation posture, credential custody, and mount
isolation are decided there — not here.

---

# L9 — Launcher and enforcement (post-U4)

- [ ] **9.1 Concrete runner-control launcher** per the accepted placement;
      hardened launch posture (adapted flag set + ceilings), runtime-neutral
      expression.
  <!-- agent-task: 9.1 paths=services/runner-control/** checks=repo-check risk=trust-critical prerequisites=L8,GATE-U4 -->
- [ ] **9.2 Per-run network default-deny** with profile-declared egress
      only; gates remain network-none (`EX-005B`, `MUT-007`: a real gate
      container has no egress even after profile egress activates, and
      weakening the network-none guard kills the probe).
  <!-- agent-task: 9.2 paths=services/runner-control/**,deploy/** checks=repo-check risk=trust-critical prerequisites=9.1 -->
- [ ] **9.3 Resource ceilings** — memory, CPU, pids, wall clock, output
      size; Pi-contention evidence per #19 exit criteria.
  <!-- agent-task: 9.3 paths=services/runner-control/** checks=repo-check risk=trust-critical prerequisites=9.1 -->
- [ ] **9.4 Effective cancellation and teardown** — cancel/timeout →
      process tree dead → container gone → mounts gone → credential
      inaccessible → terminal evidence recorded (`EX-008`, `ADV-013`; #19:
      killed or timed-out runs leave no privileged container or mounted
      credential).
  <!-- agent-task: 9.4 paths=services/runner-control/** checks=repo-check risk=trust-critical prerequisites=9.1 -->

**Completion gate:** rollout obligations from assurance met
(advisory/shadow observation, measurements, activation condition, rollback
condition — defined in the landing issue before authorization); `EX-005B`,
`EX-008`/`ADV-013`, `MUT-007`, and `ADV-001` proven at container level; the
enforce flip is the only posture change in the whole sequence.

---

# L10 — Framework-neutral conformance

- [ ] **10.1 Deterministic-loop adapter** joins the conformance matrix;
      the ADR-0003 uniform-across-adapters claim is proven at full
      strength. Authoring location per the open question (this change or
      the household-runner change) — decided when the U6 ADR fixes the SPI
      shape.
  <!-- agent-task: 10.1 paths=tests/framework-conformance/** checks=repo-check risk=high prerequisites=L8,L9 -->

**Completion gate:** three-adapter matrix green (two coding CLIs + one
deterministic loop); only now may "uniform across adapters" be claimed
without qualification.
