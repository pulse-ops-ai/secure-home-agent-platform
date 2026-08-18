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

# Which identity proves what, and when a write is real

## Your attempt ending is not the run ending

A logical run may be attempted more than once. **An attempt ending does not
necessarily terminalize the run.**

An attempt may end because a terminal was reached under it, because settlement
failed, because the run is held and resumable, because ownership was lost,
because it never started, or because the lifecycle granted no terminal at all.

If you have **lost ownership**, you own only the ending of *yourself*. You have
no authority to declare the run's outcome — not indeterminate, not cancelled,
not anything. Report that your attempt ended and that ownership moved. Saying
nothing would abandon your caller; saying more would be a verdict you are not
entitled to give.

## Three identities, three questions

| Identity | Answers |
|---|---|
| **domain fact** identity | which durable fact is this? |
| **transaction** identity | which finalization transaction is this? |
| **ownership** identity | who may finalize right now? |

**Equality in one implies nothing about equality in another.**

- the same transaction identity does not make two different facts the same fact;
- a durable fact existing does not mean a transaction committed;
- the same ownership generation does not make two transactions the same
  transaction.

Use the **domain fact** identity to ask whether a fact has landed. Use the
transaction identity to ask which transaction you are in. They are not
interchangeable, and substituting one for the other is how a second terminal
gets published.

## Replay compares content, not just identity

```text
identity unseen                          -> NEW
identity seen, canonical content equal   -> EXACT REPLAY   (reconcile; no second fact)
identity seen, canonical content differs -> CONFLICTING REPLAY (refuse; keep the first)
```

A **conflicting replay is not a stale-ownership problem.** They are different
failures and they need different recoveries, so do not report one as the other.

A retry must present the **same canonical content**. Regenerating a value that
changes the content — a fresh timestamp, for instance — turns an intended exact
replay into a conflict with your own earlier record. Rebuilding a record
deterministically is fine; rebuilding it *differently* is not.

## Finalization is one publication, not a sequence of writes

```text
prepare every fallible participant INVISIBLY
        |
        v
exactly ONE visibility transition
        |
        v
committed
```

- **before publication** — abandoning changes nothing observable, and a
  participant refusing to stage costs nothing;
- **at publication** — everything the transaction still owes becomes visible
  together;
- **after publication** — there is no compensating rollback of that ending.

Two mistakes to avoid:

- **an existing durable fact is not proof the transaction committed.** If the
  exact fact is already durable it may be reconciled rather than written twice —
  but the transaction still owes its other facts, and they become visible only
  through its own publication;
- **one transaction does not own another's unpublished staging.** Equivalent
  content does not transfer custody. Never report success while depending on
  staged state you do not own.

## One domain identity, at most one durable fact

Whichever path creates it — ordinary or staged — a single domain identity yields
**at most one** durable fact. An exact replay across paths reconciles; different
content at the same identity conflicts.

**One thing here is deliberately undecided.** Durable uniqueness is required, and
so is acknowledgement truthfulness: if an acknowledged write reported success,
its fact is durable and a sibling's abandonment cannot erase it. What
acknowledgement an *exact* cross-path replay should return is **not decided**.
Do not assume an answer, and do not infer one from an observed implementation —
observing what it does today would not tell you what it must do.
