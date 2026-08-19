# knowledge/platform/degraded-operation/

**Module `platform/degraded-operation`** — how the platform behaves when parts of
it are unreachable.

| Field | Value |
|---|---|
| Status | `Validated` |
| Owner | human:mikegtech |

> **Specification.** This README is not bundle source; the authored candidate
> beside it is. Not runtime-authoritative: nothing here is packaged, published,
> or resolvable by a running profile. Registered in [`../../INDEX.md`](../../INDEX.md).

## Intended facts

- Degraded behaviour is classified by **(operation × requester)**, not by a
  global switch, into `CONTINUE`, `BOUNDED`, `FAIL CLOSED`, and `EMERGENCY`.
- **`BOUNDED` currently behaves as `FAIL CLOSED`** because the bounded-authority
  mechanism is not decided
  ([U1](../../../docs/architecture/unresolved-decisions.md#u1)). An agent must
  not treat a `BOUNDED` classification as permission.
- A denial during an outage is a **correct** outcome, not a fault to route
  around.
- Knowledge remains available during an outage precisely because it is not an
  authority — having it does not let a run act.
- Local household safety automations are not on the agent path and must keep
  working when the substrate is dead.

## Prohibited facts

- Current outage status or service health — that is live state.
- The enforced degraded-mode policy table as agent-readable configuration.

## Intended consumers

Every runner class. Household runners need it most; coding runners still need to
understand why a request failed.

## Expected queries

- "Authorization is unreachable. May I proceed with a read?"
- "Is `BOUNDED` a yes?"
- "The house is offline and knowledge is still here. Does that change what I may
  do?"

## Governing sources

[ADR-0002](../../../docs/decisions/ADR-0002-adopt-hybrid-home-deployment-profile.md) ·
[ADR-0009](../../../docs/decisions/ADR-0009-define-degraded-mode-and-offline-authorization.md) ·
[`degraded-mode.md`](../../../docs/architecture/degraded-mode.md) ·
[ADR-0010](../../../docs/decisions/ADR-0010-use-okf-for-portable-knowledge-only.md)

## Freshness and update trigger

Update when the degraded-mode classification changes, or when U1 is resolved and
`BOUNDED` stops behaving as `FAIL CLOSED`.
