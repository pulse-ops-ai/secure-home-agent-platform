---
type: model
owner: human:mikegtech
as_of: 2026-08-19
limitations: Portable projection only. Names no broker address, queue endpoint, or connection detail, and carries no live worker state. Grants nothing.
status: draft
stale_after: 2027-08-19
governs:
  - docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md
  - services/README.md
  - services/AGENTS.md
generated:
  by: claude-code/2.1.235
  at: 2026-08-19T00:05:05Z
---

# What a worker may never own

A worker is a **specialist boundary**: it consumes inputs and returns a result.
It is a compute dependency, not a control-plane component.

A worker may never own:

- decisions about whether a caller is permitted to do something,
- deterministic safety policy,
- credentials for the home-automation system, or any device actuation,
- authoritative persistence,
- minting or verifying the internal identity envelope as an enforcement point.

The list is short and each entry is load-bearing. Together they say a worker
computes and returns, and that the platform's authority stays where it can be
reviewed in one place.

## Why this is not negotiable for convenience

It would frequently be easier to let a worker decide something small itself. That
is exactly the pressure the rule exists to resist.

The principle underneath is that a component re-enters through the same governed
enforcement point as any other caller — the rule applied to external agents,
applied to an internal component. A worker that decides for itself has become a
second enforcement point, and the platform now has two places where a control can
be added to one and missed in the other.

Nothing about proximity changes this. Sharing a host, a network, or a deployment
with the household surface conveys no trust; a component that trusts a caller
because of where it sits is a defect regardless of what it computes.

## Failing closed

An undecidable answer is never a permit. A worker that cannot reach what it needs
reports that honestly and lets the enforcement point fail closed, rather than
supplying a confident result it cannot support.

Silent degradation is prohibited. A partial or stale result must be
distinguishable from a complete one by a machine, not only by a person reading
prose afterwards.

## What this concept does not carry

No broker address, queue endpoint, or connection detail, and no live worker
state: no queue depth, no in-flight count, no current lag. Those are operational
facts with a lifetime measured in seconds, and a portable document stating them
would be confidently wrong almost immediately.
