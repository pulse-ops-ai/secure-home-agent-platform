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

**Cross-authority amendment GRANTED — L3 correction, terminal
classification.** Task 7.4 reported an L3 core-surface gap: provider
terminal-observation classification had no owner in `runner-core`, so
`runner.ts` carried a local `describeTerminalDisagreement` deciding, on
orchestration's authority, that a clean exit alongside a kill signal
means the terminal state cannot be established. That contradicts
`runner-execution-boundary` (trust decisions originate in the core;
orchestration decides nothing) and ADR-0013 decision 3 (provider
terminal observations are observational input; the platform lifecycle
owns classification), and it is what a provider-adapter landing would
have inherited.

| Field | Value |
|---|---|
| Granted by | repository owner (@mikegtech) — owner decision record, PR #82 comment of 2026-08-14: <https://github.com/pulse-ops-ai/secure-home-agent-platform/pull/82#issuecomment-5296490942>, item 3 |
| Scope | add `classifyTerminalObservations` to `packages/runner-core`, with its own proofs; consume it from `runner-control` and delete the local algorithm |
| Paths added | `packages/runner-core/src/outcome/**`, `packages/runner-core/src/index.ts` |
| Not granted | any other change to `packages/**`; the decision's SHAPE stays the core's and the SPI stays frozen in `ports/values.ts` per ADR-0013 |

**OWNER DECISION RECORDED — attempt outcome vs logical-run lifecycle.**

| Field | Value |
|---|---|
| Granted by | repository owner (@mikegtech) — owner decision record, PR #82 comment of 2026-08-14: <https://github.com/pulse-ops-ai/secure-home-agent-platform/pull/82#issuecomment-5296490942>, item 1 |
| Decision | an orchestration ATTEMPT that loses ownership ends `ownership_lost` without manufacturing a lifecycle terminal; the logical run's terminal belongs to the new holder |
| Recorded in | `design.md` D12; `specs/runner-lifecycle/spec.md` scenario "A dispossessed attempt ends without claiming a run terminal" |
| Proven by | RO-INV-62, RO-EX-108 |

**OWNER DECISION RECORDED — terminal settlement failure is an attempt conclusion.**

| Field | Value |
|---|---|
| Granted by | repository owner (@mikegtech) — owner decision record, PR #82 comment of 2026-08-14: <https://github.com/pulse-ops-ai/secure-home-agent-platform/pull/82#issuecomment-5296490942>, item 2. An earlier revision of this cell quoted relayed third-party assessment text as the grant; an assessor's recommendation is not owner authority, so the owner recorded the decision in their own verifiable comment and this cell points there. |
| Decision | when finite terminal settlement cannot make the mandatory governed record durable, return `settlement_failed` carrying actual state, intended terminal, and `produced: none`; do not present it as a lifecycle terminal |
| Recorded in | `design.md` D12; `specs/runner-lifecycle/spec.md` requirement "Terminal settlement failure is explicit" |
| Proven by | RO-INV-62/73, RO-EX-143/146 |

Recorded here because `assurance.md` states outright that it does not
create product requirements — a new public result vocabulary introduced
there alone was backwards for this repository's own model.

**REPORTED L3 GAP — established provider failure has no representation.**
Task 7.4, reported and NOT fixed here.

`classifyTerminalObservations` answers one question — do these
observations contradict each other — and returns `{ established: true }`
for everything else. Its own comment says a non-zero exit with no
success claim is "a run that failed", and then that fact has nowhere to
go: `running.ts` reads `established: true` as permission to continue, so
a provider that exited 3 can still seal `COMPLETED` if the gates and
verification pass.

L4 must not invent the answer. ADR-0013 decision 3 makes the provider's
values observations and gives the terminal vocabulary to the lifecycle,
and the terminal an established failure deserves — probably
`OPERATIONAL_FAILURE` — is a core decision, not an orchestration one.

