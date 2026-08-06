# packages/api-contracts

Operation contracts and the operation catalog.

> **Status: package boundary only.** No operation contracts, no catalog — that is **issue #28**.

## What belongs here

- The **operation contract** shape: `operationId`, method and path, input and
  output schemas, capability, sensitivity, side-effect class, confirmation
  posture, idempotency, audit event names, degraded-mode semantics.
- The **operation catalog** and its MCP allowlist
  ([ADR-0012 §10](../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)).

## What does not belong here

- **The Zod schemas themselves** — [`../contracts/`](../contracts/).
- **OpenAPI generation or the normalization pipeline** — that belongs with the
  service that produces the document.
- **Automatic MCP exposure.** Eligibility is a reviewed property of an operation,
  never a side effect of a route existing.

## Governed by

[`../../AGENTS.md`](../../AGENTS.md) · [ADR-0012](../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)

## Validation

```sh
pnpm --filter @secure-home/api-contracts run lint
pnpm --filter @secure-home/api-contracts run typecheck
pnpm --filter @secure-home/api-contracts run build
```
