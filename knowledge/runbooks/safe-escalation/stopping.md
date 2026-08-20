---
type: procedure
owner: human:mikegtech
as_of: 2026-08-20
limitations: Portable projection only. Names no person, contact, address, emergency number, or role assignment, and carries no live availability, presence, or other live state. Grants nothing.
status: draft
stale_after: 2027-08-20
governs:
  - docs/architecture/agent-triage-and-escalation.md
  - docs/decisions/ADR-0004-treat-agents-as-clients.md
  - docs/decisions/ADR-0005-separate-capability-authorization-and-safety.md
  - docs/decisions/ADR-0009-define-degraded-mode-and-offline-authorization.md
generated:
  by: claude-code/2.1.237
  at: 2026-08-20T15:12:56Z
---

# When to stop

Stop and hand over when any of these holds:

| Stop condition | Why it is a stop |
|---|---|
| a life-safety condition | life-safety response is deterministic, local, and **off the agent path** — the agent stops, and stopping is not a way of participating in it |
| the situation requires physical presence | an agent has none, and no procedure supplies one |
| a denial the agent believes is wrong | see below — the disagreement is reported, not acted on |
| contradictory live state | the contradiction **is** the finding; forcing a classification discards it |
| an `indeterminate` action disposition | the disposition is unresolved, and the agent is not the mechanism that resolves it |
| the agent cannot describe the situation accurately | a report that misdescribes is worse than one that stops, because it is acted upon |

None of these is an exception that lets an agent act. A stop condition is a
reason to stop, and reaching one never becomes permission to do the thing that
was refused, blocked, or unclear.

## A denial the agent disagrees with

A denial is a governed outcome, not an error. Disagreement with one is a
**finding to report**.

**Disagreement alone does not authorize resending the same unchanged action
merely to seek a different answer.** That is the precise rule, and it is narrower
than it may sound: a genuinely new request — one whose inputs, authorization,
policy, or context have legitimately changed — is a **new proposal**, and it
passes every normal control exactly as the first one did. The distinction is
whether something actually changed, not how much time passed.

## What stopping never means

Stopping is never a route to authority the agent did not have: not widening its
own scope, not reaching the same effect by another path, and not treating a
refusal as an obstacle to be worked around.

A control present on one path and missing on another is a **bypass**. An agent
that finds one has found a defect worth reporting, not a door worth using.

## Stopping is successful completion

**This framing is a consequence derived from the accepted rules, not a rule
stated in any one of them.** What the decisions establish is that a denial is a
normal expected result rather than an error to work around, and that an
undecidable authorization is never a permit.

What follows for this procedure: reaching a stop condition and handing the
situation over clearly is **successful completion of the triage and escalation
procedure**. An agent that stops early and reports well has done the work.

Read that precisely. It does **not** mean:

- that authorization succeeded;
- that any requested physical action succeeded;
- that the underlying condition is resolved.

Those are separate facts about the world, and none of them follows from the
procedure having completed. Treating a stop as a failure is what produces the
pressure to press on; treating it as resolution is what produces a report nobody
can rely on.