What the core surface needs is a third answer, not a boolean:

| Result | Meaning |
|---|---|
| contradictory | the terminal cannot be established (today's `established: false`) |
| established failure | the observations agree the run failed |
| established non-failure | the observations agree, and do not say it failed |

Unchanged from the merge base, so this is a pre-existing gap surfaced by
the decomposition rather than a regression. Recorded for the owner; no
`packages/**` change is made under this landing's authority.

No consumer-allowlist amendment was needed after all:
`services/runner-control` is already the authorized first consumer in
`packages/runner-core/src/conformance/architecture.test.ts`.

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

- [x] **7.5 Close round-6 interruption-coordinator findings**
  <!-- agent-task: 7.5 paths=services/runner-control/**,openspec/changes/runner-control-orchestration/** checks=repo-check risk=high prerequisites=7.4 -->

  **Implements** — the `runner-lifecycle` rule that a non-returning
  operation cannot hold the run open, without abandoning a continuation
  that can later resume; the deadline covers ownership, the walk,
  terminal settlement, and cleanup; the profile budget is absolute and
  shortening-only.

  **Proof required** — the reviewer-supplied
  `conformance/falsification-round6.test.ts` keeps every assertion and
  fixture unchanged and is green: all ten findings plus six controls.
  Formatting-only line wrapping is permitted so the repository format
  gate remains honest. The complete pre-existing suite, typecheck, lint,
  build, strict OpenSpec validation, and repository gate remain green.

- [x] **7.6 Close round-7 settlement, history, ownership, and recovery findings**
  <!-- agent-task: 7.6 paths=services/runner-control/**,openspec/changes/runner-control-orchestration/** checks=repo-check risk=high prerequisites=7.5 -->

  **Implements** — truthful settlement provenance; cancellation/timeout
  precedence while a run remains non-terminal; mint-time immutable
  transition/rejection history; neutral interruption identity; late lease
  cleanup; bounded recovery; and D11's full-bundle rule for every
  post-authority terminal.

  **Proof required** — `conformance/falsification-round7.test.ts` is green
  in full, alongside the unchanged round-6 suite; the mutation map and D13
  describe only the port-bound architecture; complete tests, typecheck,
  lint, build, strict OpenSpec validation, and repository gate remain
  green.

- [x] **7.7 Close round-8 terminal-truth and authority findings**
  <!-- agent-task: 7.7 paths=services/runner-control/**,openspec/changes/runner-control-orchestration/** checks=repo-check risk=high prerequisites=7.6 -->

  **Implements** — incremental terminal evidence without weakening the
  total verification typestate; lifecycle-control propagation at journal
  boundaries; exactly-once session interruption; cancellation/timeout
  precedence through recovery publication; guard-owned, resource-abortable
  lease claims; explicit `settlement_failed`; and synchronous enforcement
  of the absolute expiry.

  **Proof required** — `conformance/falsification-round8.test.ts` is green
  in full, alongside every earlier falsification round; the mutation map,
  lifecycle delta, D13, and assurance artifact describe the same public
  conclusion and authority model; complete tests, typecheck, lint, build,
  strict OpenSpec validation, and repository gate remain green.

- [x] **7.8 Close round-9 acquisition-protocol and boundary-symmetry findings**
  <!-- agent-task: 7.8 paths=services/runner-control/**,openspec/changes/runner-control-orchestration/** checks=repo-check risk=high prerequisites=7.7 -->

  **Authorized by** — the repository owner's round-9 review of PR #82 head
  `fc578153` (2026-08-14): REQUEST_CHANGES with the `terminate.ts` type
  regression, four P1s (lease attempt identity and grant-before-ack
  resolution; pending rejections gating the seal; absolute expiry enforced
  when a call returns; D7 still describing the removed compensation
  architecture) and the `settlement_failed` provenance cleanup.

  **Implements** — per-attempt unique lease claim identities;
  `RunLeasePort.abandon` so an unawaited claim is resolved at the
  resource, with attempt-state and idempotent-replay semantics in the
  in-memory lease; the pre-seal journal gate derived from every pending
  category (`pendingJournalIsEmpty`); post-return expiry symmetry at the
  ordinary and recovery call boundaries; the D7 rewrite to the staged
  shared-visibility model with a structural design guard; and the
  narrowed-terminal-result fix that restores the exact-head typecheck.

  **Disclosure** — the reviewed head `fc578153` failed `tsc` in CI, so its
  test job never ran; running its suite locally exposed two additional
  regressions that commit had introduced and CI never caught (a throwing
  clock killed the very recovery path recording it, reaching
  `settlement_failed` at `SANDBOX_STARTED` instead of `INDETERMINATE`; the
  hung-session proof's one-millisecond budget expired at an earlier call
  boundary once expiry became enforced everywhere, so the hang under test
  was never reached). Both are fixed in this task: terminalization and the
  terminal envelope read the clock through the machine's unestablished
  fallback, and the hung-session proof uses a budget the pre-session
  phases fit inside.

  **Proof required** — `conformance/falsification-round9.test.ts`
  (RO-EX-148…152, including the in-memory lease's attempt-state proofs) is
  green in full, alongside every earlier falsification round; RO-MUT-87…92
  are registered and each hand-applied mutant is killed by its named
  proof; complete tests, typecheck, lint, build, strict OpenSpec
  validation, and repository gate remain green.

- [x] **7.9 Close round-10 acknowledged-effect, outbox, and provenance findings**
  <!-- agent-task: 7.9 paths=services/runner-control/**,openspec/changes/runner-control-orchestration/** checks=repo-check risk=high prerequisites=7.8 -->

  **Authorized by** — the repository owner's round-10 relay on PR #82 head
  `8d9c580` (2026-08-14): REQUEST_CHANGES with three P1s at the edges of
  round 9's own abstractions (the post-return expiry rule applied to the
  irreversible finalization commit; "every journal category" still meaning
  only transitions and rejections; a released attempt's replay minting a
  fresh generation) and one governance blocker (owner authority recorded
  from reviewer text).

  **Implements** — finalization as an acknowledged effect: `CallGuard`
  split into `call` (late results discarded) and `commit` (entry-checked,
  raced for boundedness, acknowledgement accepted), with the absolute
  expiry stamped into the commit by the boundary and enforced
  synchronously at the publication point inside `TransactionalFinalization`;
  one `JournalOutbox` through which all four journal categories flow, with
  per-entry retry and the seal gate asking the single pending set;
  spent-attempt resolution at the in-memory lease (a replay after release
  refuses; it never mints); and the RO-EX-156 structural check that every
  `Granted by` entry cites a verifiable owner-authenticated record.

  **Proof required** — `conformance/falsification-round10.test.ts`
  (RO-EX-153…156) is green in full, alongside every earlier falsification
  round; RO-MUT-93…97 are registered and each hand-applied mutant is
  killed by its named proof; complete tests, typecheck, lint, build,
  strict OpenSpec validation, and repository gate remain green.

- [x] **7.11 Close round-11 asynchronous-effect-semantics findings**
  <!-- agent-task: 7.11 paths=services/runner-control/**,openspec/changes/runner-control-orchestration/** checks=repo-check risk=high prerequisites=7.9 -->

  **Authorized by** — the repository owner's decision record on PR #82,
  "asynchronous effect semantics and durable conclusions (L4)",
  2026-08-14: <https://github.com/pulse-ops-ai/secure-home-agent-platform/pull/82#issuecomment-5298925660>.
  The reviewer-authored round-11 REDs (RO-EX-157…161, commit `2bc7258`)
  were consumed unmodified; implementation began only after the owner
  record existed — the missing-record case was reported as
  OWNER_AUTHORITY_MISSING first, per the protocol.

  **Implements** — the five owner decisions as semantic classes: the
  complete per-method effect table (`orchestration/effects.ts`, design
  D14) computed from `Ports` and consumed by the composition boundary;
  stable caller-known identities with idempotent replay for journal
  facts (outbox `entry_id`, journal replay ledger); fact-before-
  acknowledgement accounting for call operations; the caller-owned
  finalization `commit_id` with published-identity reconciliation and
  the `already_committed` refusal; the conclusion-durability gate in
  `conclude()` (terminal, early-terminal, and held alike); and
  attempt-vs-governed expiry provenance (`expires_at_bound`,
  `attempt_expired`) so a settlement/recovery ceiling reports
  settlement failure with the intended terminal standing instead of
  manufacturing TIMED_OUT.

  **Disclosure** — one round-10 proof was updated under the owner
  decision it predated: RO-EX-154's hold case asserted `kind: 'held'`
  for a hold whose journal fact never landed; decision 4 defines `held`
  as a durable resumable identity, so the proof now asserts the
  conclusion claims neither `held` nor a terminal, with its reasoning
  recorded in place. The reviewer-authored round-11 file was not
  modified.

  **Proof required** — `conformance/falsification-round11.test.ts` is
  green in full and unmodified, alongside every earlier falsification
  round; RO-INV-85…89, RO-EX-157…161, and RO-MUT-98…104 are registered
  and each hand-applied mutant is killed by its named proof; complete
  tests, typecheck, lint, build, strict OpenSpec validation, and
  repository gate remain green.

- [x] **7.12 Close round-12 D14 public-contract findings**
  <!-- agent-task: 7.12 paths=services/runner-control/**,openspec/changes/runner-control-orchestration/** checks=repo-check risk=high prerequisites=7.11 -->

  **Authorized by** — the same owner decision record as 7.11
  ("asynchronous effect semantics and durable conclusions",
  <https://github.com/pulse-ops-ai/secure-home-agent-platform/pull/82#issuecomment-5298925660>);
  round 12 makes the accepted semantics exact, minting no new policy.
  The reviewer-authored RED commit `48f28e38ee9c17db59d1091a695dc75a8fc9e585`
  (based exactly on the reviewed head `aed223e`) was consumed unmodified.

  **Implements** — the winning deadline as one typed value
  (`WinningExpiry`; every stamp a projection, RO-EX-163); canonical
  logical-intent replay equivalence in finalization (RO-EX-162); event
  sequence identity allocated before the durable effect and carried as
  an explicit sink-request field (RO-EX-164); evidence `record_id` with
  sink-side replay (RO-EX-165); required-by-type effect identities
  across the SPI with compiler-shaped proofs (RO-EX-169) — journal
  `entry_id`, event `sequence`, evidence `record_id`, caller-minted
  `session_ref`/`workspace_ref` acquisition identities, non-empty
  materialization change sets, identified terminal-event bodies — and
  caller-identity resource binding in the reference implementations
  with interrupted-acquisition resolution at teardown
  (RO-EX-170/171, `RunScope.sessionAttempt`/`workspaceAttempt`).

  **Disclosure and adjudication.** Three reviewer REDs
  (RO-EX-166/167/168) initially remained RED for reasons in their
  fixtures rather than in production: 166/167 asserted teardown by a
  name the fixture minted internally — existing only inside the lost
  acknowledgement, ignoring the caller-known identity the corrected
  contract requires — and 168 invoked a deliberately non-conforming
  port body directly, with no production seam between the test and its
  unconditional recording. They were not weakened or bypassed; the
  implementation was pushed with them failing and reviewer
  adjudication requested. The reviewer adjudicated all three as
  `REVIEWER_FIXTURE_INVALIDATED_BY_CONTRACT_FIX` and issued the
  reviewer-only correction
  `7eb9d34f3e0dd341799cd5e6e7507d21345840e9` (parent `6093b83`)
  touching only
  `falsification-round12.test.ts`: the session/workspace fixtures now
  bind their physically-created resources to the caller-supplied
  identities while still losing the acknowledgement, and the apply-back
  proof wraps the shipped reference implementation in a
  lost-acknowledgement decorator. All nineteen round-12 proofs are
  green with no production change.

  **Proof required** — RO-EX-162…165 and 169…171 green with the
  reviewer file unmodified (`git diff 48f28e3 -- …round12.test.ts`
  empty); RO-INV-90…92 and RO-MUT-105…110 registered, each mutant
  hand-applied and killed by its named proof; every prior falsification
  round green; complete tests, typecheck, lint, build, strict OpenSpec
  validation, and repository gate green at the pushed head.

- [x] **7.13 Close round-13 conflicting-replay and boundary-authority findings**
  <!-- agent-task: 7.13 paths=services/runner-control/**,openspec/changes/runner-control-orchestration/** checks=repo-check risk=high prerequisites=7.12 -->

  **Authorized by** — the same owner decision record as 7.11/7.12
  (<https://github.com/pulse-ops-ai/secure-home-agent-platform/pull/82#issuecomment-5298925660>);
  all three findings are mechanical conformance to D14. The
  reviewer-authored RED commit
  `9d382a19c5c1a3436fb64b2a86e7d34b69c293c8` (parent `d3ed530`, the
  reviewed head) was preserved as its own commit and consumed
  unmodified.

  **Implements** — replay validity as identity AND canonical intent,
  one shared mechanism per store: the journal classifies every append
  across all four categories (cross-category collisions conflict), the
  evidence sink canonicalizes kind + payload, and the materialization
  reference applies the identical rule (the same ID-only class defect
  found one port over during the mandated audit). `FenceOutcome` and
  `ApplyBackOutcome` gained the narrow `conflicting_replay` refusal —
  distinct from `stale_fence` — with fail-closed handling: a
  conflicting journal entry stays pending (the durability gate blocks),
  and a conflicting evidence write concludes without a durability claim
  and without declaring the fence lost. The early-terminal record is
  built once per attempt and retried verbatim so legitimate settlement
  retries stay exact replays. `guardPorts` stamps the winning expiry
  UNCONDITIONALLY — caller-supplied expiry metadata is stripped, never
  preferred. Audit: events and finalization already canonical
  (preserved); the only production `finalization.commit` call site
  crosses the guarded seam.

  **Proof required** — the reviewer round-13 file green and unmodified
  (`git diff 9d382a19 -- …round13.test.ts` empty); RO-INV-93 and the
  RO-INV-90 amendment registered with RO-EX-172…176 and
  RO-MUT-111…116, each mutant hand-applied and killed by its named
  proof; every prior falsification round green; complete tests,
  typecheck, lint, build, strict OpenSpec validation, and repository
  gate green at the pushed head.

- [x] **7.14 Close round-14 conflicting-event-replay finding**
  <!-- agent-task: 7.14 paths=services/runner-control/**,openspec/changes/runner-control-orchestration/** checks=repo-check risk=high prerequisites=7.13 -->

  **Authorized by** — the same owner decision record as 7.11…7.13
  (mechanical D14 conformance). The reviewer-authored RED commit
  `d2c8db60d024c04c7d324753c3cb2595ee77850c` (parent `8b2a52b`, the
  reviewed head) was fast-forwarded onto the branch as its own commit
  and consumed unmodified.

  **Implements** — `EmitOutcome` widened with the type-visible
  `conflicting_replay` reason; the emitter's sequence state machine made
  explicit per outcome (validation failure allocates nothing; a
  definitive stale-fence refusal reclaims; a throw or lost
  acknowledgement keeps the allocation; an exact replay succeeds at the
  occupied identity; a conflicting replay keeps the identity consumed
  and moves the emission to the next fresh identity — never rewinding,
  never masquerading as ownership loss). The reference event sink now
  answers a conflicting replay with the typed refusal instead of
  throwing, so callers can tell an occupied identity from a broken
  sink. Consumer audit found no other FenceOutcome collapse: every
  fence-loss site already keys on `stale_fence` specifically
  (round-13's work), and only the emitter had the defect.

  **Disclosure** — one deviation from the round-14 instruction prose:
  "propagate conflicting_replay as its own event-emission failure" and
  the RED's requirement that the very emission which discovers the
  occupied identity SUCCEEDS at N+1 cannot both hold; the RED is
  authoritative, so the emitter advances past occupied identities and
  the typed reason remains in the public vocabulary for sinks and
  alternative emitters. One prior proof of mine (RO-EX-171's conflict
  case in `effect-identity.test.ts`) was updated from expecting a throw
  to expecting the typed refusal, with the reasoning recorded in place.

  **Proof required** — the reviewer round-14 file green and unmodified
  (`git diff d2c8db60 -- …round14.test.ts` empty); RO-EX-177 and
  RO-MUT-117 registered, the mutant hand-applied and killed; every
  prior falsification round green; complete tests, typecheck, lint,
  build, strict OpenSpec validation, and repository gate green at the
  pushed head.

- [x] **7.15 Close round-15 terminal-staging identity findings**
  <!-- agent-task: 7.15 paths=services/runner-control/**,openspec/changes/runner-control-orchestration/** checks=repo-check risk=high prerequisites=7.14 -->

  **Authorized by** — the same owner decision record (mechanical D14
  conformance). Both reviewer-only commits were preserved as distinct
  provenance: `64e26c0396d3e5a1dc4f888182746d98412f1571` (round-15
  REDs) and `9162915cb2863728704549f931222b75f7ec5fb3` (their SPI
  correction), consumed unmodified.

  **Implements** — the staged terminal event answers to the SAME
  (run, sequence) event-domain identity authority as ordinary emission:
  `stageEmit` consults the one durable ledger (`#durableCanonical`,
  covering ordinary landings AND published staged events), reserves the
  identity invisibly on staging, refuses a conflicting stage as
  `conflicting_replay` before publication, stages nothing for an exact
  already-durable replay, and releases only the unpublished reservation
  on abandon. `Staging` and `CommitOutcome` both represent
  `conflicting_replay`, preserved from participant to commit caller.
  `FinalizationCommit.commit_id` is REQUIRED by the public type; the
  adapter's `(run, generation, terminal)` derivation fallback is
  removed.

  **Disclosures** — (1) Four older reviewer proof files
  (rounds 10…13) construct `FinalizationCommit` literals; the mandated
  required-identity change added exactly one `commit_id` field to each
  (round-12's deliberately shared per-generation so RO-EX-162's
  aliasing probe still exercises the same-identity/different-intent
  branch); no assertion changed. (2) Sibling-path audit per
  instruction: `journal.stageTransitions` stages the terminal tail
  without entry identities and `evidence.stageWrite` stages the bundle
  without a record identity — in both, replay protection comes from the
  commit's canonical intent rather than the store's own domain ledger.
  No executable or normative proof currently requires those staged
  facts to carry store-domain identities, so per instruction they were
  NOT changed; the observation is disclosed here for fresh
  falsification.

  **Proof required** — the reviewer round-15 file green and unmodified
  (`git diff 9162915 -- …round15.test.ts` empty); RO-EX-178/179 and
  RO-MUT-118…120 registered, each mutant hand-applied and killed
  (RO-MUT-120 at typecheck); every prior falsification round green;
  complete tests, typecheck, lint, build, strict OpenSpec validation,
  and repository gate green at the pushed head.

- [x] **7.16 Close round-16 staging-identity and in-flight-finalization findings**
  <!-- agent-task: 7.16 paths=services/runner-control/**,openspec/changes/runner-control-orchestration/** checks=repo-check risk=high prerequisites=7.15 -->

  **Authorized by** — the same owner decision record (mechanical D14
  conformance). Reviewer provenance preserved as distinct commits:
  `52c9bf02ffeb2735350b517a5dcf4b503d3a29a4` (round-16 REDs, parented
  on the reviewed head `339a308`) and
  `ee91e3cca86d346a4a86a2dddd6f574337c074c8` (the reviewer-only
  correction isolating the in-flight identity proof), consumed
  unmodified.

  **Implements** — three identities, three jobs: the staged event's
  (run, sequence) identity made STRUCTURAL in `stageEmit` and
  `FinalizationCommit.event` (the envelope owns its sequence; optional
  enforcement is unrepresentable); the staged replay state machine with
  canonical-equality conflicts (transaction-identity equality never
  excuses a different domain fact), no twin rows on exact replay, and
  scoped idempotent abandon; and `TransactionalFinalization`'s
  in-flight ownership — synchronous entry ledger binding one canonical
  intent per in-flight commit identity (single-flight join for exact
  concurrent replays; conflicting intent refused with NO staging), one
  terminal transaction per in-flight generation (claimed at entry when
  free, enforced at the publication gate where the reviewer proofs
  place it — a competing commit stages invisibly and refuses
  `already_committed` before it can publish), and the persistent
  authority established in the same synchronous section as the marker
  so IN_FLIGHT passes to PUBLISHED with no free interval.

  **Disclosures** — (1) The mandated structural-sequence change added
  exactly one `sequence` field to event literals in five proof files
  (reviewer rounds 10…13 and 15) plus two of this landing's own
  conformance files and one fixture type; no assertion changed. (2) The
  instruction's entry-model sketch refuses a different-identity commit
  at entry, but the reviewer proof requires that commit to REACH
  staging (`await events.secondStaged`); the RED is authoritative, so
  the claim is taken at entry when free and enforced at the publication
  gate. (3) The first application of the generation-gate mutant removed
  only the owner check and SURVIVED (the gate's finalized re-check
  caught it) — the registered RO-MUT-125 removes both checks and is
  killed; the weak application is recorded here as the lesson it is.

  **Proof required** — the reviewer round-16 file green and unmodified
  (`git diff ee91e3c -- …round16.test.ts` empty); RO-INV-94,
  RO-EX-180…184, and RO-MUT-121…126 registered, each mutant
  hand-applied and killed (RO-MUT-121 at typecheck); every prior
  falsification round green; complete tests, typecheck, lint, build,
  strict OpenSpec validation, and repository gate green at the pushed
  head.

- [x] **7.17 Close round-17 staged-ownership and shared-authority findings**
  <!-- agent-task: 7.17 paths=services/runner-control/**,openspec/changes/runner-control-orchestration/** checks=repo-check risk=high prerequisites=7.16 -->

  **Authorized by** — the same owner decision record (mechanical D14
  conformance), plus the explicit in-session owner blessing of
  `ed745e14986373cb0757a07d304f700daa1085cc` as the complete round-17
  RED packet (superseding the earlier packet anchored at `7b71a006`).
  Reviewer provenance preserved as distinct commits:
  `7b71a0060696e7888fee4e105d51972b072f6f66` (round-17 REDs, parented
  on the reviewed head `66b9b40`) and `ed745e149…` (the owner-blessed
  follow-up adding the ordinary-emission proof), consumed unmodified.

  **Implements** — canonical durable-fact equivalence is not ownership
  of unpublished staging state. The event sink's reservation became one
  canonical per identity with per-transaction stages: same-commit exact
  replay is one row; different-commit same-canonical stagings are
  independent per-commit rows under the shared reservation; any
  different canonical refuses `conflicting_replay` whatever its
  transaction identity. Each `StagedWrite`'s abandon is scoped to the
  stage its label names (publish-guarded, idempotent, row-by-reference
  release), and a cross-transaction replay is acknowledged only with
  its OWN stage — never a borrowed handle over another transaction's
  row. Ordinary `emit` consults the live reservations through the same
  authority and refuses a different canonical at a reserved identity.
  Scope confined to `adapters/deterministic.ts`; Round-16's
  finalization ownership model is untouched.

  **Disclosures** — (1) The reviewer files are consumed byte-frozen
  (`git diff ed745e14 -- …round17.test.ts` empty). (2) The exact
  ordinary-versus-staged replay cell is NOT decided: `emit` of the SAME
  canonical as an unpublished stage falls through to today's behavior
  untouched, and the minimal implementation never forced the choice —
  so no `OWNER_DECISION_REQUIRED_EXACT_ORDINARY_STAGED_REPLAY` stop was
  needed and the cell stays open for a future owner decision.

  **Proof required** — the reviewer round-17 file green and unmodified;
  the blessed baseline reproduced exactly (3 RED / 2 GREEN) before any
  production change; RO-INV-95, RO-EX-185…188, and RO-MUT-127…131
  registered, each mutant hand-applied and killed; every prior
  falsification round green; complete tests, typecheck, lint, build,
  strict OpenSpec validation, and repository gate green at the pushed
  head.

- [x] **7.18 Close round-18 exact staged-versus-ordinary durable-uniqueness finding**
  <!-- agent-task: 7.18 paths=services/runner-control/**,openspec/changes/runner-control-orchestration/** checks=repo-check risk=high prerequisites=7.17 -->

  **Authorized by** — the same owner decision record (mechanical D14
  conformance); the round-18 instruction classifies the closure
  `MECHANICAL_CONFORMANCE_FIX`. Reviewer provenance preserved as three
  distinct commits parented on the reviewed head `636535c`:
  `4cff8ab7901c1b49f53e8bc675715e6765bf5a4b` (round-18 RED),
  `e9a7bfc23f3c615225a5bdc29cb8afd0631b6aa0` (acknowledgement control),
  `d1adf5ebfe62cb553529f7f5e062c1adeb7148ea` (corrected acknowledgement
  control), consumed unmodified.

  **Implements** — one event-domain identity carries at most one
  durable physical event fact on every creation path. An unpublished
  stage is not durable, so it cannot back an acknowledged ordinary
  effect: when ordinary `emit` lands the exact canonical a live
  reservation holds, the landing becomes the durable fact and every
  equivalent unpublished stage retires through the existing scoped
  release (publish-guarded, row-by-reference). A staged sibling that
  later publishes exposes no second row; a sibling that abandons
  releases only its own stage and cannot erase the acknowledged event.
  The acknowledgement disposition of the exact cell stays open (this
  implementation keeps today's `ok`); durable uniqueness and
  acknowledgement truthfulness do not. Scope confined to the exact-
  canonical branch of `emit` in `adapters/deterministic.ts`;
  different-canonical conflicts, Round-17 per-transaction stage
  ownership, and Round-16 finalization semantics untouched.

  **Disclosures** — (1) The reviewer files are consumed byte-frozen
  (`git diff d1adf5e -- …round18.test.ts` empty; round-17 and round-16
  files verified unchanged from their approved reviewer heads). (2) The
  mandated R18-MUT-C (partial retirement) is killed ONLY by this
  landing's own RO-EX-191 — every reviewer round-18 proof passes under
  it, because the reviewer interleavings stage a single sibling; the
  registered proof exists precisely to close that seam.

  **Proof required** — the reviewer round-18 file green and unmodified;
  the approved baseline reproduced exactly (1 RED / 8 GREEN, the sole
  RED being the two-durable-rows exposure) before any production
  change; RO-INV-96, RO-EX-189…191, and RO-MUT-132…134 registered, each
  mutant hand-applied and killed; every prior falsification round
  green; complete tests, typecheck, lint, build, strict OpenSpec
  validation, and repository gate green at the pushed head.

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
