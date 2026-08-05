# packages/python/contracts

Typed Python models for the platform's core objects, derived from the canonical
schemas in [`../../../schemas/`](../../../schemas/).

> **Status: no implementation.** A placeholder package with a docstring. The
> schemas it will mirror do not exist yet either.

## Future ownership

Typed models for: execution profile, run, action, automation, the internal
identity envelope claim set, and the authorization decision request and
response.

## What belongs here

- Typed models mirroring [`../../../schemas/`](../../../schemas/).
- Serialization and validation helpers for those models.
- Version markers so a consumer can tell which schema version it holds.

## What does not belong here

- **The schemas themselves.** [`../../../schemas/`](../../../schemas/) is
  canonical; this package is a binding.
- **Business logic.** Contracts describe shapes, not behaviour.
- **Provider or framework names** in a structural position.
- **Anything that reads a knowledge bundle file directly**
  ([ADR-0010](../../../docs/decisions/ADR-0010-use-okf-for-portable-knowledge-only.md)).

## Boundary rules

- Must stay consistent with [`../../typescript/contracts/`](../../typescript/contracts/).
- Contract changes are schema changes and follow the schema's governance.
- No dependencies without a reviewed decision.

## Governed by

[`../../README.md`](../../README.md) · ADRs
[0003](../../../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md),
[0006](../../../docs/decisions/ADR-0006-separate-agent-implementation-profile-run-and-automation.md)

## Validation

`uv run ruff check .`, `uv run mypy`, `uv run pytest`. Future: round-trip
validation against the JSON Schemas and cross-language consistency.
