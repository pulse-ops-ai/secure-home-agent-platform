# The effect boundary model

How runner orchestration crosses an asynchronous effect boundary: what decides
that an effect may start, and what governs how it executes once it does.

> **Governed by
> [ADR-0017](../decisions/ADR-0017-classify-asynchronous-effects-at-runner-boundaries.md).**
> This document describes *what the accepted decision looks like in the system*.
> The reasoning, the rejected alternatives, and the failures that produced them
> are in the ADR and are not restated here.
>
> Identity and finalization semantics are
> [`distributed-effect-lifecycle.md`](distributed-effect-lifecycle.md).

## The boundary

```text
       established run state
              │
              ▼
      lifecycle authority          ── may this phase act at all?
              │  authorizes the current phase
              ▼
       effect boundary             ── how may this effect execute?
              │  classifies the effect, applies interruption and expiry
              ▼
            port
              │
              ▼
     resource / external mechanism
```

Two different questions, answered in two different places:

| | Question |
|---|---|
| **lifecycle authority** | **whether** the next effect may start |
| **effect-boundary semantics** | **how** that effect may execute |

Neither substitutes for the other. A correctly bounded call that should never
have run is still a fault, and a correctly authorized phase whose calls are
unbounded is still a fault.

## Five effect classes

Every asynchronous port method belongs to exactly one class:

| Class | What it means for the boundary |
|---|---|
| **discardable read/result** | a late result is thrown away; nothing durable or externally observable depends on it |
| **acknowledged effect** | durable or external state may exist before the acknowledgement returns |
| **acquisition** | ownership of a resource; the resource may commit before the caller observes it |
| **finalization** | a durable outcome that may already exist when its acknowledgement arrives |
| **cleanup/teardown** | best-effort, idempotent at the resource |

**The port surface must be exhaustively classified.** An asynchronous method
with no class is non-conformant, and that must be detectable structurally rather
than by review. The specific method-to-class mapping is implementation-level and
is not reproduced here; it changes as ports change, and freezing it in
architecture would make every port addition an architecture change.

## Lifecycle authority gates progression

- A phase consumes only state that has already been **established**.
- Its effects are authorized from that state.
- Those effects **earn** a lifecycle transition.
- A **refused** transition stops downstream progression.
- Procedural control flow may not form a second lifecycle beside the canonical
  authority.

```text
  REQUESTED
      │  the phase's effects establish authority
      ▼
  PROFILE_RESOLVED
      │  …
      ▼
  (further phases)


  transition refused
      └──X──►  no downstream phase effects
```

The diagram's point is the bottom line, not the state names: refusal is not
merely recorded, it *stops the walk*. Narrowing what the authority permits must
narrow what executes — otherwise the authority is a recorder running beside the
orchestration rather than governing it.

**Typestate is the current implementation technique**, and a strong one:
unearned state cannot be named or passed, so a phase that tried to consume it
would not compile. That is how the property is enforced today, not what the
architecture requires. Another language or mechanism conforms by producing
equivalent evidence.

## One absolute governed expiry

- There is **one absolute run expiry**, not a series of fresh relative timers.
- Preparation and start consume it.
- A downstream mechanism may **narrow** it; it may never restart or widen it.
- The boundary checks it **before starting a call** and again when a result
  returns.
- Timer scheduling grants no extra execution: the check is synchronous as well
  as scheduled, so a late timer callback cannot buy time.

Three bounds stay distinct, and their provenance is never collapsed:

| Bound | Whose |
|---|---|
| caller cancellation | the requester's |
| governed run deadline | the profile's |
| settlement / recovery ceiling | the attempt's |

The boundary stamps which bound a refusal carries. A pre-boundary caller cannot
widen the budget or attribute its own refusal to the governed clock.

## An interrupted continuation starts nothing further

```text
  boundary checks abort / expiry
        │
        ▼
  effect starts  ── only if allowed
        │
   interrupt while awaiting
        │
        ▼
  continuation unwinds
        │
        ▼
  no later orchestration effect starts from that continuation
```

The underlying asynchronous operation **may still physically settle**. The
architectural guarantee is about orchestration *progression*: nothing remains
attached to that result that could acquire authority, emit an event, or mutate a
conclusion.

