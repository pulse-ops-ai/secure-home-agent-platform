# knowledge/runbooks/safe-escalation/

**Module `runbooks/safe-escalation`** — when to stop, and how to hand a situation
to a human.

| Field | Value |
|---|---|
| Status | `Validated` |
| Owner | human:mikegtech |

> **Specification.** This README is not bundle source; the authored candidate
> beside it is. Not runtime-authoritative: nothing here is packaged, published,
> or resolvable by a running profile. Registered in [`../../INDEX.md`](../../INDEX.md).

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
- That an agent never escalates by widening its own authority, resending an
  unchanged denied action to obtain a different answer, or routing around a
  control. A genuinely new request whose inputs, authorization, policy, or
  context have changed is a new proposal and passes every normal control.
- That repeated escalation of the same condition is an **observation** about the
  system and belongs in the report as one. It creates no new mechanism and no
  obligation on any component.

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

[`agent-triage-and-escalation.md`](../../../docs/architecture/agent-triage-and-escalation.md) ·
[ADR-0004](../../../docs/decisions/ADR-0004-treat-agents-as-clients.md) ·
[ADR-0005](../../../docs/decisions/ADR-0005-separate-capability-authorization-and-safety.md) ·
[ADR-0009](../../../docs/decisions/ADR-0009-define-degraded-mode-and-offline-authorization.md)

## Freshness and update trigger

Update when the stop conditions or the handover contract in
[`agent-triage-and-escalation.md`](../../../docs/architecture/agent-triage-and-escalation.md)
change.
