# knowledge/platform/runner-model/

**Module `platform/runner-model`** — how agent runs are executed, and where
authority actually comes from.

| Field | Value |
|---|---|
| Status | `Validated` |
| Owner | human:mikegtech |

> **Specification.** This README is not bundle source; the authored candidate
> beside it is. Not runtime-authoritative: nothing here is packaged, published,
> or resolvable by a running profile. Registered in
> [`../../INDEX.md`](../../INDEX.md).

## Intended facts

- The five concepts and that they are never conflated: agent **implementation**
  (no authority), runtime **adapter** (no authority), execution **profile**
  (**this is where authority is granted**), **run** (an immutable historical
  fact), **automation** (separately authorized, and it expires).
- **Anything the profile does not grant is denied.** There is no default-open
  field.
- An adapter cannot widen its own sandbox; the resolution for a missing grant is
  a reviewed profile change, never an adapter workaround.
- A run names its profile version, so "which profile?" is never ambiguous in
  audit.
- A coding runner has no path to household devices.
- Every run produces an event stream and an evidence bundle, uniform across
  adapters.
- **Knowledge is context and grants nothing.** A projected document never
  authorizes and never overrides live state.

### Lifecycle authority

- A phase consumes only state already **established**; its effects earn the
  transition to the next phase.
- **Lifecycle authority decides *whether* the next effect may start; effect
  boundary semantics decide *how*.** Neither substitutes for the other.
- A refused transition **stops progression**. Procedural orchestration may not
  record the refusal and act anyway, and may not form a second lifecycle beside
  the canonical one.

### The effect boundary

- Asynchronous effects are exhaustively **classified**; an unclassified effect is
  a defect rather than a default.
- **One absolute governed expiry**, which a later step may narrow but never
  restart or widen. Caller cancellation, the governed deadline, and an attempt's
  settlement ceiling stay distinct.
- **A lost acknowledgement does not mean the effect did not occur.** Unknown is
  an outcome with an explicit resolution; it is never silently read as "no".
- **Acquisition uncertainty is resolved at the resource**, because the caller
  cannot compensate for a grant it never learned about. A spent attempt cannot
  replay into a fresh grant.
- **Fencing is enforced by the protected resource**, not by consulting a lease
  first — and its **limit is part of the fact**: a resource that has never
  observed the newer generation may still accept the older one.
- **Terminal settlement has its own finite bound**, and exhausting it is
  *settlement failure*, never a lifecycle timeout.

### Attempt versus logical run

- An orchestration attempt ending is not necessarily a logical-run terminal.
- A **dispossessed attempt has no authority to manufacture a logical-run
  verdict**; it owns only the ending of itself.

### Identity and replay

- **Domain fact identity**, **finalization transaction identity**, and
  **ownership/fencing identity** answer different questions and are never
  interchangeable.
- Replay equality requires **canonical content**, not identity alone: `NEW`,
  `EXACT REPLAY`, `CONFLICTING REPLAY` — and a conflicting replay is not stale
  fencing.

### Finalization

- Fallible participants **prepare invisibly**; exactly **one** publication
  transition makes what the transaction owes visible together.
- A **pre-existing durable domain fact does not mean the transaction
  committed**.
- One transaction does not own another's unpublished staging.
- One domain identity yields **at most one durable fact** across creation paths.
- **Deliberately undecided, and to be preserved as such:** the acknowledgement
  disposition of an exact staged-versus-ordinary replay. Durable uniqueness and
  acknowledgement truthfulness are required; that disposition is not decided,
  and the projection must not invent it.

## Prohibited facts

- Image digests, registry locations, or profile contents.
- Implementation names, file layout, test identifiers, in-memory representations,
  or a specific concurrency structure. Techniques may appear only as
  non-normative illustration.
- Any claim that a runtime is deployed, or that physical enforcement exists.
- Which profiles exist, or what any specific profile grants. A run learns its own
  grants from the substrate, not from a portable document.
- Live run state.

## Intended consumers

Both runner classes, plus any agent reasoning about what it may request.

## Expected queries

- "I need a capability I do not have. What is the correct path?"
- "Does merging my implementation change what I am allowed to do?"
- "Why is my knowledge selection recorded in evidence?"

## Governing sources

[ADR-0003](../../../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md) ·
[ADR-0006](../../../docs/decisions/ADR-0006-separate-agent-implementation-profile-run-and-automation.md) ·
[ADR-0011](../../../docs/decisions/ADR-0011-keep-coding-agent-images-provider-specific.md) ·
[ADR-0013](../../../docs/decisions/ADR-0013-define-the-runner-adapter-spi.md) ·
[ADR-0017](../../../docs/decisions/ADR-0017-classify-asynchronous-effects-at-runner-boundaries.md) ·
[ADR-0018](../../../docs/decisions/ADR-0018-separate-attempt-durable-fact-and-finalization-identity.md) ·
[`runner-model.md`](../../../docs/architecture/runner-model.md) ·
[`effect-boundary-model.md`](../../../docs/architecture/effect-boundary-model.md) ·
[`distributed-effect-lifecycle.md`](../../../docs/architecture/distributed-effect-lifecycle.md) ·
[`knowledge-selection-model.md`](../../../docs/architecture/knowledge-selection-model.md)

## Freshness and update trigger

Update when the runner concepts, the grant model, the effect-boundary semantics,
the identity model, or the evidence contract change.
