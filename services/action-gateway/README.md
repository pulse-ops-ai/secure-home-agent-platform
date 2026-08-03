# services/action-gateway

**Action mediation.** The single, narrow choke point between the platform and
the physical house — and the **only** holder of Home Assistant credentials.

> **Status: not implemented.** A workspace member with a manifest and a
> placeholder package. No Home Assistant client, no credentials, no dependencies.

## Why one component

[ADR-0004](../../docs/decisions/ADR-0004-treat-agents-as-clients.md) forbids
distributing Home Assistant credentials to runners or services. Concentrating
them here makes this the highest-value credential holder in the house — accepted
deliberately, because one reviewable choke point is far better than credentials
scattered across runners.

**Its surface must therefore be as narrow as possible.** Every capability added
here widens the most sensitive component in the system.

## Future ownership

- The Home Assistant client and its credential.
- Translating an approved platform action into a device command.
- Action atomicity: a request either takes effect or does not. A killed caller
  must never leave a garage door half-open.
- The action audit record: run, profile version, `sub`, `actor`, authorization
  decision, safety verdict, command, outcome.

## What belongs here

- Home Assistant integration and credential handling.
- Action execution and its atomicity guarantees.
- Device-command mapping and the action audit record.

## What does not belong here

- **Authorization decisions.** Made before this service is called.
- **Safety-policy rules.** Made by [`../policy-engine/`](../policy-engine/)
  before this service is called.
- **Business logic or orchestration** — that is [`../pi-api/`](../pi-api/).
- **Any second Home Assistant client** anywhere else in the repository.

## Boundary rules

- Executes **only** when authorization permitted **and** safety policy approved.
  It does not re-decide; it also does not act on an unverified request.
- Verifies the internal identity envelope. Being on the same Docker network is
  not authority.
- Its credential is **never** readable by a runner, an agent, or another service.
- Every action and every refusal is audited.

## Open

The credential strategy is [U10](../../docs/architecture/unresolved-decisions.md#u10).
Home Assistant's own permission model is coarse; if the chosen credential cannot
be scoped as narrowly as required, the compensating control must be documented.

## Governed by

[`../AGENTS.md`](../AGENTS.md) · ADRs
[0004](../../docs/decisions/ADR-0004-treat-agents-as-clients.md),
[0005](../../docs/decisions/ADR-0005-separate-capability-authorization-and-safety.md),
[0009](../../docs/decisions/ADR-0009-define-degraded-mode-and-offline-authorization.md)

## Validation

`uv run ruff check .`, `uv run mypy`, `uv run pytest`. Future: a repository-wide
check that no other package imports a Home Assistant client.
