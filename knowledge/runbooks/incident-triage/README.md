# knowledge/runbooks/incident-triage/

**Module `runbooks/incident-triage`** — the ordered procedure for reasoning about
a household incident.

| Field | Value |
|---|---|
| Status | `Planned` |
| Owner | @mikegtech |
| Blocked by | [U7](../../../docs/architecture/unresolved-decisions.md#u7) |

> Specification only. No module content is authored, and this directory is not
> runtime-authoritative. Registered in [`../../INDEX.md`](../../INDEX.md).

## Intended facts

- The order of operations: establish what is actually observed from **live
  state**, classify the signal using domain semantics, state what is unknown,
  then propose.
- That an agent triages and reports; it does not remediate a physical condition
  on its own authority.
- How to distinguish a sensor fault from the condition the sensor reports, and
  that "the system cannot tell" is a legitimate and valuable conclusion.
- Which classes of incident are **never** agent-handled and go straight to
  [`../safe-escalation/`](../safe-escalation/).
- That an `indeterminate` action outcome is reported as such, not retried
  reflexively.

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

[ADR-0005](../../../docs/decisions/ADR-0005-separate-capability-authorization-and-safety.md) ·
[ADR-0009](../../../docs/decisions/ADR-0009-define-degraded-mode-and-offline-authorization.md) ·
[`../../household/security-semantics/`](../../household/security-semantics/)

## Freshness and update trigger

Update when the escalation classes change or a new incident class is defined.
