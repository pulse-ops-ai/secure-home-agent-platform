# packages/typescript/contracts

The **authoring source** for the platform's API and domain-facing contracts.

> Under [ADR-0012](../../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)
> (**`Accepted`** 2026-08-06) this package holds **Zod** definitions that generate DTOs,
> `z.infer` types, runtime validation, OpenAPI schemas, MCP tool schemas,
> metadata-route content, and the published JSON Schema in
> [`../../../schemas/`](../../../schemas/). Conventions:
> [`api-contract-model.md`](../../../docs/architecture/api-contract-model.md).
>
> It is **not** a source of truth for database tables.

> **Status: no implementation.** A private workspace member with a manifest and a
> `check` script. No source, no dependencies. The schemas it will mirror do not
> exist yet.

## Future ownership

TypeScript types for: execution profile, run, action, automation, and the
household API request and response shapes the web application consumes.

## What belongs here

- Types generated from or hand-mirrored against
  [`../../../schemas/`](../../../schemas/).
- Type guards and parsing helpers.
- Version markers matching the Python binding.

## What does not belong here

- **The schemas themselves** — [`../../../schemas/`](../../../schemas/) is
  canonical.
- **React components** — those are [`../ui/`](../ui/).
- **API clients or fetch logic** — those belong to the consuming application.
- **Business logic.**
- **Secrets, endpoints, or environment-specific values.**

## Boundary rules

- Must stay consistent with
  [`../../python/contracts/`](../../python/contracts/). Drift between the two
  bindings is a defect.
- Contract changes are schema changes and follow the schema's governance.
- Private package: never published to a public registry.
- No dependencies without a reviewed decision.

## Governed by

[`../../README.md`](../../README.md) · ADRs
[0003](../../../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md),
[0006](../../../docs/decisions/ADR-0006-separate-agent-implementation-profile-run-and-automation.md)

## Validation

```sh
pnpm --filter @secure-home/contracts run check
```

Future: type generation from the schemas, and a cross-language consistency check
against the Python binding.
