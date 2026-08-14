# runner-execution-boundary

## Purpose

The port boundary that keeps this landing on the near side of every open
decision: all effects behind narrow ports, **no container launch**,
decision-bearing orchestration only from trusted platform-controlled code
(INV-008's orchestration-provenance clause), evidence sealed last, and the
core/control boundary held in both directions.

This document is normative. It defines WHAT must hold, authored as a
**delta** against the main spec. Implementation architecture belongs in
`design.md`; proof strategy belongs in `assurance.md`.

---

## ADDED Requirements

### Requirement: Every effect passes through a declared port, and no port can launch a container

All host and provider effects SHALL pass through the declared port set —
authority sources, workspace observation, artifact observation, execution,
adapter invocation, event sink, evidence sink, clock, **run journal, and
run lease**. The service SHALL
carry **no container-launch capability**: no Docker socket access, no
container runtime client, and no execution-port implementation in this
landing that spawns a real process — the in-repo implementations of the
execution and adapter ports SHALL be deterministic test implementations
only, and the concrete launcher arrives at L9 after U4/#9.

#### Scenario: No container or process capability exists in the landing

- **GIVEN** the service's dependency set and source tree
- **WHEN** they are examined
- **THEN** no container runtime client, Docker socket path, or real
  subprocess spawn exists outside the declared port interfaces
- **AND** the execution and adapter ports have only deterministic test
  implementations in the repository

#### Scenario: Effects cannot bypass the ports

- **GIVEN** the orchestration core's module graph
- **WHEN** its imports are examined
- **THEN** no orchestration module imports a host I/O module directly —
  effects reach the host only through the port implementations injected at
  the boundary

### Requirement: Decision-bearing orchestration executes only from trusted platform-controlled code

No decision-bearing logic — eligibility, policy interpretation, gate
membership or scheduling, outcome classification, reconciliation, evidence
finalization — SHALL be sourced, imported, loaded, or executed from the
writable workspace or from any run-supplied content. The module graph SHALL
be fixed at build time: no dynamic import or require whose specifier
derives from data, no evaluation of workspace bytes as code.

#### Scenario: Modified orchestration bytes in the workspace never execute

- **GIVEN** a workspace containing modified copies of orchestration,
  scheduling, or classification code
- **WHEN** the run executes and its results are judged
- **THEN** only the platform's built, trusted code executed as
  decision-bearing logic
- **AND** the workspace copies ride only as observed data

#### Scenario: Dynamic code loading from data is unexpressible

- **GIVEN** the service's source tree
- **WHEN** it is scanned
- **THEN** no dynamic import or require takes a non-literal specifier, and
  no evaluation primitive is present

### Requirement: Evidence is sealed last, through the trusted core's eligibility

Evidence finalization SHALL be ordered after every other artifact of the
run: the orchestrator SHALL invoke the trusted core's seal-eligibility
decision over the completed inputs and SHALL write the sealed record
through the evidence sink only after that decision proceeds and after all
other writes for the run have been submitted. A run SHALL NOT be classified
successful while its evidence is unsealed.

The seal SHALL additionally require the run's durable journal to be
COMPLETE: no journal append of ANY category — a rejection as much as a
transition — may remain pending for retry when the seal is submitted.
The gate SHALL derive from the pending set itself rather than an
enumerated category list, so a journal category added later joins the
gate by existing. A pending entry landing after the seal would violate
seal-last from the other side; a pending entry never landing would seal
a run whose reconstructable history is incomplete.

#### Scenario: The seal is the final write

- **GIVEN** a run producing artifacts, events, and evidence
- **WHEN** the recorded port-call sequence **filtered to that run** is
  examined
- **THEN** the evidence-sink seal write is ordered after every other write
  of the run
- **AND** it happened only after the core's seal-eligibility decision
  proceeded
- **AND** a write issued by a concurrent run through the same port instance
  is not a post-seal write for this run

#### Scenario: A pending rejection blocks the seal

- **GIVEN** a run that recorded a rejected transition whose journal
  append keeps faulting
- **WHEN** terminal finalization is attempted
- **THEN** no evidence bundle is sealed
- **AND** the conclusion reports the incomplete durable record rather
  than a completed run

### Requirement: The declared walk is journaled as it happens, and a held run stays findable

Every declared transition, every rejected transition, every authority
acquisition, and every hold SHALL be appended to an orchestration-owned
durable journal **at the moment it occurs**. A record assembled in memory
and written once at termination SHALL NOT satisfy this: a run whose
process ends mid-walk SHALL still be reconstructable from what the
journal already holds.

All four categories SHALL pass through ONE outbox with one pending set.
An append that faults SHALL leave its fact pending for retry at the next
tick — the fact is neither silently dropped nor grounds to terminate the
run by itself — and the pre-seal completeness gate asks that single
pending set, so a category cannot sit outside the gate the way
category-specific tracking repeatedly allowed. A fact that NEVER lands
is caught where incomplete durable records are caught: no evidence seals
over it.

A run held at a state because a precondition is unmet SHALL leave a
durable pending identity naming the state it is held at, so that the run
can later be found and resumed. Where the journal persists is not decided
by this capability; what it must record is.

#### Scenario: A run that ends mid-walk is still reconstructable

- **GIVEN** a run that faults partway through execution
- **WHEN** the journal is read
- **THEN** it holds every transition the run took up to the fault, in
  order
- **AND** each was appended when it was taken, not as a batch at the end

#### Scenario: An unconsented run is findable, not dropped

- **GIVEN** a run the trusted core decided eligible, with no consent
  recorded
- **WHEN** the journal is read
- **THEN** the run's state is `ELIGIBLE` and a hold is recorded naming
  the withheld transition and the reason
- **AND** the hold names the state the run is held at

#### Scenario: A faulted acquisition append is retried, not dropped and not fatal

- **GIVEN** an acquisition whose journal append faults transiently
- **WHEN** the next journal tick runs
- **THEN** the acquisition lands in the durable record
- **AND** the run's outcome is unchanged by the transient fault

#### Scenario: An unjournalable fact blocks the seal

- **GIVEN** a journal that never accepts an acquisition or hold append
- **WHEN** terminal finalization is attempted
- **THEN** no evidence bundle seals over the missing fact

### Requirement: A run has one owner, and ownership is enforced before effects

A run SHALL be owned by exactly one orchestrator at a time. An
orchestrator SHALL claim the run before performing any effect on its
behalf, and an orchestrator that does not hold the run SHALL perform no
effect for it — no authority read, no invocation, no write. Ownership
SHALL be re-checked before each phase's effects, and an orchestrator that
has lost it SHALL stop before acting rather than be told afterwards.

Ownership SHALL carry a generation that increases on each grant, so that
a holder which lost the run and continued can be distinguished from the
one that holds it. Ownership SHALL be released when the run concludes,
including when it is held and when it fails, so that a fault leaves the
run recoverable rather than locked.

A lease MAY answer a replayed claim of the SAME attempt with its
original grant; it SHALL NOT hold grants for two attempts of one run
concurrently. This is why every claim presents an attempt identity
unique to that attempt, and why an attempt whose acknowledgement the
claimant could not await is abandoned at the resource — resolved where
the grant lives — rather than compensated at the caller
(`runner-lifecycle` states the claimant's obligations).

#### Scenario: Two orchestrators, one run

- **GIVEN** two orchestrators given the same run identity concurrently
- **WHEN** both attempt the run
- **THEN** exactly one performs the run
- **AND** the other performs no effect of any kind for it

#### Scenario: Ownership lost mid-walk

- **GIVEN** a run whose ownership moves to another orchestrator while it
  is walking
- **WHEN** the next phase is reached
- **THEN** the run stops before that phase's effects and terminates,
  naming the lost ownership

### Requirement: Runs are isolated across shared port instances

Ordering guarantees this capability states are scoped to a single run and
SHALL NOT be read as global. Separate runs MAY execute concurrently and
their port calls MAY interleave.

Every run-scoped operation the orchestrator issues through a port —
event emission, artifact and evidence writes, execution and adapter
invocation — SHALL carry its `run_id`. A port implementation MAY be a
single instance shared by concurrent runs; such an implementation SHALL be
safe for concurrent use and SHALL hold **no unkeyed mutable per-run
state** — every piece of per-run state it retains SHALL be keyed by
`run_id`, so no state can bleed between runs. The orchestration core
SHALL likewise hold no unkeyed mutable per-run state.

This landing SHALL NOT impose a concurrent-run or resource ceiling:
CPU, memory, starvation, scheduling, and substrate-level isolation are
enforcement concerns of the later enforcement landing, and a shared port
implementation delivered there inherits this obligation.

#### Scenario: Two runs sharing one set of port instances stay disjoint

- **GIVEN** two runs orchestrated concurrently through a single shared set
  of port implementations
- **WHEN** their emissions and evidence writes are examined
- **THEN** every recorded operation carries the `run_id` of the run that
  issued it
- **AND** each run's sealed record is exactly the record that run produces
  when executed alone
- **AND** neither run's evidence contains an operation issued by the other

#### Scenario: Interleaving does not change a run's outcome

- **GIVEN** any interleaving of two concurrent runs over shared ports
- **WHEN** each run's `run_id`-filtered recorded sequence is compared with
  that run executed in isolation
- **THEN** the two sequences are identical, seal ordering included

#### Scenario: Unkeyed per-run state is not conformant

- **GIVEN** a shared port implementation that retains per-run state in a
  field not keyed by `run_id`
- **WHEN** two runs use it concurrently
- **THEN** the implementation does not satisfy this requirement, and the
  divergence is observable as a difference from the isolated execution

### Requirement: The authoritative change set is derived, never assumed

The change set the trusted core treats as authoritative SHALL be DERIVED
by comparing the workspace against a baseline captured for that run. A
run for which no baseline was captured SHALL receive an observation
failure, not a change set: a change set derived from nothing is a
fabrication, and everything downstream inherits it.

Observation digests SHALL be taken over raw bytes, so that a
same-length substitution of non-text content cannot produce an identical
identity. Entries SHALL be observed without following links: a symbolic
link SHALL be recorded as a link, carrying the target it resolves to, so
that decisions treating the target as the effective location can be made
at all.

Artifact observation SHALL read the named path itself — never through a
link — SHALL refuse non-regular entries, SHALL be bounded in file count
and file size, and SHALL refuse content it cannot carry faithfully rather
than carrying a corrupted copy of it.

#### Scenario: An unchanged workspace has no changes

- **GIVEN** a run whose baseline was captured and whose workspace was
  not modified
- **WHEN** the change set is observed
- **THEN** it is empty
- **AND** no file is reported as modified merely for existing

#### Scenario: Created, modified and deleted are distinguishable

- **GIVEN** a run whose workspace gained a file, altered a file, and
  lost a file after its baseline
- **WHEN** the change set is observed
- **THEN** each change carries the kind that actually occurred

#### Scenario: A substitution cannot hide behind its size

- **GIVEN** a file replaced by different non-text content of the same
  length
- **WHEN** the base identity is observed again
- **THEN** it differs from the identity captured before

#### Scenario: A link is observed as a link

- **GIVEN** a workspace containing a symbolic link
- **WHEN** it is observed
- **THEN** the entry records that it is a link and the target it
  resolves to
- **AND** an artifact read of that path is refused rather than served
  from the target

### Requirement: The adapter invocation is platform-built and the adapter never decides

The invocation an adapter receives SHALL be constructed by the platform
and SHALL carry: the run identity; the CAPTURED profile identity
including its digest; the run's immutable input; the capability grant the
adapter is to translate into the provider's visible tool surface and
explicit denials; the routing and model selection; the declared limits;
credential REFERENCES; and opaque workspace and session references.

The invocation SHALL NOT be able to express a container image, a mount
path, a socket, an argv, or a command. Credential VALUES SHALL NOT be
expressible in it: an adapter receives names and never secrets.

What an adapter returns SHALL be OBSERVATIONS. It SHALL NOT be able to
report a terminal state from the run's closed vocabulary — the provider's
exit code, its self-reported outcome, and its transcript's terminal event
are carried as SEPARATE observations so that they may disagree, and the
lifecycle classifies them. Where they disagree the run's terminal state
cannot be established and SHALL be `INDETERMINATE`, which is a failure
class.

Model output SHALL enter as an untrusted claim and SHALL NOT reach the
authoritative change set. Usage SHALL be recorded in the provider's
native units; monetary cost SHALL NOT be modeled.

#### Scenario: An adapter cannot widen and cannot hold a secret

- **GIVEN** the invocation an adapter receives
- **WHEN** its shape is examined
- **THEN** no image, mount, socket, argv, or command is expressible
- **AND** its credentials carry environment-variable names only, with no
  field a value could occupy

#### Scenario: Disagreeing observations do not become a success

- **GIVEN** a provider that reports a clean exit and was also signalled
- **WHEN** the lifecycle classifies the observations
- **THEN** the run's terminal state is `INDETERMINATE`
- **AND** no adapter-supplied value determined it

#### Scenario: A model's claim is not a change

- **GIVEN** a run whose model output claims a file was modified
- **WHEN** the evidence bundle is examined
- **THEN** the authoritative change set is the host's observation
- **AND** the claim appears only as a claim

### Requirement: Finalization is a single atomic transition

A run's finalization comprises the durable transition tail, the
`run.terminated` event, and the sealed evidence bundle. These SHALL
commit as ONE transition: after finalization is attempted, either all
three are observable or none of them is. An implementation that cannot
guarantee this SHALL fail the commit rather than apply part of it.

The terminal event's outcome SHALL be the outcome that COMMITTED. An
event announcing a terminal state the run did not reach SHALL NOT be
observable, including when the seal subsequently fails.

Seal ordering and seal eligibility SHALL be decided BEFORE the commit,
and the machine SHALL authorize the entire terminal transition sequence
before any part of it is committed. After a successful commit the run's
state SHALL reflect the committed fact rather than a re-derivation of the
intent.

#### Scenario: A rejected seal leaves no trace of a completion

- **GIVEN** a run that reaches finalization
- **WHEN** the evidence write is rejected
- **THEN** no sealed bundle is observable
- **AND** no terminal event announcing completion is observable
- **AND** the durable record contains no evidence-sealed transition
- **AND** the run terminates on the failure

#### Scenario: The terminal event never outruns the commit

- **GIVEN** any run reaching a terminal state, successfully or otherwise
- **WHEN** its emitted terminal event is compared with the state it
  ended in
- **THEN** they name the same terminal

#### Scenario: Half a terminal sequence never commits

- **GIVEN** a run whose closing transition is not declared by the machine
- **WHEN** finalization is attempted
- **THEN** nothing is committed — a sealed run that cannot be completed
  is never produced

### Requirement: The core/control boundary holds in both directions

Orchestration SHALL NOT decide: no module of this service may re-implement,
approximate, or override a trusted-core decision, and the service SHALL
carry no schema-authoring capability. Decisions SHALL NOT orchestrate: the
service consumes only the core's exported operations, which sequence
nothing. Every trust decision recorded for a run SHALL be attributable to a
trusted-core operation invocation.

#### Scenario: Orchestration cannot author or decide

- **GIVEN** the service's runtime dependency set
- **WHEN** it is examined
- **THEN** it is exactly the platform contract and core packages, with no
  schema library and no decision logic of its own
- **AND** every eligibility, materialization, reconciliation,
  classification, and verification result in the run record originates
  from a trusted-core call

---

## Failure Semantics

| Condition | Required outcome | Classification |
|---|---|---|
| Effect attempted outside a port | unexpressible by construction; any bypass is a defect | change-attributable |
| Decision-bearing load from workspace content | unexpressible; any bypass is a defect | change-attributable |
| Seal attempted before core eligibility proceeds | refused by the ordering component, recorded | change-attributable |
| Evidence sink reports failure at seal | operational failure; the run is not classified successful | operational |

## Compatibility

Additive. Port value types are the L3 shapes; the seal-eligibility and
classification decisions are the L3 operations as authored.

## Deferred Behavior

- **Real execution port** — container launch, mounts, network enforcement,
  resource ceilings: L9, after U4/#9.
- **Adapter implementations** — L7, after U6/#11; the adapter port is the
  seam they implement.
- **Evidence persistence location** — U11; the sink port is the seam.
- **Executing the shell's bootstrap / activation** — a post-U4
  operational act on the inert shell this landing ships (design D2);
  **no separate landing exists**, and any code-changing launch surface
  belongs to L4's shell or to L9.
