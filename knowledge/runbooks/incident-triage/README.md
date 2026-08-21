# knowledge/runbooks/incident-triage/

**Module `runbooks/incident-triage`** — the ordered procedure for reasoning about
a household incident.

| Field | Value |
|---|---|
| Status | `Validated` |
| Owner | human:mikegtech |

> **Specification.** This README is not bundle source; the authored candidate
> beside it is. Not runtime-authoritative: nothing here is packaged, published,
> or resolvable by a running profile. Registered in [`../../INDEX.md`](../../INDEX.md).

## Intended facts

- The order of operations: establish what is actually observed from **live
  state**, classify the signal using domain semantics, state what is unknown,
  then propose.
- That an agent triages and reports; it does not remediate a physical condition
  on its own authority.
- That a reading is an **observation** and a sensor fault is an **interpretation**
  of it: concluding a fault does not delete the reading, and the inference needs
  independent support rather than mere inconvenience. That "the system cannot
  tell" is a legitimate and valuable conclusion.
- That some conditions are **never** agent-handled and go straight to
  [`../safe-escalation/`](../safe-escalation/) — the rule, not a taxonomy. Which
  conditions those are is household domain semantics and is not defined here.
- That an `indeterminate` action outcome is reported as `indeterminate`, and that
  an agent does not resolve its own uncertainty by acting again on its own
  authority. This is narrower than "never retry": a retry preserving effect
  identity is a governed replay, not a prohibited act.

## Prohibited facts

- Current alarm state, sensor readings, occupancy, or any live value.
- Household member names, contact details, or access history.
- Emergency service numbers or addresses — those belong to the household's own
  configuration, not to a portable document.

## Intended consumers

Household runners.

## Expected queries

- "A smoke signal and a door signal arrived together. What do I do first?"
- "The reading looks impossible. Is it the sensor?"
- "May I unlock the door to let someone in?"

## Governing sources

[`agent-triage-and-escalation.md`](../../../docs/architecture/agent-triage-and-escalation.md) ·
[ADR-0005](../../../docs/decisions/ADR-0005-separate-capability-authorization-and-safety.md) ·
[ADR-0009](../../../docs/decisions/ADR-0009-define-degraded-mode-and-offline-authorization.md) ·
[ADR-0010](../../../docs/decisions/ADR-0010-use-okf-for-portable-knowledge-only.md) ·
[ADR-0013](../../../docs/decisions/ADR-0013-define-the-runner-adapter-spi.md)

Reads alongside `knowledge/household/security-semantics/`, which is a peer
module rather than a source that governs this one.

## Freshness and update trigger

Update when the triage or stopping contract in
[`agent-triage-and-escalation.md`](../../../docs/architecture/agent-triage-and-escalation.md)
changes, or when household domain semantics supply a classification vocabulary.
