# profiles/schema/

Documentation of the execution-profile schema — how to read it, how to author
against it, and what its fields mean.

> **The canonical schema lives in
> [`../../schemas/execution-profile/`](../../schemas/execution-profile/)**, not
> here. This directory holds the human-facing explanation.

> **Status: neither exists yet.** No schema, no authoring guide.

## What belongs here

- Field-by-field explanation of the profile schema, in plain language.
- Authoring guidance and worked examples.
- Migration notes when the schema version changes.
- The **rationale** for each field: what it protects, and what happens if it is
  omitted.

## What does not belong here

- **The schema file itself** — [`../../schemas/execution-profile/`](../../schemas/execution-profile/).
- **Actual profiles** — [`../coding/`](../coding/), [`../household/`](../household/).
- **Validation code** — [`../../services/runner-control/`](../../services/runner-control/).

## Design constraints the schema must satisfy

1. **Neutral.** No provider or framework name in a structural position. Adding a
   fourth provider must require **zero** schema changes
   ([ADR-0003](../../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md),
   [ADR-0011](../../docs/decisions/ADR-0011-keep-coding-agent-images-provider-specific.md)).
2. **Default deny.** An omitted grant means denied. There must be no field whose
   absence means "allow".
3. **Routing class required.** Every profile declares R0–R3 and, if it declares a
   fallback, that the fallback is downward only
   ([ADR-0007](../../docs/decisions/ADR-0007-route-local-remote-and-cloud-execution-explicitly.md)).
4. **Versioned.** Profiles are identifiable by version so runs and automations
   can name one exactly
   ([ADR-0006](../../docs/decisions/ADR-0006-separate-agent-implementation-profile-run-and-automation.md)).
5. **Limits required.** No unbounded wall clock, memory, or output size.
6. **Credential references, not credentials.**
7. **Digest-pinned images.**

## Governed by

[`../README.md`](../README.md) → [`../AGENTS.md`](../AGENTS.md)

## Validation

Future: the schema is a JSON Schema validated in CI, and
[`../../tests/profile-conformance/`](../../tests/profile-conformance/) proves
that an omitted grant denies.
