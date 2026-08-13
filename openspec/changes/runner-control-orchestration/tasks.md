# Implementation Tasks: runner-control-orchestration

## Contract

Implementation is governed by:

- `proposal.md`
- `specs/runner-lifecycle/spec.md`
- `specs/runner-authority-acquisition/spec.md`
- `specs/runner-gate-orchestration/spec.md`
- `specs/runner-execution-boundary/spec.md`
- `design.md`
- `assurance.md`

plus the inherited canonical contract `openspec/specs/runner-adoption/spec.md`,
the canonical L2/L3 capability specs, and the archived constitution's L4
decomposition (D6).

Task completion does not redefine the specification, architecture, or
assurance model.

Check alias used in task metadata: `repo-check` = `bash scripts/check.sh`.
Every proof this change introduces is a **package-level test** under
`services/runner-control/**`, reached by the existing aggregate gate. No
task modifies a script or workflow.

Path authority for this change, from #27:

- `services/runner-control/**`
- `pnpm-workspace.yaml`
- `pnpm-lock.yaml`
- `openspec/changes/runner-control-orchestration/**` (this change's own
  artifacts)

**Anticipated cross-authority amendment, recorded up front:**
`packages/runner-core`'s conformance suite asserts zero importers; this
landing's authorized arrival will require a one-line consumer-allowlist
amendment there (and, if its dependency scan is layered the same way,
none elsewhere). This follows the recorded L3-arrival precedent in L2's
C-EX-004: **stop, report, and obtain owner authorization** before touching
the file; record the authorization here when granted. Anything else
outside the listed paths is out of scope; if the L3 public API proves
insufficient, stop and report the gap — do not modify `packages/*` inside
this landing.

---

## Implementation Authorization

This section RECORDS external authorization. It can never create it.

### External authority

| Field | Value |
|---|---|
| Source type | `github_issue` |
| Source id / link | pulse-ops-ai/secure-home-agent-platform#27 |
| Authorized scope | Landing L4 — `services/runner-control` orchestration: typed run-lifecycle state machine; consent-to-spend and profile resolution; gate scheduling with the closed outcome vocabulary; workspace lifecycle, cancellation + timeout, evidence-finalization ports, adapter invocation port — all behind an execution port with **no container launch**; the core/control boundary proven both directions |
| Constraints | no provider SDK; no Docker socket; no Home Assistant or action-gateway dependency; independent application build; no control-plane infrastructure imports; no U2/U4/U6/U11 decision; the concrete launcher is L9 after U4/#9 |
| Owner | repository owner (@mikegtech) |
| Recorded at | 2026-08-10 |

### Status

**`AUTHORIZED`** — recorded 2026-08-12.

#27 authorizes the L4 landing scope, and **all five gating conditions in
the table below are now satisfied**.

