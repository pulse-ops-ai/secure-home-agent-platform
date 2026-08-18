# The distributed effect lifecycle

What identities exist around a run and its finalization, what each one proves,
and how a durable effect becomes visible.

> **Governed by
> [ADR-0018](../decisions/ADR-0018-separate-attempt-durable-fact-and-finalization-identity.md)**,
> with effect-class and fencing semantics from
> [ADR-0017](../decisions/ADR-0017-classify-asynchronous-effects-at-runner-boundaries.md).
> This document describes the accepted model; the reasoning and the rejected
> alternatives are in the ADRs.
>
> Boundary, expiry, and interruption semantics are
> [`effect-boundary-model.md`](effect-boundary-model.md).

## An attempt is not the logical run

```text
  logical run R
      ├── attempt A
      ├── attempt B
      └── …
```

An attempt may end because:

- a lifecycle terminal was reached under it;
- settlement failed — an intended terminal was selected, but its mandatory
  governed record did not become durable within the settlement bound;
- the run is held, resumable, with a durable resumable identity;
- ownership was lost;
- it never started;
- the lifecycle granted no terminal at all.

```text
  attempt outcome  ≠  logical-run terminal state
```

A stale attempt owns only facts about **its own ending**. After ownership loss
it has no authority to manufacture a logical-run verdict — not `INDETERMINATE`,
not `CANCELLED`, not any other. Reporting nothing would abandon the caller, so
it reports what it is entitled to report: the ending of itself.

Each outcome constrains the state it may carry, and an authority that granted no
terminal is reported as such rather than by naming a progress state as though it
were one. The implementation's discriminant names are not architecture.

## Three identity planes

| Plane | Example | Answers |
|---|---|---|
| **domain fact identity** | `(run_id, event sequence)` | which durable fact is this? |
| **transaction identity** | `commit_id` | which finalization transaction is this? |
| **ownership identity** | `(run_id, generation)` | who currently may finalize? |

**Equality in one plane implies nothing about equality in another.**

```text
  same commit_id      ≠  same domain fact
  durable event       ≠  committed transaction
  same generation     ≠  same transaction
```

Each collapse has a specific consequence: sharing a transaction identity across
different facts makes two facts one; reading a durable event as a committed
transaction publishes a terminal whose companions never landed; treating a
generation as a transaction lets one owner publish twice.

## Replay is decided on canonical content

```text
  identity unseen
      → NEW

  identity seen  +  canonical content EQUAL
      → EXACT REPLAY
      → reconcile / acknowledge idempotently
      → no duplicate durable fact

  identity seen  +  canonical content DIFFERENT
      → CONFLICTING REPLAY
      → refuse
      → preserve the first fact unchanged
```

**A conflicting replay is not stale fencing.** Identity corruption and ownership
loss are different facts, and a caller that confuses them recovers wrongly. The
caller fails closed on a conflict: the entry stays pending, and no conclusion
claims a durable property it could not establish.

Identity membership alone is insufficient — a ledger that remembers only "this
identity landed" cannot tell an honest retry from a different fact wearing a
landed name.

A retry may be **reconstructed deterministically** from durable intent, provided
its canonical content is identical. What is prohibited is volatile regeneration
that changes canonical content — a timestamp minted afresh turns an intended
exact replay into a conflict with the run's own record. Building the record once
and replaying it is one way to satisfy this, not the requirement.

## The finalization lifecycle

```text
  PREPARE
      stage every fallible participant INVISIBLY
          journal facts
          the terminal domain fact, if still owed
          evidence / governed record
          │
          ▼
  PUBLICATION
      exactly ONE visibility transition
          │
          ▼
  COMMITTED
```

| Stage | Property |
|---|---|
| **before publication** | abandoning the transaction changes no observable run state; a participant that refuses to stage costs nothing, and no participant needs to be able to undo a write |
| **at publication** | every fact the transaction still owes becomes visible together |
| **after publication** | there is no architectural compensating rollback of that terminal |

Because publication may precede acknowledgement, expiry is enforced **at the
publication point**, synchronously: the transaction publishes inside its budget
or publishes nothing observable
([`effect-boundary-model.md`](effect-boundary-model.md)).

**The representation is not the model.** No particular ledger, collection type,
database, or write ordering is prescribed.
[U11](unresolved-decisions.md#u11) inherits this semantic contract when a
persistence toolkit is chosen — a store that cannot stage invisibly does not
satisfy it.

## A pre-existing durable participant does not commit the transaction

The exact terminal domain fact may already be durable — same canonical content,
same identity. That participant may then be **reconciled** rather than
physically duplicated.

But:

```text
  durable domain fact  ≠  committed transaction
```

The transaction still owes its other participant facts, and they become
observable only through its own publication boundary. A participant's prior
durability neither commits the transaction nor publishes anything early.

## Staging custody

Canonical-fact equivalence is **not** ownership of invisible staged state.

Each transaction owns the stage it created. A transaction may:

- publish its own stage;
- abandon its own stage.

It may **not**:

- clean up another transaction's stage;
- report success while depending on mutable unpublished state it does not own.

Otherwise a loser's cleanup releases the winner's state, or a transaction
acknowledges success while depending on a stage another party may abandon.

## One domain identity authority, across every creation path

Ordinary and staged creation of the same logical domain fact answer to **one
identity authority**. One domain identity therefore yields **at most one durable
fact**, however it was reached.

- exact cross-path replay **reconciles**;
- different canonical content at the same identity **conflicts**;
- an unpublished stage is not durable, so it cannot back an acknowledged
  ordinary effect.

**A deliberate non-decision, preserved.** Durable uniqueness and acknowledgement
truthfulness are **decided**. The *acknowledgement disposition* of an exact
staged-versus-ordinary replay is **not** — it was left open by the evidence, and
[ADR-0018](../decisions/ADR-0018-separate-attempt-durable-fact-and-finalization-identity.md)
§7 does not settle it. No example on this page implies an answer, and none
should be added that does.

## Concurrency

Invariants, not a collection strategy:

- one in-flight commit identity binds **one** canonical intent;
- a conflicting intent under that identity **refuses**;
- exact concurrent retries create **no duplicate durable transaction or fact**;
- **joining** a single in-flight transaction is permitted, not mandatory;
  serializing and reconciling the second as an exact replay conforms equally;
- one ownership generation publishes **at most one** terminal transaction;
- finalized authority becomes durable **with** publication, leaving no free or
  unowned interval.

## The fencing boundary

See [`effect-boundary-model.md`](effect-boundary-model.md) for the mechanism.
Applied to finalization:

- a dispossessed attempt has no **authority** to manufacture a verdict — that
  holds regardless of what any resource can physically refuse;
- publication **re-establishes ownership at the actual effect boundary**;
- if ownership loss is observed there, or the stale fencing identity is refused
  there, that attempt cannot publish;
- ADR-0017's limit remains true: a resource that has never observed the newer
  generation may still accept the older one.

The normative authority rule and what fencing physically proves are different
statements, and neither is evidence for the other.

## Governed by

[`../../AGENTS.md`](../../AGENTS.md) ·
[ADR-0018](../decisions/ADR-0018-separate-attempt-durable-fact-and-finalization-identity.md)
· [ADR-0017](../decisions/ADR-0017-classify-asynchronous-effects-at-runner-boundaries.md)
· [ADR-0013](../decisions/ADR-0013-define-the-runner-adapter-spi.md)
· [`effect-boundary-model.md`](effect-boundary-model.md)
· [`runner-model.md`](runner-model.md)
· [U11](unresolved-decisions.md#u11)
