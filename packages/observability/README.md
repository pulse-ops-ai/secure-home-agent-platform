# packages/observability

Metrics and tracing hooks.

> **Status: package boundary only.** No exporter, no tracer, and no metric is registered.

## What belongs here

- Metric and tracing **hooks** the platform emits through, so instrumentation is
  uniform across services and workers.
- Trace-context propagation consistent with the request context in
  [`../logging/`](../logging/).

## What does not belong here

- **A vendor SDK or exporter choice.** That is a deployment concern and needs its
  own decision.
- **Logging** — [`../logging/`](../logging/).
- **Audit** — a separate durable contract.
- **Anything that can fail a household request.** Observability must degrade
  silently; it must never take a household action down.

## Governed by

[`../../AGENTS.md`](../../AGENTS.md) · [ADR-0012](../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)

## Validation

```sh
pnpm --filter @secure-home/observability run lint
pnpm --filter @secure-home/observability run typecheck
pnpm --filter @secure-home/observability run build
```
