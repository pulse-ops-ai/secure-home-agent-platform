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
([ADR-0010](../decisions/ADR-0010-use-okf-for-portable-knowledge-only.md) §3), so
a reading may not be ignored or suppressed merely because it conflicts with
expectation.

**Procedure.** *The sensor reported X* is an **observation**. *The sensor may be
faulty* is an **interpretation** of that observation, and the two are recorded
separately: concluding a fault does not delete the reading, which remains
evidence and is still reported. What changes is what the agent believes the
reading means.

Because it is an inference, it needs independent support — corroborating signals
or a known failure mode are the obvious kinds, offered as illustration rather
than as a closed list. Inconvenience, or disagreement with prior knowledge, is
not support by itself.

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

**The agent stopping is not the effect being settled.** Two different statements:

| | |
|---|---|
| **procedure** | the agent does not guess, and does not independently repeat the effect. It stops and hands the unresolved disposition over |
| **platform fact** | the underlying effect may later be resolved by a governed reconciliation or resolution mechanism, or may remain explicitly unresolved ([`effect-boundary-model.md`](effect-boundary-model.md)) |

A person is one way an unresolved disposition gets decided; the platform's own
governed mechanisms are another. This contract does not claim that only a human
can establish what physically happened — it says the agent is not the thing that
establishes it.

## Stopping

**Procedure.** Stop and hand over when any of these holds:

| Stop condition | Why it is a stop |
|---|---|
| a life-safety signal | life-safety response is deterministic, local, and **off the agent path** ([ADR-0009](../decisions/ADR-0009-define-degraded-mode-and-offline-authorization.md) §2) |
| the situation requires physical presence | an agent has none, and no procedure supplies one |
| a denial the agent believes is wrong | a denial is a governed outcome; disagreement is a finding to report, and by itself does not authorize resending the same action to obtain a different answer ([ADR-0004](../decisions/ADR-0004-treat-agents-as-clients.md), [ADR-0005](../decisions/ADR-0005-separate-capability-authorization-and-safety.md)) |
| contradictory live state | the contradiction is the finding; forcing a classification discards it |
| an `indeterminate` action outcome | the disposition is unresolved, and the agent is not the mechanism that resolves it |
| the agent cannot describe the situation accurately | a report that misdescribes is worse than one that stops, because it is acted upon |

### Stopping is a successful outcome

**Procedure — a derived consequence, not an ADR statement.** A denial is a
normal, expected result and not an error to work around
([ADR-0004](../decisions/ADR-0004-treat-agents-as-clients.md),
[ADR-0005](../decisions/ADR-0005-separate-capability-authorization-and-safety.md)),
and an undecidable authorization is never a permit
([ADR-0009](../decisions/ADR-0009-define-degraded-mode-and-offline-authorization.md)).

This document composes those accepted facts into a procedural framing that no ADR
states: handing a situation over at a stop condition is **successful completion
of the agent's triage procedure**, not its failure. An agent that stops early and reports clearly has done the
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

**This is not a permanent bar on ever asking again.** What is prohibited is
resending an unchanged denied action in the hope of a different answer. A
genuinely new request — one whose inputs, authorization, policy, or context have
legitimately changed — is a new proposal, and it passes every normal control
exactly as the first one did. The distinction is whether something changed, not
how much time passed.

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
are platform triage semantics and are stated here. **This contract does not
define who is contacted, in what order, or by what means** — that is household
configuration rather than platform triage semantics.

What is settled is what may not enter these portable runbooks: household member
identities, contact details, current availability or presence, and any other
live or prohibited value
([ADR-0010](../decisions/ADR-0010-use-okf-for-portable-knowledge-only.md)).

What is **not** settled here is whether some future provider-neutral,
non-sensitive, role-based representation of household configuration could ever be
portable. That question is open, and this contract neither decides it nor designs
such a representation.

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
