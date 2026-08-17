# knowledge/household/topology/

The **structure** of the house: floors, areas, rooms, and how they relate.

> **Status: `Planned` — specification only.** No module content is authored.

| Field | Value |
|---|---|
| Status | `Planned` |
| Owner | human:mikegtech |

> Registered as module `household/topology` in [`../../INDEX.md`](../../INDEX.md).
> Specification only, and not runtime-authoritative.

## What belongs here

- Floors, areas, rooms, and their containment relationships.
- Which areas are served by which systems (as **structure**, not as state).
- Adjacency and access relationships relevant to reasoning — for example, which
  rooms share a thermal zone.
- Naming: the canonical name of each area, and the aliases a household member
  might say aloud.
- Owner, as-of date, and limitations.

## What does not belong here

- **Live occupancy or presence.** Prohibited.
- **Current readings** of any kind.
- **Device state.** "There is a smart lock on the front door" is topology.
  "The front door is unlocked" is state.
- **Authorization.** "Who may enter this room" is owned by the decision point.
- **Personally identifying detail** about household members.
- **Physical addresses or network addresses.**

## Why this matters

Topology is what lets an agent understand that "make the upstairs comfortable"
concerns three rooms on one zone. Without it, an agent reasons about device
identifiers with no idea what they mean.

## Freshness

Topology changes rarely — a renovation, a new device, a room repurposed. The
as-of date matters precisely *because* it changes rarely: a stale topology is
confidently wrong for a long time.

## Intended consumers

Household runners. A coding runner has no reason to know the shape of the house.

## Expected queries

- "Which rooms does the upstairs zone serve?"
- "What is the canonical name for the room a person just called `the den`?"
- "Are these two areas thermally adjacent?"

## Governed by

[`../README.md`](../../README.md) → [`../AGENTS.md`](../../AGENTS.md) ·
[ADR-0010](../../../docs/decisions/ADR-0010-use-okf-for-portable-knowledge-only.md)

## Validation

Future: `validate` enforces the prohibited-content rules and required metadata.
