# Agent triage and escalation

How an agent reasons about a situation it did not cause, and when it stops and
hands that situation to a person.

> **Composed from accepted decisions; it decides nothing new.**
> Every invariant below is stated canonically elsewhere and is cited where it is
> used. What this document adds is the **order** in which those invariants apply
> to an agent facing an incident — a sequence that was previously implicit and
> therefore had no canonical home
> ([ADR-0014](../decisions/ADR-0014-promote-durable-lessons-into-canonical-architecture-and-portable-knowledge.md) §1).
>
> It grants no authority, defines no incident taxonomy, and names no person.

## What this document is for

Two questions recur wherever an agent meets a household situation: *what may I
conclude?* and *when must I stop?* Both are answered by controls and invariants
that already exist, scattered across the decisions that own them. An agent
reasoning in the moment needs them composed, in order.

The separation matters more than it looks. **Reasoning about a condition is not
authority over it.** Nothing here changes what an agent may do; it changes only
how carefully an agent is expected to say what it knows.

## Six kinds of statement, kept apart

The single most common failure is a report that blends these together, because a
reader then cannot tell what was seen from what was concluded.

| Kind | Is |
|---|---|
| **observation** | what live state actually returned |
| **interpretation** | what the agent infers that observation means |
| **unknown** | what could not be established |
| **attempted action** | what the agent proposed and the platform accepted for execution |
| **disposition** | what became of that attempt, including that it is unresolved |
| **proposed next decision** | what the agent believes should happen, and who must decide it |

An interpretation stated as an observation is the error worth naming twice: it
launders a guess into evidence, and every later reader inherits it.

**Invariant.** Anything a model produces enters the platform as a **claim**, not
as data — untrusted until validated, and recorded as malformed rather than
repaired silently
([ADR-0013](../decisions/ADR-0013-define-the-runner-adapter-spi.md) §4,
[ADR-0004](../decisions/ADR-0004-treat-agents-as-clients.md)). An agent's own
report is subject to the same rule: it is a claim about the world, not the world.

## Triage, in order

**Procedure.** The order is the content; performing these out of sequence
produces confident conclusions built on unread evidence.

1. **Observe.** Establish what live state actually says. Where knowledge and live
   state disagree, **live state wins and the discrepancy is reported**
   ([ADR-0010](../decisions/ADR-0010-use-okf-for-portable-knowledge-only.md) §3).
   Knowledge describes; it does not report the present.
2. **Interpret.** Classify the signal using domain semantics — which this
   document deliberately does not supply. See *Where classification meaning comes
   from* below.
3. **State the unknowns.** What could not be established is part of the finding,
   not an omission from it.
4. **Propose.** An agent proposes; the platform decides
   ([ADR-0004](../decisions/ADR-0004-treat-agents-as-clients.md)).

### An agent triages and reports; it does not remediate

**Invariant, already entailed.** An agent is a client and re-enters through the
same governed enforcement point as any other caller
([ADR-0004](../decisions/ADR-0004-treat-agents-as-clients.md)); three separate
controls stand between a proposal and a physical effect, and none may be skipped
([ADR-0005](../decisions/ADR-0005-separate-capability-authorization-and-safety.md)).
There is therefore no path by which an agent remediates a physical condition on
its own authority, and reasoning about the condition creates no such path.

Urgency does not create one either. A situation that seems to demand immediate
action is the situation in which routing around a control is most tempting and
least defensible.

### The reading and the thing read are different claims

A reading that seems impossible supports two hypotheses at once: the condition is
real, or the instrument is wrong. **Neither is established by preferring it.**

**Invariant.** Live state wins over the agent's model of the world
([ADR-0010](../decisions/ADR-0010-use-okf-for-portable-knowledge-only.md) §3).
Declaring an instrument faulty *is* discarding live state in favour of a model,
so it needs evidence of the same standard as any other conclusion — corroborating
signals, a known failure mode — and not merely that the reading is inconvenient
or contradicts an expectation.

Where the two cannot be separated, that is an **unknown**, and unknown is a real
answer.

### "The system cannot tell" is a conclusion, not a failure to reach one

**Invariant.** A terminal state that cannot be established is reported as such
rather than resolved by preference
([ADR-0013](../decisions/ADR-0013-define-the-runner-adapter-spi.md) §3), and
silent degradation is prohibited — a refusal states *which* dependency was
unavailable, so a partial answer is never mistaken for a complete one
([ADR-0009](../decisions/ADR-0009-define-degraded-mode-and-offline-authorization.md) §6).

An agent that reports an honest unknown has produced a usable result. An agent
that produces a confident answer it cannot support has produced a liability that
reads like a result.

## Attempted actions and their disposition

**Invariant.** A physical action has an observable lifecycle and no atomicity
guarantee; `indeterminate` is a **first-class terminal state**, and no automatic
inverse command may be emitted ([`../../services/AGENTS.md`](../../services/AGENTS.md),
[`../../services/README.md`](../../services/README.md)).

**Invariant.** A missing acknowledgement is an **unknown, never a no** — a
durable or external fact may exist before its acknowledgement is observed. Where
an effect is retryable, its logical identity exists before the call, so a retry
that preserves that identity is a **replay rather than a second fact**, and an
unresolved acknowledgement carries an explicit resolution posture: confirmed, not
performed, or explicitly unresolved
([`effect-boundary-model.md`](effect-boundary-model.md)).

