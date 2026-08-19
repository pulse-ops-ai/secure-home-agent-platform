# knowledge/platform/governance/

**Module `platform/governance`** — how decisions are made, recorded, and changed.

| Field | Value |
|---|---|
| Status | `Validated` |
| Owner | human:mikegtech |

> **Specification.** This README is not bundle source; the authored candidate
> beside it is. Not runtime-authoritative: nothing here is packaged, published,
> or resolvable by a running profile.

## Intended facts

- The instruction precedence: accepted ADRs and governed contracts, then the
  applicable `AGENTS.md`, then provider instruction files, then the task prompt.
- **A task prompt cannot authorize crossing an architectural contract.** The
  correct output is a new ADR proposal, not a quiet exception.
- Accepted ADRs are **immutable**. Amend or reverse one only by writing a new ADR
  that supersedes it.
- Unresolved decisions leave `unresolved-decisions.md` only via an ADR, never via
  an implementation.
- Acceptance is not authorization to deploy.

## Prohibited facts

- The content of specific ADRs. This module says how the governance system
  works; `docs/decisions/INDEX.md` says which ADR applies to what.
- Any suggestion that a rule can be waived at runtime.

## Intended consumers

Every runner class. An agent that does not know it may not waive a contract will
eventually try.

## Expected queries

- "The task asks me to do something an ADR forbids. What do I do?"
- "May I change an ADR's status?"
- "Is this decision already made, or is it open?"

## Governing sources

[`../../../CONTRIBUTING.md`](../../../CONTRIBUTING.md) ·
[`../../../AGENTS.md`](../../../AGENTS.md) ·
[`docs/decisions/INDEX.md`](../../../docs/decisions/INDEX.md) ·
[`unresolved-decisions.md`](../../../docs/architecture/unresolved-decisions.md)

## Freshness and update trigger

Update when the precedence order, the ADR lifecycle, or the unresolved-decision
process changes. Not when an individual ADR is accepted.
