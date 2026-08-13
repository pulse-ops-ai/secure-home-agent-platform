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

**The machine is authoritative over effects, not a recorder running
beside them.** A declared table proves nothing if the orchestrator calls
`advance()`, ignores the answer, and performs the next effect anyway:
the machine could correctly reject `begin_execution`, record the
rejection, and the adapter would still run — the state machine right, the
orchestration wrong, and nothing failing. That shape is a second,
procedural state machine parallel to the declarative one.

So a phase is DATA: the effects performed in one state, plus the
transition those effects EARN. A small engine runs a phase, applies the
transition it earned, and only then permits the next phase to run at all.
A rejected transition halts the walk and terminates the run fail-closed.
Narrowing the table therefore narrows what executes, which is what makes
"the walk is driven by the table" checkable — RO-EX-28/29 delete one
transition and assert the effects downstream of it stop happening.

Two consequences fall out rather than being maintained by convention:

- **Ordering.** A phase's transition cannot precede the effects that earn
  it, because the engine applies it afterwards. `EVIDENCE_SEALED` cannot
  be recorded before the seal, and no conditional keeps it that way.
- **The one exception is explicit.** The seal is irreversible and earns
  its transition afterwards, so the engine's gating cannot cover it — by
  the time a rejected `seal_evidence` could halt the walk the bundle
  would already be written. The seal phase therefore asks
  `machine.permits('seal_evidence')` first. That is a pure query, not a
  second machine: it declines to perform an irreversible act the
  authority has already said it will not honour.

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

### D3b: The execution session, and cancellation that can reach work in flight

`SANDBOX_STARTED` was entered by asserting it: consent succeeded, the
machine moved, and no execution operation had occurred at all — the
execution port's only operation was `runGate`, which has nothing to do
with a session existing. The lifecycle spec defers the REAL sandbox
start; it does not say the state is entered without one.

So `ExecutionSessionPort` — `prepare`, `start`, `interrupt`, `close` —
and **opening the session IS the spend**: it is what earns
`commit_spend`, so a session that will not open never reaches
`SANDBOX_STARTED`. That is what makes the state mean something.

The same seam fixes cancellation. Polling between phases cannot interrupt
a hung `invoke()` or `runGate()`, which are the two calls most likely to
hang; "cancellation must be effective, not advisory" is not provable
against a design that can only look when nothing is happening. The run
now owns an abort signal, hands it to those calls, AND races them against
it. Handing it over lets a well-behaved implementation stop immediately;
racing means one that ignores it still cannot hold the run open. On
abort the session is INTERRUPTED — abandoning the call would leave
whatever it started still running, which is the whole difference.

The deadline comes from the profile's declared wall clock, so there is no
unbounded run.

This lands before L9 deliberately. L9's scope is the real launcher,
network and resource enforcement, and effective cancellation and
teardown. A port with no session handle, no deadline and no interrupt
would force L9 to invent the seam before it could enforce anything
through it — making effective cancellation L9's problem to DESIGN rather
than L9's problem to PROVE. This landing ships an implementation that
starts nothing.

### D4: Acquire-once is a consumed token, in declared epoch roles

Acquisition sets exist per epoch ROLE (review blocker 1's resolution as
refined by the delta review, normative in
`runner-authority-acquisition`):

- the **production set** exists for every run and is consumed before
  `PROFILE_RESOLVED` is entered — one single-use token per source;
  consuming a token performs the one host read and returns the L3
  `AuthorityBytes` value; a consumed token cannot be consumed again
  (structural error naming source and epoch, no host read). A production
  epoch that cannot complete terminates the run fail-closed from
  `REQUESTED` (D11) — no partial trust, no silent retry;
- the **verification set** exists only for a run that reaches independent
  verification, with its own single-use tokens — the mechanism that makes
  "independently acquired, afresh" true rather than asserted.

Honest counting: a source is read AT MOST twice per run — at most once
per epoch, never twice within one; a run that reaches verification has
read each required source exactly once in each epoch, and an
early-terminated run has read less, never more. Downstream production
components receive
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

### D7: Finalization is one atomic transition, not an ordering of writes

Three contracts were in tension, and ordering individual writes cannot
resolve them:

- every transition is durable;
- `run.terminated` is truthful;
- the evidence seal is the run's final write.

Emitting the terminal event with the INTENDED outcome and then sealing
satisfies the third and breaks the second — a failed seal leaves an event
announcing `COMPLETED` for a run that ended `OPERATIONAL_FAILURE`. Moving
the emission after the seal breaks the third instead. The problem is not
which write goes first; it is that finalization was several writes.

So finalization PREPARES — assemble the bundle, project the whole
terminal transition sequence from the machine, build the terminal event
envelope, decide seal ordering and seal eligibility — and only then
COMMITS the journal tail, the terminal event, and the sealed bundle
together. All three land or none is observable. The machine then adopts
the projected entries VERBATIM, so what it reports is the committed fact
rather than a re-derivation of the intent.

What atomicity means here is this landing's to define; where the
transaction persists is U11's. The shipped implementation applies in the
order journal → event → bundle (the seal stays last) and retracts in
reverse on any failure, and every participating sink must therefore be
able to retract — required rather than optional, because a sink that
discovers at rollback time that it cannot unwind has discovered it too
late.

