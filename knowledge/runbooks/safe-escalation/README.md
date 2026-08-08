# knowledge/runbooks/safe-escalation/

**Module `runbooks/safe-escalation`** — when to stop, and how to hand a situation
to a human.

| Field | Value |
|---|---|
| Status | `Planned` |
| Owner | @mikegtech |
| Blocked by | [U7](../../../docs/architecture/unresolved-decisions.md#u7) |

> Specification only. No module content is authored, and this directory is not
> runtime-authoritative. Registered in [`../../INDEX.md`](../../INDEX.md).

## Intended facts

- The stop conditions: life-safety signals, anything requiring physical presence,
  a denial the agent believes is wrong, contradictory live state, an
  `indeterminate` action outcome, and any situation the agent cannot describe
  accurately.
- That escalation is a **first-class successful outcome**, not a failure. An
  agent that escalates early is behaving correctly.
- What a good handover contains: what was observed, what was inferred, what
  remains unknown, what was attempted and its disposition, and what decision is
  being asked for.
- That an agent never escalates by widening its own authority, retrying a denied
  action, or routing around a control.
- That repeated escalation of the same condition is a signal about the system,
  and is reported as one.

## Prohibited facts

- Who to contact, in what order, with what details. Escalation **routing** is
  household configuration and may identify people; this module describes *when*
  and *how to hand over*, never *to whom*.
- Any live state or occupancy used to decide whether someone is available.

## Intended consumers

Household runners primarily; coding runners inherit the stop conditions that
apply to them.

## Expected queries

- "I am not confident in this conclusion. Do I act or stop?"
- "The action came back `indeterminate`. What now?"
- "Authorization denied me and I think it is wrong. What is the correct move?"

## Governing sources

[ADR-0004](../../../docs/decisions/ADR-0004-treat-agents-as-clients.md) ·
[ADR-0005](../../../docs/decisions/ADR-0005-separate-capability-authorization-and-safety.md) ·
[ADR-0009](../../../docs/decisions/ADR-0009-define-degraded-mode-and-offline-authorization.md)

## Freshness and update trigger

Update when the stop conditions or the handover contract change.
