---
type: model
owner: human:mikegtech
as_of: 2026-08-18
limitations: Portable projection only. Names no image digest, no profile contents, and no live run state. Grants nothing.
status: draft
stale_after: 2027-08-18
governs:
  - docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md
  - docs/decisions/ADR-0006-separate-agent-implementation-profile-run-and-automation.md
  - docs/decisions/ADR-0011-keep-coding-agent-images-provider-specific.md
  - docs/decisions/ADR-0013-define-the-runner-adapter-spi.md
  - docs/decisions/ADR-0017-classify-asynchronous-effects-at-runner-boundaries.md
  - docs/decisions/ADR-0018-separate-attempt-durable-fact-and-finalization-identity.md
  - docs/architecture/runner-model.md
  - docs/architecture/effect-boundary-model.md
  - docs/architecture/distributed-effect-lifecycle.md
  - docs/architecture/knowledge-selection-model.md
generated:
  by: human:mikegtech
  at: 2026-08-18T00:00:00Z
---

# How one effect is bounded

Every asynchronous effect an orchestrator performs is **classified**, and its
class fixes what a lost answer means. The classes are: a discardable read, an
acknowledged effect, an acquisition, a finalization, and a cleanup. The
classification is exhaustive — an unclassified effect is a defect, not a default.

## The clock is one budget, and it does not restart

There is **one absolute expiry** for a run, not a fresh timer per step.
Preparation and start consume the same budget. A later step may **narrow** it; no
step may restart or widen it.

Three bounds stay distinct, and confusing them produces a wrong recovery:

| Bound | Whose |
|---|---|
| caller cancellation | the requester's |
| governed run deadline | the profile's |
| settlement ceiling | the attempt's |

## What a timeout actually tells you

An interruption unwinds the work that was waiting, and **no later effect starts
from it**. The underlying operation may still complete somewhere — what is
guaranteed is that nothing further is attempted on its behalf.

So a timeout tells you *orchestration stopped*. It does **not** tell you that a
remote effect did not happen.

## A lost acknowledgement is not an absent effect

```text
lost acknowledgement  !=  effect did not occur
```

A durable or external fact may exist **before** its acknowledgement is observed.
Treat a missing answer as **unknown**, never as a no.

Where an effect can be retried:

- its identity exists **before** the call, so a retry is a replay rather than a
  second fact;
- an unknown answer has an explicit resolution — confirmed, not performed, or
  explicitly unresolved. Guessing is not one of the options.

## Acquisition is resolved at the resource

When you take ownership of something, the resource may commit that ownership
before you learn about it. You cannot fix that from your side: you do not know
the grant exists.

So an attempt whose outcome you could not observe is resolved **at the
resource** — abandoned, closed, or discarded there. A spent attempt cannot later
replay into a fresh grant.

## Fencing, exactly

What fencing guarantees:

```text
once a resource has accepted a newer ownership generation,
it refuses the older one forever
```

What it does **not** guarantee:

```text
a resource that has never seen the newer generation may still accept the older one
```

Both halves matter. Consequences:

- **checking a lease before writing is not fencing.** It is a check with a gap
  after it, and the gap is where the dispossessed writer writes;
- the **protected resource** enforces the fence, not the caller's good intentions;
- writes that escape the run must re-establish ownership at the point of the
  write;
- stopping a stale worker everywhere is a job for the substrate, and that
  enforcement does not exist yet.

Do not conclude that losing ownership makes you incapable of writing. Conclude
that you have no authority to, and that the resources which have seen the newer
generation will refuse you.

## Settlement has its own bound

When ordinary execution must stop, recording the intended ending gets a **fresh,
short** bound of its own.

Exhausting it is **settlement failure** — *"we could not record what happened"*.
It is **not** a lifecycle timeout, and it must never be reported as one. The
ending a run intended and whether that ending was durably recorded are two
different facts.
