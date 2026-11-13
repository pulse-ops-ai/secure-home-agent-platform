# knowledge/household/

Current governance state is not authored here. Use [the canonical registry](../../governance/state.json),
[its generated projection](../../governance/STATE.md), or
`node scripts/query-governance-state.mjs --json` from the repository root.
Registry data grants no implementation or runtime authority.

**Household-domain knowledge modules** — what the house *is* and what its signals
*mean*.

Module ownership and authoring eligibility are recorded in
[the catalog](../catalog.json), not inferred from a question-resolution copy.
Use canonical governance for the format question and the catalog for its
independent domain-specific gates.

## Modules

| Module | Domain |
|---|---|
| [`topology/`](topology/) | floors, areas, rooms, and their relationships |
| [`climate/`](climate/) | HVAC equipment mapping, zones, capacities, operating limits |
| [`security-semantics/`](security-semantics/) | what security signals mean, and what the system does not detect |
| [`energy-semantics/`](energy-semantics/) | tariff and telemetry semantics — what the energy data means |

These directories were previously `home-topology/`, `climate/`, `security/`, and
`gridwise/` at the top of `knowledge/`. They are unchanged in scope; grouping
them under `household/` separates house-domain knowledge from
[`../platform/`](../platform/) so that a coding set and a household set can be
composed without either dragging in the other.

## The rule that separates this from `platform/`

**A coding runner receives no household knowledge by default, and a household
runner receives no developer-platform conventions by default.** Neither needs the
other to do its job, and least-context selection is a control, not a preference.

## Prohibited across every module here

Live readings, current presence or occupancy, alarm or lock state, camera media,
access history, authorization grants, household member names, device identifiers,
and network addresses. Household modules are the ones where a leak would matter
most, because a knowledge bundle is portable by design.

## Governed by

[`../README.md`](../README.md) → [`../AGENTS.md`](../AGENTS.md) ·
[ADR-0010](../../docs/decisions/ADR-0010-use-okf-for-portable-knowledge-only.md)
