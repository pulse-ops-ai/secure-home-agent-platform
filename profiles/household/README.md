# profiles/household/

Execution profiles for the **household runner class** — runs that observe and
propose actions on the house.

> **Status: empty.** No profile exists. This directory holds only this README.

> **Blocked:** no household profile may grant a sensitive capability until agent
> delegation is modelled
> ([ADR-0004](../../docs/decisions/ADR-0004-treat-agents-as-clients.md) is
> accepted, but the model is not built) and
> [U1](../../docs/architecture/unresolved-decisions.md#u1) is resolved — it is
> not. Until then, household profiles are limited to observation.

## What a household profile grants

| Concern | Typical grant |
|---|---|
| tool surface | specific governed household tools, by capability class |
| filesystem | knowledge bundles (read-only), a scratch area |
| network | the household API only |
| routing class | usually **R0** or **R1**; **R2** for heavy analysis with a declared fallback |
| image | one derived household image: custom-loop, PydanticAI, or LangGraph |
| principal | an agent identity; whether an `actor` is required |
| limits | tight — this runs on the Pi alongside the household control path |

## Rules specific to this class

1. **Sensitive capabilities are gated.** Locks, garage doors, and alarms are not
   granted to an agent profile while delegation is unmodelled.
2. **Observation before action.** A new household agent starts read-only.
   Widening it is a separate reviewed change.
3. **`actor` requirement is explicit.** A profile states whether the run may be
   autonomous. An autonomous run has **no** `actor` and is authorized on the
   agent principal alone.
4. **Routing class matches sensitivity.** Anything on a sensitive path is R0 for
   the decision. A model may propose; it never decides
   ([ADR-0005](../../docs/decisions/ADR-0005-separate-capability-authorization-and-safety.md)).
5. **R2 declares its fallback.** The Exxact workstation may be off; no household
   operation may block on it.
6. **R3 is exceptional here.** Household state leaving the house needs a specific
   justification and declared data categories.
7. **Tight limits.** A run must not starve the household control path on a
   shared 8 GB Pi.

## What belongs here

- Versioned household profiles.
- Notes on why each grant is present and what it deliberately omits.

## What does not belong here

- **Coding profiles** — [`../coding/`](../coding/).
- **Credentials**, **agent code**, or **safety rules**.
- **Any grant that would let an agent reach Home Assistant directly.** Actuation
  is mediated, always.

## Governed by

[`../README.md`](../README.md) → [`../AGENTS.md`](../AGENTS.md) · ADRs
[0003](../../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md),
[0004](../../docs/decisions/ADR-0004-treat-agents-as-clients.md),
[0005](../../docs/decisions/ADR-0005-separate-capability-authorization-and-safety.md),
[0007](../../docs/decisions/ADR-0007-route-local-remote-and-cloud-execution-explicitly.md)

## Validation

Future: schema validation, a conformance test that an ungranted tool is
unreachable, and a check that no household profile grants a sensitive capability
while delegation is unmodelled.
