# packages/contracts

The authored Zod contract source.

> **Status: package boundary only.** No Zod definitions — that is **issue #28**. Zod is not yet a dependency.

## What belongs here

- **Zod definitions** for request and response DTOs, path/query/header parameters,
  and domain types — the single authored source
  ([ADR-0012 §7](../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)).
- `z.infer` types, `.meta()` semantics, and the examples that flow into OpenAPI,
  the generated SDK, MCP tools, and the metadata routes.

## What does not belong here

- **Database tables.** Zod is authoritative for API and domain-facing contracts,
  **never** for persistence. A table must not become a DTO automatically.
- **Business logic.** Contracts describe shapes.
- **Generated JSON Schema** — that is [`../../schemas/`](../../schemas/), a
  generated artifact.
- **Any import from a service or an app.** This package imports nothing from the
  platform; it is the innermost layer.

## Governed by

[`../../AGENTS.md`](../../AGENTS.md) · ADRs [0006](../../docs/decisions/ADR-0006-separate-agent-implementation-profile-run-and-automation.md), [0012](../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)

## Validation

```sh
pnpm --filter @secure-home/contracts run lint
pnpm --filter @secure-home/contracts run typecheck
pnpm --filter @secure-home/contracts run build
```
