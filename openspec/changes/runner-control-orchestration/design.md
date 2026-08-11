# Design: runner-control-orchestration

## Context

L3 landed the trusted decision core as a pure, value-boundary package and
recorded — by name — every obligation that belongs to its orchestrator:
acquire-once, real observation, seal ordering, lifecycle, gate scheduling,
orchestration provenance, the base-identity assertion. Constitution D6
fixes the shape of the replacement: a typed run-lifecycle state machine in
`services/runner-control`, with the responsibility split "runner-core =
decisions, runner-control = orchestration" and the donor defect catalog as
the anti-specification.

The architectural split, unchanged:

```text
runner-core     trusted decisions                        (L3, landed)
runner-control  orchestration                            (THIS LANDING)
adapter         provider translation                     (L7, post-U6)
profile         authority                                (data)
sandbox         untrusted execution                      (L9, post-U4)
```

Governing material: `openspec/specs/runner-adoption/spec.md`; the canonical
L3 capability specs; the archived constitution D6 and its assurance
traceability; ADR-0003/0004/0006/0007/0011/0012; issue #27.

## Goals

- A run lifecycle that is a typed, total, loudly-failing state machine —
  never lifecycle-by-grep, never exit-code-by-convention.
- Acquire-once as a mechanism (a consumed token), not a discipline.
- Every effect behind a port; no container-launch capability anywhere.
- Orchestration that structurally cannot decide, author schemas, or execute
  workspace bytes as logic.
- The proof net landing alongside, per the standing model.

## Non-Goals

- No container launch, Docker socket, or real subprocess execution.
- No listener, no executed bootstrap, no trigger, queue, or scheduler —
  the NestJS shell lands INERT (D2); activation is a post-U4 operational
  act.
- No provider SDK, adapter implementation, or transcript parsing (L6/L7).
- No U2/U4/U6/U11 decision.
- No modification of the L2/L3 packages beyond the anticipated
  first-consumer allowlist amendment (proposal § Affected Areas).

## Current Architecture

`packages/runner-core` (layer 3) exports the trusted operations —
`captureAuthority`, `compareBaseIdentity`, `decideEligibility`,
`decideMaterialization`, `deriveAuthoritativeChangeSet`, `reconcileClaims`,
`constructEvidence`, `decideSealEligibility`, `classifyEvidenceFailure`,
`verifyEvidence`, `consumeVerified` — over immutable value types
(`AuthorityBytes`, `WorkspaceObservation`, `ArtifactObservation`). Its
conformance suite asserts zero importers; this landing is the authorized
first consumer and anticipates the allowlist amendment (the L3-arrival
precedent in L2's C-EX-004).

`services/runner-control` is a boundary-only placeholder: manifest, empty
module, README, no dependencies beyond tooling.

## Proposed Architecture

```text
services/runner-control/src/
  lifecycle/       the typed state machine: states, transition table,
                   transition function, rejection recording
  consent/         consent-to-spend records and the spend gate
  acquisition/     acquire-once tokens; profile resolution;
                   independent re-acquisition for verification
  scheduling/      gate plan construction from the captured registry;
                   disposition recording (one per identity)
  observation/     workspace/artifact observation orchestration
  finalization/    evidence assembly ordering; seal-last enforcement
  events/          run-event emission from lifecycle transitions
  ports/           the port INTERFACES (execution, adapter, sources,
                   observers, sinks, clock) and their value shapes
  adapters/        port IMPLEMENTATIONS shipped by this landing:
                   fs-read-only sources + observers; deterministic
                   in-memory execution/adapter/sink/clock fakes
  app/             the INERT NestJS/Fastify application shell: module
                   tree + composition boundary; no listener, nothing
                   executes it (D2)
  runner.ts        the framework-free composition root (pure wiring)
  index.ts         the service's typed surface
```

### Decisions

### D1: The lifecycle is a data-declared, total state machine

States and transitions are DATA — a declared transition table — and the
transition function is total: `(state, event) → next state | recorded
rejection`. Illegal pairs are rejected loudly and recorded; terminal states
accept nothing. The donor's failure modes (lifecycle-by-grep, hand-rolled
INDETERMINATE, propagation-by-convention) are unrepresentable because state
is a closed discriminated union and advancement is only through the one
transition function.

