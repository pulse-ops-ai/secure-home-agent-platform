# ADR-0017: Classify asynchronous effects and enforce their semantics at runner boundaries

- **Status:** Proposed
- **Date:** 2026-08-16
- **Deciders:** @mikegtech (repository owner)
- **Refines / supersedes in part:** nothing. It **adds** the orchestration-side effect contract that [ADR-0013](ADR-0013-define-the-runner-adapter-spi.md) deliberately left outside the adapter SPI
- **Preserves:** ADR-0013 in full — the adapter still translates and reports, terminal state remains observational input, and cancellation is still effected by the substrate; [ADR-0009](ADR-0009-define-degraded-mode-and-offline-authorization.md)'s fail-closed posture; [ADR-0006](ADR-0006-separate-agent-implementation-profile-run-and-automation.md)'s separation of profile and run
- **Closes:** no unresolved decision. [U11](../architecture/unresolved-decisions.md#u11) inherits these semantics rather than being answered by them
- **Depended on by:** [ADR-0018](ADR-0018-separate-attempt-durable-fact-and-finalization-identity.md), which specifies the finalization class this ADR names

---

## Context

### The question this answers

When runner orchestration crosses an asynchronous port, what semantics must hold
regardless of the implementation behind that port?

Nothing decided this before. [ADR-0013](ADR-0013-define-the-runner-adapter-spi.md)
governs the adapter — one port among many — and says explicitly that the adapter
never decides and never enforces. [`runner-model.md`](../architecture/runner-model.md)
states that every run has a wall-clock timeout and that cancellation is
effective. Neither says what happens to *orchestration* when a port call is
interrupted, what a lost acknowledgement means, or which party resolves an
acquisition whose outcome was never observed.

### The evidence

PR [#82](https://github.com/pulse-ops-ai/secure-home-agent-platform/pull/82)
(merged 2026-08-16 at `95346de`, semantic implementation head `ea31089`) built
the L4 orchestration layer and, across eighteen falsification rounds, found that
every one of those unanswered questions had a wrong default already in the code.
The decisions are recorded as D13, D14, and parts of D7 and D10 in that change's
`design.md`, with invariants RO-INV-48, 61, 82, 83, 85, 86, 89, 90, and 92.

**That change is planning material, not architecture.** Its specs live under
`openspec/changes/`, which is not a canonical home; the decisions would otherwise
survive only as the history of one pull request.
[ADR-0014](ADR-0014-promote-durable-lessons-into-canonical-architecture-and-portable-knowledge.md)
requires exactly this promotion, and this ADR performs it.

### Four concrete failures, all from the same missing decision

**Racing the caller's wait is not cancellation.** Round 6 falsified a
`Promise.race` around the whole orchestration walk. The caller's wait was
bounded; the continuation was not. A delayed port eventually answered, the
continuation resumed, acquired authority, emitted later events, and mutated a
conclusion that had already been returned. The run had "timed out" and was still
running.

**A lost acknowledgement is not an absent effect.** A durable append whose
acknowledgement never arrived was treated as a discardable result. The effect had
landed. Orchestration proceeded as though it had not.

**A resource can own something nobody is waiting for.** A lease implementation
committed a generation, its acknowledgement was delayed past the caller's
deadline, and the grant stood with no holder that would ever renew or release it
— an ownership leak that no amount of caller-side compensation can close,
because the caller never learned the grant existed.

**Consulting the lease store is not fencing.** Reading "do I still hold the
lease?" before a write is a check with a window after it. Fencing is the
resource refusing an older generation. The two were conflated, and the conflation
read as safety.

---

## Decision

### 1. Every asynchronous port method carries exactly one effect class

The classes, and what each one obliges:

| Class | Semantics |
|---|---|
| **discardable read/result** | a late result is thrown away; nothing durable or externally observable depends on it |
| **acknowledged effect** | may create durable or external state before its acknowledgement returns |
| **acquisition** | creates ownership of a resource; the resource may commit before the caller observes it |
| **finalization** | a durable outcome that may already exist when its acknowledgement arrives, so it can never be treated as a discardable late result |
| **cleanup/teardown** | best-effort, idempotent at the resource |

**The classification is complete, not conventional.** Adding an asynchronous port
method without a class must be *structurally detectable* — a build or gate
failure, not a review habit. A convention that a reviewer must remember is the
mechanism that produced every failure above.

This ADR fixes the classes and the obligation to classify exhaustively. It does
**not** fix the per-method table: which method belongs to which class is
implementation-level and changes as ports change. The reference realization
computes the table from the port surface so an unclassified method cannot
compile.

### 2. Interruption and timeout belong to the port boundary, not the call site

The orchestration boundary owns interruption. A call site can forget a wrapper;
a boundary cannot be forgotten by the calls that must pass through it.

The effect **must not be started before the abort and deadline check**. Passing
an already-started operation to a guard bounds only the waiting, which is the
defect Round 6 found. The reference implementation therefore passes a thunk; the
durable requirement is that starting the effect is the boundary's act.

The rule:

```text
interrupt while awaiting
    -> unwind that continuation
    -> no later orchestration effect starts from it
```

The underlying promise may still settle. What must not survive is orchestration
attached to its result: **a late underlying result cannot resume abandoned
orchestration.**

### 3. One absolute governed run expiry

The governed wall-clock budget is an **absolute expiry**, not a sequence of fresh
relative timers. Preparation and start consume the same budget. A downstream
component may **narrow** it; it may never restart or widen it.

The boundary checks the absolute expiry **synchronously** as well as by timer, so
scheduler latency grants no extra execution.

Expiry provenance is structurally distinct: caller cancellation, the governed run
clock, and attempt-scoped ceilings are separate bounds, and the boundary — not a
caller — stamps which bound a refusal carries. Caller-supplied expiry metadata is
stripped rather than preferred, so no party before the boundary can widen the
budget or forge the provenance of a refusal.

### 4. Acknowledged effects are facts, not results

An acknowledged effect may create durable or external state **before** its
acknowledgement returns. Therefore:

```text
lost acknowledgement  !=  effect absent
```

Three obligations follow, and they are what make prompt unwinding safe for this
class:

- **the fact is accounted before or independently of the acknowledgement**;
- **where retry is possible, the logical effect identity exists before the call
  and is stable across retries**, so a repeat is a replay rather than a second
  fact;
- **unknown acknowledgement has an explicit resolution posture** — confirmed, not
  performed, or explicitly unresolved. It is never silently translated to "did
  not occur."

### 5. Acquisition is resolved at the resource

A resource may commit ownership before its acknowledgement is observed. Caller-side
compensation cannot fix this: the caller does not know the grant exists.

So acquisition carries a **caller-known attempt and resource identity present in
the request**, and an attempt whose outcome the caller could not await is resolved
**at the resource** — abandon, close, discard, or the equivalent. A pending
attempt becomes ineligible for a grant; a committed one is released rather than
left as ownership with no holder.

**A spent or released attempt cannot later replay into a fresh grant.** A delayed
duplicate of a resolved attempt refuses rather than minting a generation nobody
is waiting to hold — the same orphaned-ownership hazard arriving as a duplicate
request instead of a delayed acknowledgement.

The caller's abandon and the resource's own ownership expiry are the two halves
of resolving uncertain acquisition. A durable implementation must supply both.

### 6. Fencing is enforced at the effect, not by consulting the lease

A fencing token protects only if **the protected resource refuses on it**.

```text
once resource R has accepted generation N+1,
R refuses generation N forever
```

Reading the lease store before a write is not fencing. It is a check with a
window after it, and the window is exactly where the dispossessed writer writes.

Orchestration may additionally renew or re-check ownership at phase boundaries,
and should. **That is not the security mechanism.** Writes that escape the run —
publication and materialization/apply-back classes especially — must
re-establish ownership **at the actual effect boundary**.

**What this does not claim.** A fencing token cannot be checked against a
generation the resource has not yet seen, so a stale write to a resource the new
owner has never touched is admitted. Terminating the dispossessed worker is a
substrate concern, not this boundary's. Stating the limit is part of the
decision: a fencing claim that implied total containment would be false, and
would be relied on as though it were true.

### 7. Terminal settlement is bounded independently of the run clock

Once cancellation or timeout determines that ordinary execution must stop,
mandatory terminal recording and cleanup may require a **fresh, short, bounded
settlement capability**.

Its exhaustion is **settlement failure**. It is **not** a lifecycle `TIMED_OUT`.

The terminal a run intended and whether its governed record became durable are
different facts. **The architecture must never manufacture a new lifecycle
terminal because the attempt to record the original terminal exhausted its own
ceiling.** Bounded execution, mandatory evidence, and a sink that never settles
cannot all be guaranteed; the honest resolution is to report which one failed,
not to relabel the run.

### 8. Lifecycle authority gates effect progression

Everything above governs what happens when a call is made. This governs whether
the next phase may make one at all.

- **Orchestration may consume only state already established for the run.** A
  phase cannot read a value an earlier phase did not produce.
- **A phase performs only the effects authorized from that established state**,
  and those effects **earn** a lifecycle transition.
- **The lifecycle authority's answer determines whether the next phase may act.**
- **A refused transition must not be ignored.** Procedural orchestration may not
  record the refusal and then execute the downstream effects anyway.
- **There is one lifecycle authority** — not a declarative machine alongside a
  parallel procedural lifecycle that actually drives the effects.

The last two clauses are the decision. A declared transition table proves nothing
if orchestration calls it, ignores the answer, and proceeds: the machine
correctly refuses, the refusal is correctly recorded, the provider still runs,
and nothing fails. That shape is a second lifecycle written in control flow, and
it is invisible precisely because the declarative one keeps saying the right
thing.

Narrowing what the authority permits must therefore narrow what executes. If it
does not, the authority is a recorder running beside the orchestration rather
than governing it.

**Not mandated here:** TypeScript typestate, any particular phase class names,
any file decomposition, module-size limits, or a specific interruption mechanism.
**Typestate is the reference implementation technique** that makes unearned state
structurally inaccessible — a phase that cannot name state it did not earn cannot
consume it — and it is a strong realization of this rule, not the rule.

### 9. Finalization is a distinct effect class

This ADR decides one thing about finalization: **it is a distinct effect class
whose durable outcome cannot be treated as a discardable late result.**

The boundary obligations that follow are this ADR's:

- publication may precede acknowledgement, so a discarded late acknowledgement
  would describe a durable outcome that already exists;
- expiry must therefore be enforced **at the publication/commit point**,
  synchronously — the commit completes inside its budget or produces nothing
  observable;
- **once a valid acknowledgement of a durable commit is returned, orchestration
  cannot reinterpret it as an uncommitted timeout.** Discarding it would invent a
  second terminal for a run whose first is already durable.

**What this ADR does not decide.** Invisible staging, an exactly-one visibility
transition, the transaction atomicity model, staging custody, cross-path domain
identity, and finalization concurrency are
[ADR-0018](ADR-0018-separate-attempt-durable-fact-and-finalization-identity.md)'s
and remain **Proposed** until it is separately accepted. This ADR is complete and
acceptable without them: a system could satisfy every obligation above with a
finalization model ADR-0018 would reject, and would still be conforming to this
ADR.

---

## Consequences

**A new asynchronous port method cannot be added silently.** It must be
classified, and the absence of a class must fail a gate rather than a review.
This is a real constraint on port evolution, and it is the point.

**Prompt unwinding is safe only because of the obligations in §4.** A system that
unwinds promptly without accounting facts independently of acknowledgement has
merely moved the loss.

**Some correctness moves into resource implementations.** Fencing and acquisition
resolution are the resource's to enforce; orchestration cannot compensate for a
resource that will not refuse an old generation. Port implementations acquire
obligations they did not previously have.

**[U11](../architecture/unresolved-decisions.md#u11) inherits these semantics.**
Whatever persistence toolkit is selected must supply resource-side fencing,
resource-side acquisition resolution, and publication-point expiry. This ADR
constrains that choice; it does not make it.

**Bounded settlement means some runs report `settlement failure`.** That is a
worse-looking outcome that is a more truthful one, and consumers must handle it
as distinct from a lifecycle terminal.

---

## Alternatives considered

**Per-call or call-site timeout wrappers.** Rejected: a call site can forget one,
and the forgotten call is unbounded with nothing indicating it. The boundary is
the only place the guarantee is total.

**`Promise.race` around the whole orchestration walk.** Rejected by falsification,
not by preference. It bounded the caller's wait while the continuation stayed
live: a delayed port answered, acquisition resumed, later events were emitted,
and a conclusion already returned to the caller was mutated. Racing is not
cancellation.

**Treating every port as a discardable promise result.** Rejected: durable and
external effects are not discardable. A lost acknowledgement for an append that
landed becomes orchestration proceeding as though it had not — the loss is
silent, which is the worst property a failure can have.

**Compensating for uncertain acquisition at the caller.** Rejected as
structurally impossible: the caller does not know the grant exists. Only the
resource can resolve an outcome the caller never observed.

**Checking the lease store instead of fencing the resource.** Rejected: it leaves
a window between the check and the write, and it reads as safety while providing
none. Fencing is the resource refusing an older generation.

**Treating settlement expiry as run timeout.** Rejected: it manufactures a
lifecycle terminal the run never reached, and it destroys the distinction between
"the run timed out" and "we could not record what the run did."

**Restarting the wall clock at session start.** Rejected: preparation is
execution the household paid for. A budget that restarts is not a budget.

---

## Security implications

**Fencing at the resource is the containment property.** Consulting a lease store
provides none, and the false version is more dangerous than no version because it
is relied upon. The named limit — a stale write to a resource the new owner has
not touched — is admitted deliberately so it is not assumed away.

**Ownership cannot leak.** Resource-side acquisition resolution prevents a
committed grant with no holder, which would otherwise be an indefinitely held
authority that no party can revoke because no party knows it exists.

**Expiry provenance cannot be forged.** The boundary stamps it unconditionally
and strips caller-supplied metadata, so no pre-boundary party can widen a
governed budget or attribute its own refusal to the governed clock.

**Bounded settlement bounds a hostile or broken sink.** Mandatory evidence must
not become an unbounded hold on the household control path.

---

## Availability implications

**No unbounded orchestration path exists**, from acquisition through cleanup —
including the terminal recording that runs after the governed deadline fires.

**A broken sink degrades to settlement failure**, not to a hung run. The run ends;
what is lost is the durable record, and that loss is reported rather than
disguised.

**Prompt unwinding frees the household control path early**, and §4's obligations
are what keep that from silently losing effects.

**Fail-closed on observed ownership loss** — once orchestration observes that
ownership moved, or an effect boundary refuses the stale fence, that attempt
starts no later orchestration effect. This is consistent with
[ADR-0009](ADR-0009-define-degraded-mode-and-offline-authorization.md). It is
deliberately narrower than "a dispossessed attempt performs no further effect",
which §6 shows is not true: a resource that has never seen the newer generation
cannot refuse the older one.

---

## Validation and follow-up obligations

1. **Structural completeness of classification.** A gate must fail when an
   asynchronous port method carries no effect class. A convention is not
   acceptable evidence.
2. **Adversarial proof for each class boundary**, not merely a passing path: a
   late result after interruption starting no further effect; a lost
   acknowledgement not read as absence; an unobserved acquisition resolved at the
   resource; a spent attempt refusing replay; a resource refusing an older
   generation forever.
3. **Fencing proven at the resource**, including the *named limit* — a test that
   demonstrates the admitted stale write exists, so the boundary of the claim
   stays visible.
4. **Settlement failure proven distinct** from lifecycle `TIMED_OUT`, in both the
   conclusion and the durable record.
5. **[U11](../architecture/unresolved-decisions.md#u11) must inherit §5, §6, and
   §9** when a persistence toolkit is chosen. A durable implementation that
   cannot refuse an older generation at the resource does not satisfy this ADR.
6. **Operative architecture description** — see
   [ADR-0014](ADR-0014-promote-durable-lessons-into-canonical-architecture-and-portable-knowledge.md).
   A canonical `docs/architecture/` description follows **after** acceptance.
   A Proposed ADR must not become binding by being restated as settled
   architecture in a lower-precedence document.

---

## Links

- [ADR-0013](ADR-0013-define-the-runner-adapter-spi.md) — the adapter SPI, which this deliberately does not change
- [ADR-0014](ADR-0014-promote-durable-lessons-into-canonical-architecture-and-portable-knowledge.md) — the promotion obligation this ADR discharges
- [ADR-0018](ADR-0018-separate-attempt-durable-fact-and-finalization-identity.md) — the finalization class, specified
- [`runner-model.md`](../architecture/runner-model.md) — cancellation, timeout, and resource posture
- [U11](../architecture/unresolved-decisions.md#u11) — persistence, which inherits these semantics
- Evidence: PR #82 `design.md` D13, D14, D7, D10; invariants RO-INV-48, 61, 82, 83, 85, 86, 89, 90, 92
