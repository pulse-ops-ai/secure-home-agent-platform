---
type: procedure
owner: human:mikegtech
as_of: 2026-08-20
limitations: Portable projection only. Defines no incident taxonomy, and carries no live device state, sensor value, occupancy, presence, member identity, contact detail, access history, or device identifier. Grants nothing.
status: draft
stale_after: 2027-08-20
governs:
  - docs/architecture/agent-triage-and-escalation.md
  - docs/decisions/ADR-0005-separate-capability-authorization-and-safety.md
  - docs/decisions/ADR-0009-define-degraded-mode-and-offline-authorization.md
  - docs/decisions/ADR-0010-use-okf-for-portable-knowledge-only.md
  - docs/decisions/ADR-0013-define-the-runner-adapter-spi.md
generated:
  by: claude-code/2.1.237
  at: 2026-08-20T15:12:56Z
---

# What to record about an attempted action

An **attempted action** and its **disposition** are two statements, never one. A
report that collapses them says something was done without saying what happened.

## A physical action has no atomicity guarantee

The lifecycle is observable rather than transactional. Nothing promises a
transaction boundary across a device, `indeterminate` is a **first-class terminal
state**, and no automatic inverse command may be emitted — undoing something that
may not have happened is another action with the same uncertainty, taken in a
situation already known to be unclear.

A missing acknowledgement is an **unknown, never a no**. A durable or external
fact may exist before its acknowledgement is observed, so silence is not
evidence of absence.

## `indeterminate` is written as `indeterminate`

It is **not rounded to success** and **not rounded to failure**. Both roundings
destroy the distinction the state exists to carry.

Two statements that are easy to merge and must not be:

| | |
|---|---|
| **agent procedure** | the agent does not guess, and does not independently repeat the effect to resolve its own uncertainty. It records the unresolved disposition and hands it over |
| **platform fact** | the underlying effect may later be resolved by a governed reconciliation or resolution mechanism, or may remain explicitly unresolved |

**This is not a prohibition on retry.** Where an effect is retryable its logical
identity exists before the call, so a repeat that preserves that identity is a
**replay rather than a second fact** — a governed mechanism, not a forbidden act.
What an agent may not do is act again on its own initiative to settle its own
uncertainty: a re-attempt is a **new proposal** and passes the same controls as
the first, and a repeat that does not preserve effect identity is a second effect
rather than a replay.

Nor is the agent stopping the same as the effect being settled. An unresolved
acknowledgement carries an explicit resolution posture — confirmed, not
performed, or explicitly unresolved — and establishing which is not the agent's
role.
