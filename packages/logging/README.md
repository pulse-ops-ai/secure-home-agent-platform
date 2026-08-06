# packages/logging

Structured logging and request-context propagation.

> **Status: package boundary only.** Winston is **not** a dependency yet and no logger is configured — it arrives with the first service that needs one.

## What belongs here

- A structured logger built on **Winston**, with correlation and causation
  identifiers already bound.
- **`AsyncLocalStorage`** request context carrying request id, correlation id,
  causation id, principal `sub`, and `actor` — never threaded through function
  signatures by hand
  ([ADR-0012 §14](../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)).

## What does not belong here

- **Audit.** Audit is a **separate durable contract**, not logging: losing an
  audit record blocks a sensitive action, losing a log line does not
  ([ADR-0004](../../docs/decisions/ADR-0004-treat-agents-as-clients.md)).
- **Secrets, tokens, or household PII in log lines.** Ever.
- **`console`.**

## Governed by

[`../../AGENTS.md`](../../AGENTS.md) · ADRs [0004](../../docs/decisions/ADR-0004-treat-agents-as-clients.md), [0012](../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)

## Validation

```sh
pnpm --filter @secure-home/logging run lint
pnpm --filter @secure-home/logging run typecheck
pnpm --filter @secure-home/logging run build
```
