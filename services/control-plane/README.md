# services/control-plane

Household control plane.

> **Status: package boundary only.** No NestJS module, no Fastify adapter, no HTTP surface, no enforcement path — that is **issue #26**. The manifest, tsconfig, and an empty `src/index.ts` exist so the deployable boundary is discoverable, compiles, and can be depended on.

## What belongs here

- The household API surface and the governed enforcement point clients and agents
  re-enter through.
- Authorization enforcement, deterministic safety policy, action mediation, and
  automations — as **Nest modules in this one process**
  ([ADR-0012 §5](../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)).
  They sit on one request path behind one enforcement point and must fail closed
  together.

## What does not belong here

- **Home Assistant clients or credentials.** Only the action-mediation module,
  and only once [U10](../../docs/architecture/unresolved-decisions.md#u10) is
  decided.
- **Persistence.** No toolkit is selected
  ([U11](../../docs/architecture/unresolved-decisions.md#u11)) — no schema, no
  migration, no repository.
- **Contract definitions** — those are [`packages/contracts`](../../packages/contracts/).
- **The runner substrate** — that is [`../runner-control/`](../runner-control/),
  a separate process on purpose.

## Governed by

[`../../AGENTS.md`](../../AGENTS.md) · ADRs [0002](../../docs/decisions/ADR-0002-adopt-hybrid-home-deployment-profile.md), [0004](../../docs/decisions/ADR-0004-treat-agents-as-clients.md), [0005](../../docs/decisions/ADR-0005-separate-capability-authorization-and-safety.md), [0008](../../docs/decisions/ADR-0008-use-openfga-for-relationships-and-deterministic-policy-for-safety.md), [0012](../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)

## Validation

```sh
pnpm --filter @secure-home/control-plane run lint
pnpm --filter @secure-home/control-plane run typecheck
pnpm --filter @secure-home/control-plane run build
```
