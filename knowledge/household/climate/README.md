# knowledge/household/climate/

**HVAC and comfort semantics**: what the equipment is, what it can do, and what
its limits are.

> **Status: `Planned` — specification only.** No module content is authored.

| Field | Value |
|---|---|
| Status | `Planned` |
| Owner | human:mikegtech |

> Registered as module `household/climate` in [`../../INDEX.md`](../../INDEX.md).
> Specification only, and not runtime-authoritative.

## What belongs here

- Equipment mapping: which unit serves which zone, its type and capacity.
- **Operating limits** as documented facts: rated outdoor-temperature range,
  minimum cycle time, defrost behaviour, auxiliary-heat conditions.
- Zone-to-area mapping (with [`../topology/`](../topology/)).
- Comfort **conventions**: what "comfortable" means for this household, as a
  documented preference.
- Known equipment quirks and limitations.
- Runbooks: what to do when a unit locks out.
- Owner, as-of date, limitations.

## What does not belong here

- **Current temperature, setpoint, humidity, or run state.** All prohibited.
- **The enforced safety envelope.** Documenting that a heat pump is rated to
  15 °F is knowledge. The **enforced** setpoint bounds are deterministic policy,
  owned by [`../../services/control-plane/`](../../../services/control-plane/), and
  are **not** agent-readable configuration.
- **Energy pricing** — [`../energy-semantics/`](../energy-semantics/).
- **Automation definitions** — [`../../services/control-plane/`](../../../services/control-plane/).

## The distinction that matters most here

| Knowledge | Policy |
|---|---|
| "This heat pump is rated to 15 °F outdoor" | "Setpoint must stay between 60 and 82 °F" |
| descriptive; agents read it to reason | prescriptive; enforced, and not agent-editable |

Blurring these would let an agent reason from a document about what it is allowed
to do. It is not.

## Freshness

Equipment changes on replacement or service. A bundle describing a unit that was
replaced last year is confidently wrong — which is why the as-of date is
required.

## Intended consumers

Household runners reasoning about comfort or energy. Always paired with
[`../topology/`](../topology/), which supplies the zone-to-area mapping.

## Expected queries

- "What equipment serves this zone, and what is it rated to?"
- "Is this outdoor temperature outside the unit's documented range?"
- "What does this household mean by comfortable?"

## Governing sources

Precedence runs `knowledge/README.md` → `knowledge/AGENTS.md` → the ADRs below.

[ADR-0005](../../../docs/decisions/ADR-0005-separate-capability-authorization-and-safety.md) ·
[ADR-0010](../../../docs/decisions/ADR-0010-use-okf-for-portable-knowledge-only.md)

## Validation

Future: `validate` enforces the prohibited-content rules and required metadata.
