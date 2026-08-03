# schemas/

The **canonical** contract definitions for the platform's core objects. Language
bindings in [`../packages/`](../packages/) are derived from these; these are the
source of truth.

> **Status: no schema exists.** Every directory is a documented placeholder.

## Layout

| Path | Object | Governed by |
|---|---|---|
| [`execution-profile/`](execution-profile/) | what a run is permitted to do | [ADR-0003](../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md), [ADR-0007](../docs/decisions/ADR-0007-route-local-remote-and-cloud-execution-explicitly.md) |
| [`run/`](run/) | one invocation of one profile | [ADR-0006](../docs/decisions/ADR-0006-separate-agent-implementation-profile-run-and-automation.md) |
| [`action/`](action/) | a requested household action | [ADR-0005](../docs/decisions/ADR-0005-separate-capability-authorization-and-safety.md) |
| [`automation/`](automation/) | a persisted standing arrangement | [ADR-0006](../docs/decisions/ADR-0006-separate-agent-implementation-profile-run-and-automation.md) |

## What belongs here

- Schema definitions (JSON Schema is the intended form) with field
  documentation.
- Example documents, valid and invalid, used as test fixtures.
- Versioning and migration notes.

## What does not belong here

- **Language bindings** — [`../packages/python/contracts/`](../packages/python/contracts/)
  and [`../packages/typescript/contracts/`](../packages/typescript/contracts/).
- **Validation code** — that belongs to the service that validates.
- **Actual profiles or automations** — [`../profiles/`](../profiles/),
  [`../services/automation-service/`](../services/automation-service/).
- **Provider or framework names in a structural position.** A provider name is an
  opaque **value**, never a key, a type, or a variant.

## Rules every schema here must satisfy

1. **Neutral.** Adding a fourth provider or a fourth framework must require
   **zero** changes to any schema. If it does not, the schema was not neutral.
2. **Default deny.** No field whose *absence* means "allow". An omitted grant is
   a denial.
3. **Versioned.** Every object carries a schema version, and every profile and
   automation carries its own version so runs and bindings can name one exactly.
4. **Explicit absence.** Where a field's absence is meaningful — most importantly
   an autonomous run's missing `actor` — the absence is a **declared value**,
   never an empty or omitted field
   ([ADR-0004](../docs/decisions/ADR-0004-treat-agents-as-clients.md)).
5. **Correlatable.** Every object carries the identifiers needed to join it to a
   request, a decision, and an audit record.
6. **No secrets.** Schemas reference credentials by name; documents never carry
   credential values.

## Governed by

[`../AGENTS.md`](../AGENTS.md) → [`../docs/decisions/INDEX.md`](../docs/decisions/INDEX.md).

## Validation

Future: schema self-validation, valid/invalid fixture tests, a cross-language
binding-consistency check, and a lint that fails when a provider or framework
name appears in a structural position.
