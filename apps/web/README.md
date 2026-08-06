# apps/web

The household web application.

> **Status: package boundary only.** No Next.js scaffold, no route, no page, no BFF — that needs its own issue. This directory previously had no manifest at all; it is now a discoverable workspace member that compiles.

## What belongs here

- Routes, pages, layouts, and the BFF, once scaffolded.
- Consuming the **same Zod contracts** the control plane enforces, from
  [`packages/contracts`](../../packages/contracts/) — no re-declared types, no
  hand-written client models.
- Filter and sort controls driven by the module projection configs or the
  metadata routes, so the UI cannot offer a query the API would reject.

## What does not belong here

- **Authorization decisions.** The UI renders decisions; it never makes one.
  Hiding a control is not authorization.
- **Home Assistant access** of any kind.
- **Secrets in client code.**
- **Backend process behaviour.** This is the only human-facing application; the
  deployable backends are [`../../services/`](../../services/).

## Governed by

[`../../AGENTS.md`](../../AGENTS.md) · ADRs [0009](../../docs/decisions/ADR-0009-define-degraded-mode-and-offline-authorization.md), [0012](../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)

## Validation

```sh
pnpm --filter @secure-home/web run lint
pnpm --filter @secure-home/web run typecheck
pnpm --filter @secure-home/web run build
```