Rejected: encoding the lifecycle implicitly in the call graph — that is
exactly the donor's shape, and it cannot prove PROP-002 (every undeclared
pair rejected).

### D2: Framework-free orchestration modules inside an INERT NestJS/Fastify application shell (OQ2, resolved per review)

The planning review rejected an untracked post-U4 "activation landing"
(#19 has no such landing, and ADR-0012 already selected the stack). As
directed, this landing ships BOTH:

- the orchestration domain modules framework-free — plain typed modules,
  deterministic to prove, exactly as before; and
- the **inert NestJS/Fastify application shell now**: the Nest module tree
  and composition boundary that wires ports and core into the
  application — with **no listener, no `main` bootstrap executed by
  anything, no launcher, no deployment**. Importing the shell instantiates
  nothing and binds no socket; RO-EX-07 proves it.

Activation — actually starting the process, triggering, placement — stays
gated on U4 as an operational act on the already-landed shell, not as a
new landing. The dependency allowlist widens accordingly (D8): the
ADR-0012 framework set is admitted; zod, client SDKs, and container
runtimes remain excluded.

### D3: Ports are interfaces owned here; implementations are split read/execute (OQ1)

The port set: `AuthoritySourcePort`, `WorkspaceObserverPort`,
`ArtifactObserverPort`, `ExecutionPort`, `AdapterInvocationPort`,
`EventSinkPort`, `EvidenceSinkPort`, `ClockPort`. All orchestration logic
depends only on the interfaces; implementations are injected at the
composition root.

Shipped implementations follow a read/execute asymmetry:

- **Real, read-only filesystem implementations** for authority sources and
  workspace/artifact observation — acquisition and observation are reads,
  they produce exactly the L3 value types, and L4 owns them (the L3 seam's
  deferred-behavior sections say so explicitly).
- **Deterministic in-memory implementations only** for execution and
  adapter invocation — anything that would RUN something stays fake until
  L9 (execution, post-U4) and L7 (adapters, post-U6). No implementation in
  this landing spawns a process.

Accepted by the planning review (OQ1): real read-only acquisition and
observation are appropriate for L4; execution and adapter implementations
remain deterministic fakes with no spawn or container capability.

### D4: Acquire-once is a consumed token, in exactly two declared epochs

Each run has exactly two `AcquisitionSet`s, one per declared epoch
(review blocker 1's resolution, normative in
`runner-authority-acquisition`):

- the **production set**, consumed before `PROFILE_RESOLVED` is entered —
  one single-use token per source; consuming a token performs the one
  host read and returns the L3 `AuthorityBytes` value; a consumed token
  cannot be consumed again (structural error naming source and epoch, no
  host read);
- the **verification set**, constructed only when verification begins,
  with its own single-use tokens — the mechanism that makes
  "independently acquired, afresh" true rather than asserted.

Honest counting: a source is read at most twice per run — once per epoch,
never twice within one. Downstream production components receive
SNAPSHOTS (`CapturedAuthority` results), never tokens; the verifier
receives only the verification set's values. Neither epoch's values are
expressible as the other's inputs.

### D5: Consent is a recorded input on the spend transition

`ConsentRecord` is data (who/when/what run request). The spend transition
(`ELIGIBLE → SANDBOX_STARTED`) requires BOTH a proceed from the core's
eligibility decision AND a consent record; neither substitutes for the
other. A request with consent but no profile refuses at resolution — the
ADV-001 extension — and the refusal names the missing profile, not the
consent. Consent appears in evidence as principal/actor data, never as a
capability.

### D6: One disposition per gate, enforced by a keyed recorder

Gate results are recorded into a keyed structure (one slot per scheduled
identity); a second terminal disposition for an identity fails closed
naming the duplication (ADV-017). `SKIP_ENV` mapping is fixed at the
recording boundary: an unavailable-toolchain report from the execution
port maps to `SKIP_ENV` and nothing downstream may renormalize it
(PROP-007); truncation reports map to `FAIL` with the reason (ADV-016).
The gate plan submitted to the execution port is constructed ONLY from the
captured registry entry — the scheduling interface takes gate identities,
not argv, so caller widening is unexpressible (ADV-006/MUT-004).

### D7: Seal-last is enforced by an ordering component, proven by recorded sequence

`finalization/` owns the write order: it collects the run's writes, invokes
the core's `decideSealEligibility` over the completed inputs, and submits
the seal write to the evidence sink only after every other write of the run
has been submitted and the eligibility proceeded. The port-call recorder
(the same test seam that proves execution plans) yields the sequence
evidence for ADV-011's ordering half. A seal attempt out of order refuses
and is recorded.

### D8: Orchestration structurally cannot decide

Three mechanisms, mirroring L3's D2/D6 discipline:

- **Dependency allowlist**: runtime dependencies are exactly the three
  platform packages `{@secure-home/contracts, @secure-home/events,
  @secure-home/runner-core}` plus the pinned ADR-0012 framework set for
  the inert shell (`@nestjs/*`, the Fastify platform adapter) — and
  deliberately NO zod (cannot author schemas), no client SDKs, no
  container runtime; asserted exact by an in-package conformance test.
- **No decision re-implementation**: every trust decision recorded in a
  run originates from a core call; the run record keeps the decision
  provenance (which operation, which inputs by digest), and the review
  obligation forbids wrap-and-modify.
- **Module-graph fixity** (INV-008 provenance, ADV-018/MUT-010): no
  dynamic import/require with a non-literal specifier, no eval-family
  primitive, no code loading from observed workspace content — enforced by
  a source scan in the conformance suite, plus the behavioral fixture: a
  workspace carrying modified "orchestration" bytes executes nothing.

### D9: Events at the representable moments; a transition record for the rest (OQ3 + review blocker 3)

The closed L2 vocabulary represents specific lifecycle moments, and this
design emits at exactly those: `run.started` + `capability.granted`
(grant verbatim, the one authored shape by instance) at spend commit,
`call.attempted`/`call.disposition` and
`adapter.started`/`adapter.completed` from adapter-port reports, and
`run.terminated` at every terminal transition. No event type is invented
or overloaded for `PROFILE_RESOLVED`, `ELIGIBLE`, `VERIFYING`, or
`EVIDENCE_SEALED` — instead, EVERY declared transition lands in the run's
**transition record**: an orchestration-owned durable record (state from,
state to, cause, timestamp) distinct from the L2 event stream, making the
full walk reconstructable without an L2 vocabulary change. If a later
landing wants transitions as first-class events, that is a governed L2
amendment — deliberately not taken here. Emission failures are
operational, never silent.

### D10: Concurrency — one run, one writer

A run's state is advanced by a single owner; concurrent transition attempts
on one run are serialized by construction (the machine hands out the next
transition capability only once) and a lost race is a recorded rejection,
not an interleaving. Cross-run concurrency is unconstrained here (no shared
mutable state between runs); resource-level isolation is L9.

### D11: Early terminals split at PROFILE_RESOLVED; pre-authority runs leave a refusal record (review blocker 2)

The evidence obligation is honest about what can exist at each state:

- **At/after `PROFILE_RESOLVED`**: the production acquisition is complete
  (D4), so every termination — cancellation, timeout, refusal,
  operational failure — seals a FULL L2 evidence bundle. Empty observed,
  claimed, artifact, and gate-result sets are legitimate values there: a
  run that changed nothing records nothing, truthfully.
- **In `REQUESTED`** (no profile named, resolution failure, acquisition
  fault): the bundle's required authority identities do not exist, and
  fabricating them is prohibited. These runs terminate with an
  **early-terminal refusal record** — run id, requested profile reference
  as data, structured outcome, timing — whose shape is a governed
  platform contract introduced by a **small L2 amendment sequenced before
  this landing's implementation** (the `runner-contract-corrections`
  precedent: its own child change under the L2 authority, reviewed on its
  own terms). Task 0.1 gates on that amendment landing.