**Procedure.** An `indeterminate` disposition is therefore reported as
`indeterminate`. It is not rounded to success, not rounded to failure, and not
resolved by repeating the action on the agent's own initiative — a re-attempt is
a **new proposal** that must pass the same controls as the first, and a repeat
that does not preserve effect identity is a second effect rather than a replay.

This is narrower than "never retry", and deliberately so: retry with preserved
identity is a governed mechanism, not a prohibition. What an agent may not do is
resolve its own uncertainty by acting again on its own authority.

## Stopping

**Procedure.** Stop and hand over when any of these holds:

| Stop condition | Why it is a stop |
|---|---|
| a life-safety signal | life-safety response is deterministic, local, and **off the agent path** ([ADR-0009](../decisions/ADR-0009-define-degraded-mode-and-offline-authorization.md) §2) |
| the situation requires physical presence | an agent has none, and no procedure supplies one |
| a denial the agent believes is wrong | a denial is a governed outcome; disagreeing with one is a finding to report, never a reason to try again ([ADR-0004](../decisions/ADR-0004-treat-agents-as-clients.md), [ADR-0005](../decisions/ADR-0005-separate-capability-authorization-and-safety.md)) |
| contradictory live state | the contradiction is the finding; forcing a classification discards it |
| an `indeterminate` action outcome | the disposition is unresolved and only a person can decide what follows |
| the agent cannot describe the situation accurately | a report that misdescribes is worse than one that stops, because it is acted upon |

### Stopping is a successful outcome

**Invariant, already entailed.** A denial is a normal, expected result and not an
error to work around
([ADR-0004](../decisions/ADR-0004-treat-agents-as-clients.md),
[ADR-0005](../decisions/ADR-0005-separate-capability-authorization-and-safety.md)),
and an undecidable authorization is never a permit
([ADR-0009](../decisions/ADR-0009-define-degraded-mode-and-offline-authorization.md)).

It follows that handing a situation to a person is the procedure completing, not
the procedure failing. An agent that stops early and reports clearly has done the
work. Treating a stop as failure is what produces the pressure to press on.

### What stopping never means

**Invariant.** Escalation is never a route to authority the agent did not have:
not widening its own scope, not retrying a denied action to obtain a different
answer, and not reaching the same effect by another path
([ADR-0004](../decisions/ADR-0004-treat-agents-as-clients.md),
[ADR-0005](../decisions/ADR-0005-separate-capability-authorization-and-safety.md),
[ADR-0009](../decisions/ADR-0009-define-degraded-mode-and-offline-authorization.md)).

A control added on one path and missing on another is a bypass, and an agent that
finds one has found a defect to report rather than a door to use.

## The handover

**Procedure.** A handover carries the six kinds of statement above, kept
distinct:

- what was **observed**, from live state;
- what was **inferred**, marked as inference;
- what remains **unknown**, including what was tried and could not be
  established;
- what was **attempted**;
- the **disposition** of each attempt — including `indeterminate`, stated as
  itself;
- what **decision** is being asked for, and of whom in role terms.

The purpose is that a person can reconstruct the agent's reasoning and disagree
with a specific step. A summary that omits the unknowns cannot be disagreed with,
only trusted.

**A recurring handover is itself an observation.** Where the same condition
escalates repeatedly, that pattern is information about the system and belongs in
the report as an observation. It is not a new mechanism, not an obligation on any
component, and not a reason for the agent to act differently.

## Where classification meaning comes from

**This document deliberately defines no incident taxonomy.** Which conditions
exist in a household, what they mean, and which are severe are **domain
semantics**, and inventing them here would place household meaning inside a
platform contract and freeze a vocabulary nobody has agreed.

That meaning is owned by household semantics — a body of knowledge that does not
exist yet and remains rollout-blocked. Until it does, an agent classifies with
what live state and the platform actually give it, and an unclassifiable
condition is an **unknown** handed over as one, never a guess dressed as a
category.

The same boundary applies to **routing**. *When* to stop and *how* to hand over
are platform semantics and are stated here. *Who* is contacted, in what order,
and by what means is **household configuration** — it identifies people, and it
is never portable platform knowledge or portable knowledge of any kind
([ADR-0010](../decisions/ADR-0010-use-okf-for-portable-knowledge-only.md)).

## What this document does not contain

No household identity, contact, address, or emergency number; no device
identifier; no current state of anything; no routing configuration; and no
provider-specific instruction. Each is excluded by a rule that already exists,
and none of them would survive review here.

## Governed by

[ADR-0004](../decisions/ADR-0004-treat-agents-as-clients.md) ·
[ADR-0005](../decisions/ADR-0005-separate-capability-authorization-and-safety.md) ·
[ADR-0009](../decisions/ADR-0009-define-degraded-mode-and-offline-authorization.md) ·
[ADR-0010](../decisions/ADR-0010-use-okf-for-portable-knowledge-only.md) ·
[ADR-0013](../decisions/ADR-0013-define-the-runner-adapter-spi.md) ·
[ADR-0014](../decisions/ADR-0014-promote-durable-lessons-into-canonical-architecture-and-portable-knowledge.md) ·
[`effect-boundary-model.md`](effect-boundary-model.md) ·
[`../../services/AGENTS.md`](../../services/AGENTS.md)
