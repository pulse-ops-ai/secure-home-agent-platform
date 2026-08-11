# Change Proposal: runner-control-orchestration

## Why

L3 (#52, `runner-core`, merged PR #67) landed the trusted decision core and
stopped exactly at its boundary: pure decisions over immutable values, no
I/O, no I/O abstraction, no ordering. Every obligation L3 recorded as
"deferred, named — L4" is currently unowned:

- the **acquire-once half of INV-007** — reading each authority source
  exactly once, retaining the snapshot, independently re-acquiring for
  verification;
- the **run-lifecycle state machine** (INV-004) — today no component can
  even represent a run's phase;
- **consent-to-spend**, gate **scheduling**, cancellation and timeout
  semantics, **evidence finalization ordering** (seal last), the
  **base-identity assertion at workspace creation**, and the
  **orchestration-provenance** clause of INV-008 (ADV-018/MUT-010).

The constitution's D6 records why this is a landing of its own: the donor's
orchestration was a stateful application written as shell scripts, executing
decision-bearing logic from proposed-change-writable files. L4 is the typed
replacement — and it deliberately ships **no container launch**: the
concrete launcher remains L9, gated on U4/#9.

Evidence motivating this change:

- `openspec/specs/runner-adoption/spec.md` — the ratified contract.
- The archived constitution's design **D6** ("Orchestration leaves bash")
  and assurance traceability rows assigning EX-004, EX-005A, PROP-002,
  PROP-007, ADV-001, ADV-006/007, ADV-012, ADV-015…018, MUT-004/005/009/010
  to L4.
- The archived `runner-core` change — its § Deferred Behavior sections and
  traceability rows name L4 for every obligation this seam picks up.
- GitHub issue #27, the external authority anchor, whose decomposition
  contract fixes the state-machine vocabulary and the no-launch constraint.

## Problem

**What happens today.** `packages/runner-core` can decide anything and
sequence nothing. No component resolves a profile, acquires authority bytes,
observes a real workspace, schedules a gate, represents a run's phase, emits
the run-event stream, or seals evidence last. `services/runner-control` is a
boundary-only placeholder.

**What should be possible instead.** An orchestration service whose every
run is a typed walk through a declared state machine; that acquires each
authority source exactly once and asks `runner-core` for every decision;
that schedules only declared gates with exactly the registry's argv; that
seals evidence last; and that structurally cannot launch a container, hold a
provider SDK, or make a trust decision itself.

**Who is affected.** L5 (images) sequences behind this landing. L7 adapters
plug into the adapter-invocation port after U6. L9's launcher implements the
execution port after U4. Every future run executes through this machine.

**Consequence of leaving it unchanged.** The program stalls: L3's proofs
guard decisions nobody can invoke, and the acquire-once, ordering, and
provenance invariants stay unimplemented promises.

## Proposed Capability

`services/runner-control` as the orchestration seam of the runner program:

1. **Run lifecycle** — the typed state machine
   `REQUESTED → PROFILE_RESOLVED → ELIGIBLE → SANDBOX_STARTED → RUNNING →
   VERIFYING → EVIDENCE_SEALED → COMPLETED`, terminal branches
   `REFUSED · OPERATIONAL_FAILURE · CANCELLED · TIMED_OUT · INDETERMINATE`;
   illegal transitions rejected loudly and recorded; INDETERMINATE never
   classifies as success; consent-to-spend gates the spend transition and is
   never authority; lifecycle transitions emit the closed L2 run-event
   vocabulary.
2. **Authority acquisition** — each authority source read exactly once per
   run through the acquisition ports, snapshot retained, downstream re-reads
   structurally unexpressible; verification inputs independently
   re-acquired; the pinned base identity asserted at workspace creation,
   before any model invocation.
3. **Gate orchestration** — scheduling only identities the captured registry
   declares; executed argv exactly the registry's (a caller cannot widen);
   exactly one terminal disposition per gate identity; `SKIP_ENV` never
   normalizes to `SKIP_OK` or `PASS`; truncation is `FAIL` with the reason.
4. **Execution boundary** — every effect behind narrow ports (execution,
   adapter invocation, authority sources, workspace/artifact observation,
   evidence sink, clock); **no container launch and no Docker socket** —
   the execution port ships with deterministic in-memory implementations
   for the proof net only, and the concrete launcher is L9 (post-U4/#9);
   decision-bearing orchestration executes only from trusted
   platform-controlled code, never from the writable workspace; evidence is
   sealed last; the core/control boundary holds in both directions —
   orchestration cannot decide, decisions cannot orchestrate.

## Scope

### In scope

- `services/runner-control` as a real workspace member: the orchestration
  application core, its ports, real read-only filesystem implementations for
  authority acquisition and workspace/artifact observation, deterministic
  test implementations for execution and adapter invocation, and the proof
  net landing alongside.
- First consumption of `packages/runner-core` (and continued consumption of
  the L2 contracts), re-running the first-consumer conformance obligations.

### Out of scope

| Deferred behavior | Owner |
|---|---|
| Container launch, mounts, network enforcement, resource ceilings, real process execution | L9 (post-U4/#9) |
| Service activation: process bootstrap, HTTP surface, scheduling triggers, deployment | post-U4 activation landing |
| Provider adapters, transcript parsing, credential injection | L6/L7 (post-U6/#11) |
| Image lineage | L5 |
| Workload identity / credential custody | U2 |
| Evidence persistence location | U11 |

## Affected Areas

| Area | Impact |
|---|---|
| `services/runner-control/**` | boundary-only placeholder becomes the orchestration service: source, ports, tests, manifest |
| `pnpm-workspace.yaml`, `pnpm-lock.yaml` | dependency resolution (member already registered) |
| `packages/runner-core`, `packages/contracts`, `packages/events` | **consumed, not modified** — runner-control is runner-core's first consumer |

The C-EX-004-style inertness posture: `packages/runner-core`'s conformance
suite asserts zero importers; the authorized arrival of this consumer will
require the same kind of one-line allowlist amendment L3's arrival required
in L2's test. That amendment is **anticipated here** rather than discovered
in CI: task 1.1 records it, subject to the same owner authorization pattern.

## Governance

From the `docs/decisions/INDEX.md` "which ADRs apply" table:

- **ADR-0003** — the substrate is provider- and framework-neutral; no
  provider SDK, no provider name structural anywhere.
- **ADR-0004** — a run's claims are untrusted; orchestration passes them to
  `runner-core` reconciliation and never trusts them itself.
- **ADR-0005 / ADR-0008** — untouched: no device action, no approval flow.
- **ADR-0006** — authority comes only from a versioned execution profile;
  consent-to-spend is recorded input, never authority.
- **ADR-0007** — the routing class rides as profile data; no routing
  decision is made here.
- **ADR-0011** — no image is built or selected here beyond carrying the
  profile's digest-pinned reference as data.
- **ADR-0012** — TypeScript service under `services/`; the NestJS/Fastify
  process surface is **deferred to the post-U4 activation landing** (design
  D2): this landing ships the framework-free orchestration core so that no
  HTTP surface exists before placement (U4) is decided. Deviation-shaped
  decision, stated for the review rather than discovered later.

**Depends on U1–U11:** `none` — and it must stay that way: no placement
(U4), no workload identity (U2), no adapter SPI (U6), no persistence
location (U11). The execution port is the mechanism that keeps U4 out of
this landing.

This change proposes **no ADR status change**.

## Trust / Security / Data Considerations

| Concern | Applies | Note |
|---|---|---|
| authentication or authorization | **yes** | consent-to-spend and eligibility gating live on the spend transition; a transition bypass would be an authorization bypass |
| PII or encryption | no | digests, identifiers, and event records only |
| persistence or migrations | no | evidence goes through a sink port; storage location is U11 |
| transaction or concurrency | **yes** | one run's state machine is single-writer; concurrent transition attempts must be rejected, not interleaved |
| public package contracts | **yes** | the ports are the surfaces L7/L9 implement |
| runner / review / materialization machinery | **yes** | this is the orchestration of that machinery |
| proposed-change-set binding and evidence | **yes** | finalization ordering (seal last) is owned here |
| deployment or production isolation | no | nothing deploys, starts, or listens; no bootstrap exists |

Classification follows in `assurance.md`: **trust-critical**.

## Existing Evidence

- `openspec/specs/{runner-authority,runner-path-decisions,runner-workspace-observation,runner-evidence-derivation}/spec.md`
  — L3's canonical capability specs, each naming the L4 obligations.
- `openspec/specs/{execution-profile,runner-execution,runner-verification,runner-evidence}/spec.md`
  — the L2 contracts this orchestration feeds and records.
- `packages/runner-core/src/**` — the decision surface consumed here, and
  the value types (`AuthorityBytes`, `WorkspaceObservation`,
  `ArtifactObservation`) the acquisition and observation ports produce.
- The archived constitution's D6 and its donor defect catalog — the
  concrete failure modes this design must make unrepresentable.
- GitHub issue #27 — the external authority, recorded in `tasks.md`.

## Dependencies

**Already implemented:** L2 + corrections (contracts at v2), L3
(`packages/runner-core`, PR #67), the workspace layering machinery.

**External:** none. No new third-party dependency: the runtime dependency
set is exactly `{@secure-home/contracts, @secure-home/events,
@secure-home/runner-core}` — deliberately **without** zod, so orchestration
cannot author a contract shape (design D8).

## Success

A requested run walks the declared machine and nothing else: authority is
acquired once and decided by `runner-core`; consent without a profile
refuses before anything starts; only declared gates execute, with exactly
the registry's argv; a cancelled or timed-out run lands in its declared
terminal state with evidence sealed last; INDETERMINATE is never success;
and no code path in the service can launch a container, reach a provider
SDK, or override a decision the core made.

## Non-Goals

This change must not:

- launch a container, open a Docker socket, or execute a real subprocess —
  the execution port's only in-repo implementations are deterministic test
  fakes;
- add a process bootstrap, HTTP endpoint, queue consumer, or scheduler —
  activation is post-U4;
- import a provider SDK, Home Assistant client, OpenFGA client, database
  client, or any framework;
- re-implement, wrap-and-modify, or second-guess any `runner-core`
  decision;
- select workload identity (U2), placement (U4), adapter SPI (U6), or
  evidence persistence (U11);
- modify `packages/contracts`, `packages/events`, or `packages/runner-core`
  — with the single anticipated exception of the runner-core
  first-consumer allowlist amendment, which follows the recorded L3
  precedent and its authorization pattern.

## Open Questions

Carried into the planning review:

- **OQ1 — real filesystem acquisition in L4 (trust-relevant).** This
  proposal ships REAL read-only filesystem implementations for authority
  sources and workspace/artifact observation (they are reads, not
  execution), while execution and adapter invocation ship as test fakes
  only. Confirm this read/execute asymmetry, or direct that all real I/O
  wait for later landings.
- **OQ2 — bootstrap deferral versus ADR-0012.** ADR-0012 prescribes
  NestJS/Fastify for services; this seam ships a framework-free
  orchestration core and defers the process surface to a post-U4
  activation landing, so no HTTP surface exists before placement is
  decided. Confirm this reading of ADR-0012 (deferral, not deviation), or
  direct that the NestJS shell land now.
- **OQ3 — run-event emission scope.** This seam emits the closed L2
  run-event vocabulary from lifecycle transitions through the event sink
  port. Confirm that emission belongs to L4 (the alternative — deferring
  emission to activation — leaves evidence without its event stream).