Rejected: weakening L3 construction to accept missing authority
(fail-open); fabricating identities (lying evidence); making cancellation
unavailable until `RUNNING` (leaves early runs un-cancellable for no
reason once acquisition is sequenced first).

## Decision Tables

Spend transition (leaving `ELIGIBLE`):

| Core eligibility | Consent recorded | Profile resolved | Outcome |
|---|---|---|---|
| proceed | yes | yes | transition commits; `run.started` + `capability.granted` emitted |
| proceed | no | yes | held at `ELIGIBLE`, recorded |
| refusal | any | yes | terminal `REFUSED` with the core's refusal |
| any | any | no | terminal `REFUSED` at resolution (ADV-001), consent irrelevant |

Gate result recording:

| Port report | Recorded disposition |
|---|---|
| completed, within output bound | `PASS` or `FAIL` per the gate's exit result |
| toolchain unavailable | `SKIP_ENV` — never renormalized |
| declared skip condition | `SKIP_OK` |
| output over the registry bound | `FAIL`, reason names truncation and the bound |
| second report for a recorded identity | fail closed, duplication named |
| environmental fault | operational failure for the run context |

Terminal classification: every terminal state maps through the core
(`classifyEvidenceFailure` / the shared outcome vocabulary);
`INDETERMINATE` is failure everywhere (ADV-012/MUT-005).

