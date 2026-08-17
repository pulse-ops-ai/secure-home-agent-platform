# ADR-0018: Separate orchestration-attempt, durable-fact, and finalization-transaction identity

- **Status:** Proposed
- **Date:** 2026-08-16
- **Deciders:** @mikegtech (repository owner)
- **Depends on:** [ADR-0017](ADR-0017-classify-asynchronous-effects-at-runner-boundaries.md), which establishes finalization as a distinct effect class. **ADR-0017 must be accepted first**
- **Refines / supersedes in part:** nothing. It **adds** the identity and publication contract no accepted decision owns
- **Preserves:** [ADR-0013](ADR-0013-define-the-runner-adapter-spi.md) §3 — an adapter-reported terminal remains observational input and never lifecycle authority; [ADR-0009](ADR-0009-define-degraded-mode-and-offline-authorization.md)'s fail-closed posture
- **Closes:** no unresolved decision. [U11](../architecture/unresolved-decisions.md#u11) inherits the staging contract, not a storage design

---

## Context

### The question this answers

What identities exist around a distributed run and its finalization, what does
each one prove, and who has authority to conclude or publish?

### Why ordering writes cannot answer it

Three obligations were in tension in PR
[#82](https://github.com/pulse-ops-ai/secure-home-agent-platform/pull/82):
every transition is durable; the terminal event is truthful; the evidence seal is
the run's final write.

Emitting the terminal event and then sealing satisfies the third and breaks the
second — a failed seal leaves an event announcing `COMPLETED` for a run that
ended `OPERATIONAL_FAILURE`. Sealing first breaks the third. Compensating after a
public write requires every sink to be able to undo, and a sink discovers it
cannot only *after* another participant's write is already visible — which is the
partial visibility the atomicity claim forbids.

**The problem was never which write goes first. It was that finalization was
several writes.**

### Identities that were quietly the same thing

The same change found three questions being answered by one value:

- *which durable domain fact is this?*
- *which atomic transaction is this?*
- *who currently has authority to finalize?*

Collapsing any two produces a specific, reachable corruption. A per-call commit
identity turned a lost acknowledgement into a second published terminal. A replay
ledger that remembered only "this identity landed" could not tell an honest retry
from a different fact wearing a landed name.

### Attempt and run were also one statement

Two accepted rules were in tension: the lifecycle never abandons a run in a
non-terminal state, and an orchestrator that has lost ownership stops before
acting and writes nothing. A dispossessed attempt satisfies both only if "this
attempt finished" and "the run reached a terminal" stop being the same sentence.

### The evidence

PR #82, merged 2026-08-16 at `95346de` (semantic implementation head `ea31089`).
Decisions D7, D12, and parts of D10 and D14; invariants RO-INV-83, 87, 88, 91,
93, 94, 95, 96. Those artifacts live under `openspec/changes/`, which is planning
material and not a canonical home —
[ADR-0014](ADR-0014-promote-durable-lessons-into-canonical-architecture-and-portable-knowledge.md)
requires this promotion.

---

## Decision

### 1. An orchestration attempt is not the logical run

An attempt ending does not necessarily terminalize the logical run. **A stale or
dispossessed attempt owns only the ending of itself.**

It cannot manufacture `INDETERMINATE`, `CANCELLED`, or any other verdict for a
logical run it no longer owns — that is precisely the verdict a dispossessed
holder has no authority to give. Reporting nothing at all would abandon the
caller, so the attempt reports what it *is* entitled to report.

The distinctions the conclusion must preserve:

| what the conclusion says | means |
|---|---|
| a lifecycle terminal was reached under this attempt | the run terminalized here |
| an intended terminal was selected, but its mandatory governed record did not become durable within the settlement bound | **not** a terminal, and never success |
| a precondition is unmet; the run waits, resumable | a durable resumable identity exists |
| this attempt is over; the run is not | ownership was lost |
| the lease was never held | nothing was attempted |
| the machine granted no terminal | say so, rather than naming a progress state as one |

The durable invariant is that **attempt outcome and logical-run terminal state
are different facts**, and that each conclusion constrains the state it may
carry. The reference implementation names these `terminal`, `settlement_failed`,
`held`, `ownership_lost`, `not_started`, and `unterminated`; those exact names are
not fixed by this ADR.

### 2. Three identity planes are not interchangeable

| Plane | Example | Answers |
|---|---|---|
| **domain fact identity** | event `(run_id, sequence)` | which durable domain fact is this? |
| **finalization transaction identity** | `commit_id` | which atomic transaction is this? |
| **ownership / fencing identity** | `(run_id, generation)` | who currently has authority to finalize? |

**Equality in one plane never implies equality in another.** Specifically:

- `commit_id` equality does not make two different domain facts equal;
- domain-fact durability does not mean a transaction committed;
- generation equality is not transaction identity.

### 3. Identity equality alone is not fact equality

Stable identity is necessary and insufficient. A replay ledger must retain enough
**canonical logical content** to distinguish three answers:

- **new** — record it;
- **exact replay** — reconcile, acknowledge idempotently, create no second
  durable fact;
- **conflicting replay** — refuse, preserve the first fact unchanged, and **do
  not mislabel it as stale fencing**. Identity corruption and ownership loss are
  different facts, and a caller that confuses them recovers wrongly.

A caller fails closed on a conflict: the entry stays pending, and no conclusion
claims a durable property it could not establish.

**Canonical intent, not the identity string.** A timestamp regenerated on retry
can turn an intended exact replay into a conflict. A record that must be retried
is therefore built once and retried verbatim, rather than rebuilt.

### 4. Finalization is atomic publication, not write order

The canonical invariant is **not** "journal, then event, then evidence", and
**not** "write, then compensate on failure". It is:

```text
prepare/stage every fallible participant invisibly
    ↓
exactly ONE publication / visibility transition
```

- **Before publication** — abandoning the transaction changes no observable run
  state. A participant that refuses to stage costs nothing, because nothing
  staged is observable. No participant needs to be able to undo a write.
- **At publication** — every fact still owed by that transaction becomes visible
  together.
- **After publication** — there is **no compensating architectural rollback** of
  the published terminal.

Because publication may precede acknowledgement, expiry is enforced **at the
publication point** (ADR-0017 §8): the commit publishes inside its budget or
publishes nothing observable.

**The representation is not the decision.** The reference implementation stages
invisibly and publishes with a shared visibility marker; a database transaction, a
durable marker, or another mechanism may satisfy the invariant equally.
[U11](../architecture/unresolved-decisions.md#u11) inherits **the staging
contract, not the in-memory data structure**.

### 5. A pre-existing durable participant does not commit the transaction

If the exact terminal fact already exists durably under its **domain** identity —
same canonical content, same identity — finalization may reconcile that
participant rather than create a second physical row.

But:

```text
existing domain fact  !=  committed finalization transaction
```

The transaction must still publish, through its own publication point, the facts
it still owes. A participant's prior domain durability neither commits the
transaction nor publishes anything early.

### 6. Staging ownership is not fact equivalence

Equivalent canonical facts in two transactions do **not** give one transaction
cleanup or publication authority over the other's invisible staged state.

**Each transaction owns the stage it created.** Cleanup releases only its own
stage, idempotently and guarded against publication. **No transaction may
acknowledge success while depending on mutable unpublished state it does not
own** — otherwise a loser's cleanup aliases the winner's state, or a borrower
reports success with the fact missing.

### 7. One domain identity yields at most one durable fact, across every creation path

Ordinary and staged creation paths for the same domain fact answer to **one
identity authority**. They cannot independently create duplicate durable rows.

- exact cross-path replay **reconciles**;
- different canonical content at the same domain identity **refuses**;
- an unpublished stage is not durable, so it cannot back an acknowledged ordinary
  effect. When an ordinary landing carries the exact canonical a reservation
  holds, that landing becomes **the** durable fact and equivalent unpublished
  stages retire with it — a later staged publication exposes no second row, and a
  sibling's abandonment cannot erase an acknowledged fact.

**A deliberate non-decision is preserved.** The *acknowledgement disposition* of
an exact staged-versus-ordinary replay was left open in PR #82 — durable
uniqueness and acknowledgement truthfulness were proven; which acknowledgement
that cell should return was not. **This ADR does not elevate it.** Deciding it
here would settle by drafting what was deliberately left unproven.

### 8. Finalization concurrency

Architectural properties, not collection types:

- one in-flight commit identity binds **one** canonical intent;
- an exact concurrent replay may **join** the single underlying transaction;
- a conflicting intent under the same commit identity **refuses before
  publication**, with nothing staged;
- one ownership generation may publish **at most one** terminal transaction; a
  competing commit may stage invisibly and is refused at the publication gate;
- publication establishes persistent finalized authority **in the same
  synchronous section** as the visibility transition — there is no free interval
  in which the run is finalized but unowned.

---

## Consequences

**Finalization implementations must support invisible staging.** A sink that can
only write visibly cannot participate. This is a real constraint on
[U11](../architecture/unresolved-decisions.md#u11) and on any future sink.

**Replay ledgers must store canonical content, not identity membership.** That is
more storage and more comparison work, and it is what makes the difference
between an honest retry and a corrupted fact observable at all.

**Consumers must handle a conclusion vocabulary richer than "terminal or not".**
A conclusion that reports a lost attempt is not a failed run, and treating them
alike reintroduces the verdict a dispossessed holder must not give.

**Three identities must be carried where one used to be.** The cost is real. It
is smaller than a second published terminal.

**One cell stays open by design.** The acknowledgement disposition of an exact
cross-path replay remains undecided, and implementations must not read this ADR
as having settled it.

---

## Alternatives considered

**Ordered public writes plus rollback.** Rejected: it requires every sink to be
able to undo, and a sink discovers it cannot only after another participant's
write is already public — exactly the partial visibility the claim forbids. The
concrete failure was a terminal event announcing an outcome the run did not have.

**Commit identity as the event or domain identity.** Rejected: it makes
`commit_id` equality imply domain-fact equality. Two different facts become one,
or one fact becomes two, depending on which direction the collapse runs.

**A per-call commit identity minted by the implementation.** Rejected by
falsification: a lost acknowledgement retried under a fresh identity published a
**second terminal**. The identity must be the caller's, established before the
call and stable across retries of one intent.

**An identity-only replay ledger.** Rejected: it cannot distinguish an exact
retry from a different fact wearing a landed name, so conflicting replays are
accepted silently — the worst outcome available.

**Per-transaction domain identity namespaces.** Rejected: it makes duplicate
durable facts *representable* by construction, and then relies on convention to
avoid them.

**Letting equivalent transactions share unpublished staging ownership.**
Rejected: a loser's cleanup releases the winner's state, or a transaction
acknowledges success while depending on a stage that another party may abandon.
Equivalence of facts is not custody of state.

**Treating an already-durable event as proof the finalization committed.**
Rejected: the transaction still owes its journal and evidence facts. Domain
durability is not transaction commitment, and reading it as such publishes a
terminal whose companions never landed.

---

## Security implications

**No second terminal can be published for one run.** A second terminal is a
forged account of what the household's agent did — the audit record ceases to be
evidence.

**A dispossessed attempt cannot write a verdict.** Ownership loss and identity
corruption stay distinct, so a caller cannot be induced to recover as though it
merely lost a race.

**Conflicting replay is refused with the first fact intact.** An attacker or a
bug replaying a landed identity with different content cannot overwrite the
original.

**No free interval at publication.** Finalized authority is established in the
same synchronous section as visibility, so there is no window in which a run is
finalized and unowned.

---

## Availability implications

**Preparation refusing costs nothing.** Nothing staged is observable, so a failed
preparation lets the run terminate on what actually happened rather than on a
partially published fiction.

**Exact concurrent replays join rather than contend**, so a retry storm does not
multiply transactions.

**Reconciliation avoids duplicate work** when a participant's fact is already
durable.

**Fail-closed on conflict** means an affected entry stays pending rather than
being silently accepted — availability is traded for correctness deliberately,
consistent with [ADR-0009](ADR-0009-define-degraded-mode-and-offline-authorization.md).

---

## Validation and follow-up obligations

1. **Adversarial proof that no path publishes a second terminal**, including a
   lost acknowledgement retried under the same caller identity.
2. **Conflicting replay proven distinct from stale fencing** in both the refusal
   and the caller's handling.
3. **Publication atomicity proven by abandonment**: after a participant refuses to
   stage, no observable run state changed.
4. **Cross-path uniqueness proven** for ordinary landing, staged publication, and
   both racing — with the open acknowledgement-disposition cell left explicitly
   untested-as-decided, so a future reader does not mistake silence for a
   decision.
5. **Staging custody proven**: one transaction's abandon does not release
   another's stage, and no acknowledgement depends on an unowned stage.
6. **[U11](../architecture/unresolved-decisions.md#u11) must inherit §4** — the
   staging contract, not the reference representation. A store that cannot stage
   invisibly does not satisfy this ADR.
7. **Acceptance ordering.** [ADR-0017](ADR-0017-classify-asynchronous-effects-at-runner-boundaries.md)
   must be accepted **first**; this ADR builds on its finalization effect class.
8. **Operative architecture description** follows **after** acceptance, per
   [ADR-0014](ADR-0014-promote-durable-lessons-into-canonical-architecture-and-portable-knowledge.md).
   A Proposed ADR must not become binding by being restated as settled
   architecture in a lower-precedence document.

---

## Links

- [ADR-0017](ADR-0017-classify-asynchronous-effects-at-runner-boundaries.md) — the effect classes; **must be accepted first**
- [ADR-0013](ADR-0013-define-the-runner-adapter-spi.md) §3 — adapter terminal state as observational input
- [ADR-0014](ADR-0014-promote-durable-lessons-into-canonical-architecture-and-portable-knowledge.md) — the promotion obligation this ADR discharges
- [U11](../architecture/unresolved-decisions.md#u11) — persistence, which inherits the staging contract
- Evidence: PR #82 `design.md` D7, D12, D10, D14; invariants RO-INV-83, 87, 88, 91, 93, 94, 95, 96