| Gate | Evidence |
|---|---|
| The focused delta review approves the enacted blocker resolutions | approved on PR #70's closing round |
| The early-terminal refusal-record L2 amendment is landed | `early-termination-record@1.0.0` minted (PR #76, `96da9de`) and archived with its requirement canonical (PR #78) |
| `openspec validate runner-control-orchestration --strict` | valid on this head |
| The requester-provenance obligation is recorded and approved | RO-INV-09 + RO-EX-08/RO-ADV-08/RO-MUT-06 (PR #77, `d26eeff`) |
| D10's cross-run concurrency posture is confirmed | confirmed by the repository owner 2026-08-12 on PR #79; recorded in `design.md` D10 and `assurance.md`, with its added obligation minted as RO-INV-10 / RO-EX-09 / RO-PROP-04 / RO-MUT-07 |

An earlier revision of this branch's predecessor flipped this status while
D10 was still outstanding. That flip was reverted (PR #79) and the status
is granted here only on the completed set.

**Scope reminder — authorization is not a widening.** This authorizes
the tasks below as written: no container launch, no provider SDK, no
Docker socket, no bootstrap execution. The runner-core consumer-allowlist
amendment in 1.1 still requires its own recorded owner authorization
before that file is touched.

Status derivation rules (inherited):

- Missing, ambiguous, or unverifiable provenance ⇒ `NOT_AUTHORIZED`.
- Authority narrower than the landing scope ⇒ `NOT_AUTHORIZED` for the
  uncovered work.
- Assurance completeness is necessary but never sufficient.
- An unresolved trust-critical question ⇒ `NOT_AUTHORIZED` regardless of
  recorded authority.
- This landing is ungated by U-decisions (it depends on none of U1–U11 —
  and its design exists precisely to keep U4 out).

**While the status is `NOT_AUTHORIZED`, no implementation task below may
begin.**

---

## Landing Plan

One PR. Orchestration and its proof net land together (the L3 pattern):
task groups 2–6 each carry their own fixtures and properties; group 7 adds
the cross-cutting net over the finished tree.

---

# PR-1 — runner-control orchestration

## Completion Definition

The landing is complete when:

- every task below is done with its declared proof green;
- the full proof net in `assurance.md` runs in the aggregate gate;
- every mutation target is killed by its named test;
- the service has no bootstrap and no importer; no port implementation
  spawns anything;
- `repo-check` is green with nothing skipped;
- no file outside the declared path authority is modified (the anticipated
  runner-core allowlist amendment only with recorded owner authorization).

## Disclosure: two tasks were checked before they were implemented

Recorded here because a completion record that hides this is worse than
no record.

On commit `aa54574` this file showed **3.3 (the verification epoch)** and
**3.4 (base-identity assertion at creation)** complete. They were not.
`verifyEvidence`, `consumeVerified`, and `compareBaseIdentity` were
called **zero times** in production source: 3.3 re-acquired authority and
discarded the result, so `VERIFYING` was a state the run passed through
rather than a check it passed, and 3.4 was absent entirely, so a
substituted workspace reached provider invocation unchecked.

The code review on that commit found both, along with five further
authority and ordering defects (P1s on `aa54574`): the captured profile
was never bound to the requested reference; consent was replayable across
runs; `COMPLETED` was entered before the seal; the terminal event was
written after it; and every adapter-reported call was discarded.

All seven are fixed, each with a named regression proof — RO-EX-10…16,
registered in `assurance.md` against RO-INV-11…16 with mutation targets
RO-MUT-08…13. The task boxes below are re-checked only against those
proofs.

The lesson recorded for later landings: a task's proof obligation is what
marks it done, not the presence of code that looks like it. 3.3 and 3.4
both had plausible-looking implementations, and neither called the
operation its requirement names.

---

## 0. Post-review authorization

- [x] **0.1 Flip authorization on planning-review approval**
  <!-- agent-task: 0.1 paths=openspec/changes/runner-control-orchestration/tasks.md checks=repo-check risk=low prerequisites=none -->

  **Change** — When **every** gate in the Status table above is satisfied
  — the delta review approving the enacted blocker resolutions, the
  early-terminal L2 amendment landed, strict validation run, the
  requester-provenance obligation recorded and approved, and **the owner's
  confirmation of D10's cross-run concurrency posture obtained** — record
  each and flip the Status above to `AUTHORIZED`. Partial satisfaction
  does not authorize a partial flip. This task changes only the Status
  block of this file.

  **Proof required** — `repo-check` green.

## 1. Service registration and boundary guards

- [x] **1.1 Fill the workspace member; record the first-consumer amendment**
  <!-- agent-task: 1.1 paths=services/runner-control/**,pnpm-workspace.yaml,pnpm-lock.yaml checks=repo-check risk=medium prerequisites=0.1 -->

  **Implements** — Design D2/D3 scaffolding; the first-consumer arrival.

  **Change** — Declare runtime deps exactly: the three platform packages
  plus the pinned ADR-0012 framework set for the inert shell (D2/D8) —
  no zod, no client SDK, no container runtime; standard tooling template;
  `src/` skeleton per the proposed tree including the INERT `app/` Nest
  module tree (no listener, no executed bootstrap).

  **Consumer-allowlist authorization — GRANTED, recorded here.** The
  repository owner authorized the two conformance amendments on
  2026-08-12, path-qualified variant, applied as their own disclosed
  commit:

  - `packages/contracts/src/conformance/inertness.test.ts` (C-EX-004) —
    admit `services/runner-control` in the consumer allowlist, the same
    ratified "inert contract × authorized first consumer arrives"
    transition recorded for L3 in `d749da7`.
  - `packages/runner-core/src/conformance/architecture.test.ts`
    (RC-EX-05) — replace the bare `entry.name === 'runner-core'` skip
    with a **path-qualified** allowlist admitting `packages/runner-core`
    and `services/runner-control`. The owner chose this over the minimal
    literal edit because the bare name previously exempted a directory
    called `runner-core` in ANY group.

  The authorization covers exactly these two files and no other file
  outside this change's path authority.

  **Proof required** — frozen install, lint, typecheck, build green;
  direction checks accept the inward edges; `RO-EX-01` seed.

- [x] **1.2 Boundary guards**
  <!-- agent-task: 1.2 paths=services/runner-control/** checks=repo-check risk=high prerequisites=1.1 -->

  **Implements** — RO-INV-01/02/03/07.

  **Proof required** — `RO-EX-01` (exact dependency allowlist), `RO-EX-02`
  (no container client/socket/spawn), `RO-EX-03` (no dynamic-specifier
  import, no eval family), `RO-EX-07` (no bootstrap side effect).

## 2. Lifecycle

- [x] **2.1 The typed state machine**
  <!-- agent-task: 2.1 paths=services/runner-control/src/lifecycle/** checks=repo-check risk=high prerequisites=1.1 -->

  **Implements** — Requirement "A run is a typed walk through the declared
  state machine" (`runner-lifecycle`); INV-004; Design D1, D10.

  **Proof required** — `EX-004` declared-walk fixtures; `PROP-002` full
  undeclared-pair sweep; `RO-ADV-02` (terminal is final); `RO-PROP-03`
  (single-writer serialization).

- [x] **2.2 Cancellation and timeout transitions**
  <!-- agent-task: 2.2 paths=services/runner-control/src/lifecycle/** checks=repo-check risk=high prerequisites=2.1 -->

  **Implements** — Requirements "Cancellation and timeout are declared
  transitions with mandatory evidence" and "A run that terminates before
  authority completes produces an early-terminal refusal record"
  (`runner-lifecycle`); Design D11.

  **Proof required** — `RO-ADV-06` (cancellation from every cancellable
  state, full bundle with empty sets); the timeout fixture; `RO-ADV-07`
  (REQUESTED terminals write the refusal record, never a fabricated
  bundle); `RO-EX-08` and `RO-ADV-08` (requester attribution comes from
  the run request — including the case where a profile WAS captured
  before a later acquisition fault); `RO-MUT-05` and `RO-MUT-06`
  registered.

- [x] **2.3 Consent-to-spend**
  <!-- agent-task: 2.3 paths=services/runner-control/src/consent/**,services/runner-control/src/lifecycle/** checks=repo-check risk=high prerequisites=2.1 -->

  **Implements** — Requirement "Consent gates spend and is never
  authority" (`runner-lifecycle`); INV-005; Design D5; the spend decision
  table.

  **Proof required** — `ADV-001` (+consent variant); `RO-ADV-01`
  (eligibility without consent holds); `RO-MUT-03` registered.

- [x] **2.4 Run-event emission at transitions**
  <!-- agent-task: 2.4 paths=services/runner-control/src/events/** checks=repo-check risk=high prerequisites=2.1 -->

  **Implements** — Requirement "Lifecycle moments the closed vocabulary
  represents emit events; every transition is recorded"
  (`runner-lifecycle`); Design D9.

  **Proof required** — emission fixtures at the representable moments; a
  no-invented-or-overloaded-type scan; every transition present in the
  transition record; `capability.granted` carries the captured grant
  verbatim (instance check); ADV-012 at every reporting surface.

## 3. Authority acquisition

- [x] **3.1 Acquire-once tokens and the two-epoch acquisition sets**
  <!-- agent-task: 3.1 paths=services/runner-control/src/acquisition/**,services/runner-control/src/ports/** checks=repo-check risk=high prerequisites=1.1 -->

  **Implements** — Requirement "Authority acquisition happens in declared
  epochs, at most once per source in each"
  (`runner-authority-acquisition`); INV-007 L4 half; Design D4 —
  including production-epoch completion before `PROFILE_RESOLVED`.

  **Proof required** — `RO-EX-04`, `RO-PROP-01`, `RO-ADV-04` (mid-run
  mutation changes nothing); `RO-MUT-01` registered.

- [x] **3.2 Profile resolution**
  <!-- agent-task: 3.2 paths=services/runner-control/src/acquisition/** checks=repo-check risk=high prerequisites=3.1 -->

  **Implements** — Requirement "Profile resolution yields a versioned
  profile or refuses" (`runner-authority-acquisition`); INV-005.

  **Proof required** — missing/invalid/mismatched resolution fixtures,
  refusal before any execution-port call.

- [x] **3.3 The verification epoch**
  <!-- agent-task: 3.3 paths=services/runner-control/src/acquisition/** checks=repo-check risk=high prerequisites=3.1 -->

  **Implements** — Requirement "Verification consumes only the
  verification epoch" (`runner-authority-acquisition`); Design D4.

  **Proof required** — `RO-ADV-05`: the verifier consumes only the
  verification set; both epochs separately recorded; production-value
  injection unexpressible.

- [x] **3.4 Base-identity assertion at creation**
  <!-- agent-task: 3.4 paths=services/runner-control/src/acquisition/**,services/runner-control/src/lifecycle/** checks=repo-check risk=high prerequisites=3.1 -->

  **Implements** — Requirement "The pinned base identity is asserted at
  workspace creation" (`runner-authority-acquisition`); ADV-004 assertion
  half (completing L3's comparison half).

  **Proof required** — creation-sequenced fixture: mismatch refuses before
  any model/adapter port call.

## 4. Gate orchestration

- [x] **4.1 Plan construction and scheduling**
  <!-- agent-task: 4.1 paths=services/runner-control/src/scheduling/** checks=repo-check risk=high prerequisites=2.1,3.1 -->

  **Implements** — Requirement "Only declared gates are scheduled, with
  exactly the registry's argv" (`runner-gate-orchestration`); INV-009;
  Design D6.

  **Proof required** — `EX-005A` (recorded plan equals registry);
  `ADV-006` (widening unexpressible); `ADV-007` (undeclared refuses before
  spend); `RO-EX-05`; `MUT-004` registered.

- [x] **4.2 Disposition recording**
  <!-- agent-task: 4.2 paths=services/runner-control/src/scheduling/** checks=repo-check risk=high prerequisites=4.1 -->

  **Implements** — Requirements "Each gate identity receives exactly one
  terminal disposition", "Environment skips and truncation keep their
  meaning" (`runner-gate-orchestration`); INV-016.

  **Proof required** — `ADV-015/016/017`; `PROP-007` and `RO-PROP-02`;
  `MUT-009` registered.

## 5. Execution boundary

- [x] **5.1 Ports and shipped implementations**
  <!-- agent-task: 5.1 paths=services/runner-control/src/ports/**,services/runner-control/src/adapters/**,services/runner-control/src/observation/** checks=repo-check risk=high prerequisites=1.1 -->

  **Implements** — Requirement "Every effect passes through a declared
  port, and no port can launch a container" (`runner-execution-boundary`);
  Design D3 (read/execute asymmetry per OQ1's resolution).

  **Change** — Every run-scoped port operation takes its `run_id`; any
  per-run state a shipped implementation retains is keyed by it (D10's
  confirmed obligation — no unkeyed mutable per-run state).

  **Proof required** — `RO-EX-02` over the finished port set; fs
  implementations produce exactly the L3 value types; execution/adapter
  implementations are the declared deterministic fakes; `RO-EX-09` (two
  runs over ONE shared set of port instances: disjoint bundles, each
  equal to that run executed alone).

- [x] **5.2 Orchestration provenance**
  <!-- agent-task: 5.2 paths=services/runner-control/** checks=repo-check risk=high prerequisites=5.1 -->

  **Implements** — Requirement "Decision-bearing orchestration executes
  only from trusted platform-controlled code"
  (`runner-execution-boundary`); INV-008 code side; Design D8.

  **Proof required** — `ADV-018` behavioral fixture (workspace
  "orchestration" bytes ride as data); `RO-EX-03`; `MUT-010` registered.

- [x] **5.3 Evidence finalization ordering**
  <!-- agent-task: 5.3 paths=services/runner-control/src/finalization/** checks=repo-check risk=high prerequisites=2.1,4.2 -->

  **Implements** — Requirement "Evidence is sealed last, through the
  trusted core's eligibility" (`runner-execution-boundary`); INV-011
  ordering half; Design D7.

  **Proof required** — `RO-ADV-03` (early seal refused; good path seals
  last by recorded sequence, **filtered to this run** — D10); `RO-MUT-02`
  and `RO-MUT-07` registered.

## 6. Core/control boundary

- [x] **6.1 Cannot-decide guards and decision provenance**
  <!-- agent-task: 6.1 paths=services/runner-control/** checks=repo-check risk=high prerequisites=2.1,3.1,4.1,5.3 -->

  **Implements** — Requirement "The core/control boundary holds in both
  directions" (`runner-execution-boundary`); RO-INV-01/06.

  **Proof required** — `RO-EX-01`; `RO-EX-06` (every recorded decision
  attributable to a core call); `RO-MUT-04` registered.

- [x] **6.2 First-consumer conformance over the L3 surface**
  <!-- agent-task: 6.2 paths=services/runner-control/** checks=repo-check risk=high prerequisites=6.1 -->

  **Implements** — the standing first-consumer note, applied to
  `packages/runner-core`.

  **Proof required** — this suite re-validates the L3 operations it
  consumes (decision shapes, refusal codes, value types) rather than
  trusting L3's passing suite.

## 7. Verification net for PR-1

- [x] **7.1 Cross-cutting guards over the finished tree**
  <!-- agent-task: 7.1 paths=services/runner-control/** checks=repo-check risk=high prerequisites=6.2 -->

  **Proof required** — `RO-EX-01…07` re-run over the complete tree;
  no-bootstrap re-check; zero importers.

- [x] **7.2 Full property run**
  <!-- agent-task: 7.2 paths=services/runner-control/** checks=repo-check risk=high prerequisites=6.2 -->

  **Proof required** — `PROP-002`, `PROP-007`, `RO-PROP-01/02/03/04` at
  their declared breadth.

- [x] **7.3 Mutation sweep**
  <!-- agent-task: 7.3 paths=services/runner-control/** checks=repo-check risk=high prerequisites=7.1,7.2 -->

  **Proof required** — every target (`MUT-004/005/009/010`,
  `RO-MUT-01…07` — the range includes `RO-MUT-06` requester provenance
  and `RO-MUT-07` cross-run isolation) killed by its named test; the map
  is itself a test, and it SHALL fail if a registered target is absent
  from the sweep rather than merely passing over a shorter list.

- [x] **7.4 Report any further L3/L2 gap**
  <!-- agent-task: 7.4 paths=openspec/changes/runner-control-orchestration/** checks=repo-check risk=low prerequisites=7.3 -->

  **Change** — Record, in the landing's report, any contract or
  core-surface gap encountered. **Report it; do not fix it here** — the
  packages are outside this landing's path authority (the allowlist
  amendment excepted, per its recorded authorization).

## PR-1 Completion Gate

The landing is complete only when every box above is checked with its
declared proof green, `repo-check` reports no failure and no skip, the
mutation sweep leaves no survivor, and the standing model's final reviews
(complete-seam semantic review plus one falsification review at the frozen
head) are recorded.

Task checkbox state is progress tracking. It is never proof and never
authorization.

---

# Additional Landings

None. L4 is one PR, and there is **no additional activation landing**: the
NestJS/Fastify shell lands INERT in this change (design D2), and post-U4
activation/placement is an operational act governed by the existing
program boundary — the concrete launcher remains L9.
