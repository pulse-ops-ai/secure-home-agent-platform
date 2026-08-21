# knowledge/runbooks/

**Procedural knowledge modules** — ordered procedures an agent follows, as
opposed to the domain semantics it reasons over.

> **Runbooks are released for authoring individually**, through the governed
> per-module rollout allowlist in [`../catalog.json`](../catalog.json) — never by
> directory, so filing a runbook here earns it nothing
> ([ADR-0016](../../docs/decisions/ADR-0016-hybrid-admission-assurance-for-prohibited-content.md) §7a).
> **Lifecycle is per module.** [`../catalog.json`](../catalog.json) is
> authoritative for each runbook's current status, version, eligibility, and
> whether authored source exists beside its README — authored-source presence
> follows lifecycle state. Every directory here is registered in
> [`../INDEX.md`](../INDEX.md).
>
> [U7](../../docs/architecture/unresolved-decisions.md#u7) is **RESOLVED**. Nothing
> here is packaged, published, or resolvable by a running profile.

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

- **Escalation routing** — who is contacted, in what order, and by what means,
  along with household identities, contact details, and current availability or
  presence. Those are operational household configuration rather than runbook
  procedure, and a runbook here defines *when* to stop and *how* to hand over,
  never *to whom*. This is a boundary for these runbooks, not a claim that every
  conceivable routing representation is unportable: whether a future
  provider-neutral, non-sensitive, role-based representation could be portable is
  deliberately left open
  ([`../../docs/architecture/agent-triage-and-escalation.md`](../../docs/architecture/agent-triage-and-escalation.md)),
  and is not designed here.
- **Live state** of any kind, including whatever the runbook reacts to.
- **Authority.** A runbook describes a procedure; it never grants the capability
  to perform one of its steps.

## Governed by

[`../README.md`](../README.md) → [`../AGENTS.md`](../AGENTS.md) ·
[ADR-0010](../../docs/decisions/ADR-0010-use-okf-for-portable-knowledge-only.md)