Preparation refusing costs nothing, which is the property that makes the
whole thing work: no event has been announced and no bundle written, so
the run simply terminates on what actually happened.

### D7 (superseded detail): seal-last as an ordering component

`finalization/` owns the write order: it collects the run's writes, invokes
the core's `decideSealEligibility` over the completed inputs, and submits
the seal write to the evidence sink only after every other write of the run
has been submitted and the eligibility proceeded. The port-call recorder
(the same test seam that proves execution plans) yields the sequence
evidence for ADV-011's ordering half. A seal attempt out of order refuses
and is recorded.

### D7b: The adapter SPI is frozen here, not at L7

ADR-0013 is accepted, and the port was far narrower than it: it received
a run id, an adapter name and a profile reference, and returned
`completed` plus a call list. The ADR requires a platform-built
invocation, faithful translation of the profile's tool surface, provider
events normalized at the boundary, model output as untrusted claims,
terminal state as observation rather than authority, usage in native
units, and credential references rather than values. The run request also
carried no workload at all, though the canonical runner model says a run
request carries a profile reference, an actor, and INPUTS.

Frozen now rather than at L7 because L7's authorized scope is `adapters/`
and images — not this service. An L7 that discovered the SPI could not
carry what the ADR requires would have to reopen L4 or widen its own
authorization, and a landing does not get to do either to itself.

Two of the shapes are structural rather than documented, which is where
their value is: an adapter has no field in which to report that the run
succeeded, and none in which to receive a credential value. The terminal
observations are separate fields precisely so they can DISAGREE — the
spike's exit-124-versus-`exitCode: 0` case — and a disagreement resolves
to `INDETERMINATE`, a failure class, rather than to whichever observation
was consulted first.

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

**The transition record is a JOURNAL, appended as the walk happens.** A
record assembled in memory and written once at the end is not a durable
reconstructable record: a run that dies at `RUNNING` leaves nothing, and
an unconsented run held at `ELIGIBLE` leaves no pending identity anything
could resume — which is the requirement that a hold be *recorded* rather
than silently dropped, unmet. `RunJournalPort` appends transitions,
rejections, acquisitions and holds at the moment each occurs, and
`readCurrentState` reconstructs the head of a run without replaying
evidence. Where the journal persists is U11's; what it must record is
not, and a port whose contract waits for its store is a port whose
contract gets written by the store.

### D10: Concurrency — one run, one writer

**Per run:** state is advanced by a single owner; concurrent transition
attempts on one run are serialized by construction (the machine hands out
the next transition capability only once) and a lost race is a recorded
rejection, not an interleaving. Proven by RO-INV-08 / RO-PROP-03.

**Across runs:** the orchestration core holds no state shared between
runs — each run owns its lifecycle state, its two acquisition sets, its
disposition recorder, and its finalization ordering. But port
*implementations* may legitimately be shared instances (one event sink,
one clock), so the honest statement is not "cross-run concurrency is
unconstrained": it is that **every ordering property this landing claims
is scoped to one run**. Seal-last means last among *that run's* writes;
concurrent runs may interleave their port calls freely, and no proof
here depends on global ordering. The recorded-sequence evidence for
RO-ADV-03 is therefore filtered per run.

**One run, one owner — above the machine.** `RunMachine`'s single-writer
guarantee is per machine INSTANCE, which says nothing about two
`Runner.run()` calls handed the same `run_id`: two instances, two
machines, both believing they own the run, both writing through the
shared keyed sinks that cross-run isolation legitimately permits. So the
guarantee has to exist above the machine. `RunLeasePort` claims the run
before the first effect — a run owned elsewhere reads no authority at all
— renews before each phase's effects, and releases on conclusion,
including the hold and throw paths, so a fault leaves a run merely failed
rather than unrecoverable. The generation is a fencing token: a holder
that lost its lease and kept working can be told apart from the one that
actually holds it, which a boolean lock cannot do.

Resource-level isolation between concurrent runs — starvation, CPU and
memory ceilings on a shared Pi — is L9's, not this landing's.

**Shared port instances carry an obligation, not a free pass.** Any port
implementation shared across runs must be safe for concurrent use and
must hold **no unkeyed mutable per-run state** — every piece of per-run
state it retains is keyed by `run_id`, so nothing can bleed between runs.
Correspondingly, every run-scoped write, event, and evidence operation
the core issues carries its `run_id`. This is what makes sharing safe
rather than merely convenient, and it is proven here by RO-INV-10 /
RO-EX-09 / RO-PROP-04 / RO-MUT-07 — L4 proves the core's half (it holds
no unkeyed state and always supplies the key); L9's real implementations
inherit the obligation.

**Confirmed by the repository owner on 2026-08-12** (recorded on PR #79),
closing the last design assumption gating task 0.1.

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

Exported by L4 (for post-U4 activation — an operational act on this
shell — and for L7/L9 port implementers):

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

**Inert until activated (a post-U4 operational act, not a landing)**:
nothing executes the shell's bootstrap, no listener binds, nothing
imports the service; CI builds and proves it. Rollback is non-reference.

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
