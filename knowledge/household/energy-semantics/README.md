# knowledge/household/energy-semantics/

**Gridwise tariff and telemetry semantics** — what the energy data *means*.

> **Status: `Planned` — specification only.** No module content is authored.

| Field | Value |
|---|---|
| Status | `Planned` |
| Owner | @mikegtech |
| Blocked by | [U7](../../../docs/architecture/unresolved-decisions.md#u7) |

> Registered as module `household/energy-semantics` in [`../../INDEX.md`](../../INDEX.md).
> Specification only, and not runtime-authoritative.

## The relationship

Gridwise already provides energy intelligence: tariff modelling, consumption
analysis, cost signals. **This repository does not reimplement any of it.**
Gridwise is an upstream source consumed through its own interface.

What lives here is the **semantic layer**: what a rate structure means, what a
metric represents, what units it uses, and how to interpret it — so an agent can
reason about an energy signal instead of pattern-matching a number.

## What belongs here

- **Tariff semantics**: what a time-of-use structure is, what defines a peak
  window, how demand charges work, what a critical-peak event means.
- **Metric semantics**: what each Gridwise metric represents, its unit, its
  sampling interval, and its known caveats.
- **Interpretation guidance**: what a signal implies for household behaviour —
  as documented reasoning, never as an authority to act.
- Known limitations of the data.
- Owner, as-of date, limitations.

## What does not belong here

- **Current or historical rates, prices, or consumption readings.** All live or
  time-series data is state.
- **Credentials or endpoints** for the Gridwise interface.
- **Household consumption telemetry** — raw personal telemetry is prohibited.
- **Automations** that act on energy signals —
  [`../../services/control-plane/`](../../../services/control-plane/).
- **Enforced policy.** "Do not pre-cool below 68 °F" is deterministic policy, not
  knowledge.

## A price signal is an input, not an authority

An agent may use a peak-price signal to *propose* pre-cooling. The proposal is
still subject to authorization and to the deterministic safety envelope. Cost
never justifies leaving the envelope
([ADR-0005](../../../docs/decisions/ADR-0005-separate-capability-authorization-and-safety.md)).

## Intended consumers

Household runners reasoning about cost or load shifting.

## Expected queries

- "What defines a peak window under this tariff structure?"
- "What does this metric represent, and in what units?"
- "What are the known caveats of this data?"

## Governed by

[`../README.md`](../../README.md) → [`../AGENTS.md`](../../AGENTS.md) ·
[ADR-0010](../../../docs/decisions/ADR-0010-use-okf-for-portable-knowledge-only.md)

## Validation

Future: `validate` enforces the prohibited-content rules and required metadata.
