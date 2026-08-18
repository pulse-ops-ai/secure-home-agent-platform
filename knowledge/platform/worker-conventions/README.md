# knowledge/platform/worker-conventions/

**Module `platform/worker-conventions`** — what every background worker owes the
platform.

| Field | Value |
|---|---|
| Status | `Planned` |
| Owner | human:mikegtech |

> Specification only. No module content is authored, and this directory is not
> runtime-authoritative. Registered in [`../../INDEX.md`](../../INDEX.md).

## Intended facts

- The standard worker contract: lifecycle and graceful shutdown, validated
  configuration, health reporting, cancellation, retry and dead-letter handling,
  bounded concurrency, metrics, idempotency, and a shared error taxonomy.
- That a worker is a deployable process and lives under `services/`, while the
  shared runtime contract is a package.
- That an inference worker is a **specialist boundary**: it computes and returns,
  and it owns none of the platform's authority.
- That the Pi carries the household control path, so a worker must not starve it.

## Prohibited facts

- Queue endpoints, broker addresses, or connection details.
- Live worker state: queue depth, in-flight counts, current lag.

## Intended consumers

Coding runners implementing or changing a worker.

## Expected queries

- "What must my worker implement before it is complete?"
- "May this worker call the authorization decision point directly?"
- "What happens to an in-flight job on shutdown?"

## Governing sources

[ADR-0012 §18](../../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md) ·
[`services/README.md`](../../../services/README.md) ·
[`services/AGENTS.md`](../../../services/AGENTS.md)

## Freshness and update trigger

Update when the worker runtime contract or the inference-boundary rules change.
