# packages/errors

Problem details and the shared error taxonomy.

> **Status: package boundary only.** No error types — the taxonomy is defined with the contracts in **issue #28**.

## What belongs here

- **RFC 9457** problem details: a stable `type` URI, a machine-readable `code`,
  and field-level detail.
- The shared **error taxonomy** every service and worker reports through, so a
  caller can distinguish a denial from a binding failure from a timeout.

## What does not belong here

- **Raw framework errors** reaching a caller.
- **Messages that leak** resource existence, bounds, entity identifiers, or
  internal structure to an unauthorized caller.
- **Denials without a reason.** Every denial names the deciding control.

## Governed by

[`../../AGENTS.md`](../../AGENTS.md) · ADRs [0005](../../docs/decisions/ADR-0005-separate-capability-authorization-and-safety.md), [0012](../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)

## Validation

```sh
pnpm --filter @secure-home/errors run lint
pnpm --filter @secure-home/errors run typecheck
pnpm --filter @secure-home/errors run build
```
