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
adapter invocation, event sink, evidence sink, clock. The service SHALL
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

#### Scenario: The seal is the final write

- **GIVEN** a run producing artifacts, events, and evidence
- **WHEN** the recorded port-call sequence is examined
- **THEN** the evidence-sink seal write is ordered after every other write
  of the run
- **AND** it happened only after the core's seal-eligibility decision
  proceeded

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
