# knowledge/runbooks/

**Procedural knowledge modules** — ordered procedures an agent follows, as
opposed to the domain semantics it reasons over.

> **Status: specification only.** No module content is authored. Every directory
> here is registered in [`../INDEX.md`](../INDEX.md) and blocked on
> [U7](../../docs/architecture/unresolved-decisions.md#u7).

## Modules

| Module | Procedure |
|---|---|
| [`repository-validation/`](repository-validation/) | proving a repository change is sound |
| [`incident-triage/`](incident-triage/) | reasoning about a household incident, in order |
| [`safe-escalation/`](safe-escalation/) | when to stop and how to hand over to a human |

## What belongs here

A runbook states **what to do, in what order, and when to stop**. It may name the
signals that select a branch and the conditions that end the procedure.

## What does not belong here

- **Escalation routing** — who is contacted, how, and in what order. That names
  people and belongs to household configuration, not to a portable document.
- **Live state** of any kind, including whatever the runbook reacts to.
- **Authority.** A runbook describes a procedure; it never grants the capability
  to perform one of its steps.

## Governed by

[`../README.md`](../README.md) → [`../AGENTS.md`](../AGENTS.md) ·
[ADR-0010](../../docs/decisions/ADR-0010-use-okf-for-portable-knowledge-only.md)