## Interfaces and Contracts

Consumed from L3, never redefined: the full exported operation surface and
value types. Consumed from L2: profile/policy/registry shapes (via the
core), `RunEvent`, `RunRecord`, `EvidenceBundle` vocabularies for emission
and sinks.

Exported by L4 (for the activation landing and for L7/L9 port
implementers):

| Surface | Contents |
|---|---|
| `RunLifecycle` | create run, declared transitions, state inspection; single-writer semantics |
| Port interfaces | the eight ports of D3, each value-typed |
| `runner.ts` composition root | wires ports + core into a runnable orchestration — without running anything |

No exported surface accepts argv for a declared gate, a path in place of a
snapshot, or a decision result not produced by the core.

## Security Implications

- **Spend gating** — consent + eligibility on one declared transition;
  bypassing either is unrepresentable in the machine.
- **Judge protection, completed** — L3 owned the data/path side; this
  landing owns the code side (D8): the run cannot alter the logic that
  judges it, because that logic is never loaded from anything the run can
  write.
- **No launch capability** — the strongest claim of this landing is what it
  CANNOT do: no Docker socket, no container client, no real spawn. L9
  flips enforcement after U4, exactly once, as the constitution requires.
- **Neutrality** — no provider SDK; adapter identity remains opaque data in
  events and evidence.

## Landing Seams

**One PR.** Orchestration and its proof net land together, matching the L3
pattern: groups for lifecycle, acquisition, scheduling, boundary, each with
its own fixtures; a final cross-cutting net over the finished tree.

**Inert until activation**: no bootstrap exists; nothing imports the
service; CI builds and proves it. Rollback is non-reference.

**Authority posture: additive.** No enforcement flip; L9 remains the single
enforcement flip of the program.

## Open Questions

All resolved by the planning review of 2026-08-10/11 (recorded in
`proposal.md` § Open Questions):

- **OQ1 — accepted**: the read/execute implementation asymmetry stands
  (D3).
- **OQ2 — resolved as directed**: no untracked activation landing; the
  inert NestJS/Fastify shell lands in L4 with framework-free domain
  modules inside it (D2).
- **OQ3 — accepted with the blocker-3 narrowing**: emission at the
  representable vocabulary moments plus the orchestration-owned
  transition record for every transition (D9).

The review's three blockers are enacted: acquisition epochs (D4), the
early-terminal evidence split with its sequenced L2 amendment (D11), and
the emission narrowing (D9).