The boundary — not the call site — is what starts the effect, which is why the
check cannot be skipped by forgetting a wrapper. Passing a deferred invocation
is the reference realization of that property, not a requirement of any
particular language.

## Acknowledged effects

```text
  acknowledgement  ≠  fact
  lost acknowledgement  ≠  effect absent
```

A durable or external fact may exist before its acknowledgement is observed, so
a missing acknowledgement is an *unknown*, never a *no*.

Where an effect is retryable:

- its logical identity exists **before** the call;
- a retry preserves that identity, so a repeat is a replay rather than a second
  fact;
- unknown acknowledgement has an **explicit resolution posture** — confirmed,
  not performed, or explicitly unresolved.

Replay identity and what makes two attempts "the same fact" are in
[`distributed-effect-lifecycle.md`](distributed-effect-lifecycle.md).

## Acquisition is a protocol, not a call

```text
  request attempt  (caller-known attempt + resource identity)
        │
        ▼
  resource may commit ownership
        │
        ▼
  acknowledgement may be lost
        │
        ▼
  uncertainty resolved AT THE RESOURCE
```

The caller cannot compensate for a grant it never learned about, so resolution
belongs to the resource: abandon, close, discard, or an equivalent. A pending
attempt becomes ineligible for a grant; a committed one is released rather than
left as ownership with no holder.

**A resolved or spent attempt may not later replay into a fresh grant.** A
delayed duplicate refuses rather than minting a generation nobody is waiting to
hold.

## Fencing

**The guarantee:**

```text
  after resource R has accepted generation N+1,
  R refuses generation N forever
```

**The non-guarantee, equally part of the model:**

```text
  a resource that has never observed N+1 may still accept N
```

Both halves are load-bearing. Consequences:

- **consulting the lease store before a write is not fencing** — it is a check
  with a window after it, and the window is where the dispossessed writer
  writes;
- the **protected effect or resource boundary** enforces the fence;
- orchestration may renew or re-check ownership at phase boundaries, and should
  — but that is not the resource security mechanism;
- **publication and apply-back/materialization re-establish ownership at their
  actual effect boundaries**, because those writes escape the run;
- terminating a stale worker globally belongs to the real substrate (L9), not to
  this boundary.

The claim *"a dispossessed attempt cannot write anywhere"* is **false** and must
not be written. What is true is narrower: once ownership loss is observed, or an
effect boundary refuses the stale fence, that attempt starts no later
orchestration effect.

## The settlement boundary

```text
  ordinary governed execution stops
        │
        ▼
  short, bounded settlement / teardown capability
        │
        ▼
  record the intended terminal · clean up
```

Exhausting the settlement ceiling is **settlement failure**. It is **not** a
lifecycle `TIMED_OUT`.

The terminal a run intended and whether its governed record became durable are
different facts. The architecture never manufactures a lifecycle terminal
because the attempt to record the original one ran out of its own ceiling. What
an attempt's ending implies about the logical run is
[`distributed-effect-lifecycle.md`](distributed-effect-lifecycle.md).

## What exists today

**Implemented:**

- `@secure-home/runner-core` — the trusted decisions;
- `services/runner-control` — L4 orchestration: the typed run lifecycle,
  authority acquisition, gate scheduling, finalization, and the port boundary;
- the lifecycle and effect-boundary mechanisms described above, behind ports;
- deterministic in-memory reference mechanisms, and read-only observation seams.

**Not implemented, or not activated:**

- a real container or process launcher;
- real substrate enforcement of filesystem, network, and process isolation (L9);
- a deployed `runner-control` runtime;
- the durable persistence choice, still open under
  [U11](unresolved-decisions.md#u11);
- provider runtime adapters that have not yet landed.

The orchestration semantics on this page are implemented. The physical
enforcement they assume is not.

## Governed by

[`../../AGENTS.md`](../../AGENTS.md) ·
[ADR-0017](../decisions/ADR-0017-classify-asynchronous-effects-at-runner-boundaries.md)
· [ADR-0013](../decisions/ADR-0013-define-the-runner-adapter-spi.md)
· [ADR-0003](../decisions/ADR-0003-use-framework-neutral-runner-profiles.md)
· [`runner-model.md`](runner-model.md)
· [`distributed-effect-lifecycle.md`](distributed-effect-lifecycle.md)
