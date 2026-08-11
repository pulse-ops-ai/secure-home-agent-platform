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
- No process bootstrap, HTTP surface, trigger, queue, or scheduler
  (activation is post-U4).
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
  runner.ts        the orchestration composition root (pure wiring;
                   no bootstrap, no process surface)
  index.ts         the service's typed surface for the activation landing
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

### D2: Framework-free orchestration core; activation is a later landing (OQ2)

ADR-0012 prescribes NestJS/Fastify for services. This landing ships the
orchestration core framework-free — plain typed modules behind a
composition root — and defers the NestJS process surface to the post-U4
activation landing. Reasons: (1) an HTTP surface before placement (U4) is
decided would create exactly the premature-deployment surface the program
forbids; (2) the framework-free core keeps the proof net deterministic;
(3) ADR-0012's own layering (§15) puts framework adapters outward of
application logic. This is a **deferral within ADR-0012, not a deviation**
— the activation landing adds the NestJS shell around this core. Requires
review confirmation (proposal OQ2).

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

Requires review confirmation (proposal OQ1).

### D4: Acquire-once is a consumed token, not a convention

Each run constructs one `AcquisitionSet` holding single-use tokens per
authority source. Consuming a token performs the one host read and returns
the L3 `AuthorityBytes` value; a consumed token cannot be consumed again —
the second attempt is a structural error naming the source, and no host
read occurs. Downstream components receive SNAPSHOTS (the L3
`CapturedAuthority` results), never tokens, so re-reading is not merely
forbidden but unreachable. Verification constructs a NEW `AcquisitionSet`
— the mechanism that makes "independently acquired, afresh" true rather
than asserted.

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

- **Dependency allowlist**: runtime dependencies are exactly
  `{@secure-home/contracts, @secure-home/events, @secure-home/runner-core}`
  — deliberately no zod (cannot author schemas), no framework, no client
  SDKs; asserted by an in-package conformance test.
- **No decision re-implementation**: every trust decision recorded in a
  run originates from a core call; the run record keeps the decision
  provenance (which operation, which inputs by digest), and the review
  obligation forbids wrap-and-modify.
- **Module-graph fixity** (INV-008 provenance, ADV-018/MUT-010): no
  dynamic import/require with a non-literal specifier, no eval-family
  primitive, no code loading from observed workspace content — enforced by
  a source scan in the conformance suite, plus the behavioral fixture: a
  workspace carrying modified "orchestration" bytes executes nothing.

### D9: Events are emitted at transitions, from captured data only

`events/` maps each declared transition to its L2 run-event(s):
`run.started` at spend commit, `capability.granted` carrying the captured
profile's grant verbatim (the one authored shape, by instance),
`call.attempted`/`call.disposition` from adapter-port reports,
`adapter.started`/`adapter.completed` from the adapter port lifecycle,
`run.terminated` carrying the shared outcome. Provider-native names ride in
the contracted opaque fields. Emission failures are operational, never
silent (OQ3 confirms emission belongs here).

### D10: Concurrency — one run, one writer

A run's state is advanced by a single owner; concurrent transition attempts
on one run are serialized by construction (the machine hands out the next
transition capability only once) and a lost race is a recorded rejection,
not an interleaving. Cross-run concurrency is unconstrained here (no shared
mutable state between runs); resource-level isolation is L9.

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

Carried into the planning review (stated in `proposal.md`):

- **OQ1** — the read/execute asymmetry of shipped port implementations
  (D3).
- **OQ2** — framework-free core with post-U4 activation as an ADR-0012
  deferral (D2).
- **OQ3** — run-event emission owned by this landing (D9).
