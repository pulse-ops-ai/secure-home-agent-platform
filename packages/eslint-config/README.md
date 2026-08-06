# packages/eslint-config

Shared ESLint flat configuration.

> **Status: minimal and real.** It lints TypeScript and lints itself. It does **not** yet enforce architectural import direction — that needs a dependency-graph rule and arrives once packages actually import each other.

## What belongs here

- The shared flat config every workspace member extends.
- Correctness rules that apply everywhere.

## What does not belong here

- **Architectural import direction — not yet.**
  [ADR-0012 §15](../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)
  requires it;
  [`../../scripts/check-workspace.mjs`](../../scripts/check-workspace.mjs)
  enforces it at the **manifest** level today, and an ESLint rule will enforce it
  at the **import** level when there are imports to check.
- **Formatting preferences.** A rule needs a defect behind it.
- **Version declarations** — those come from the pnpm catalog.

## Governed by

[`../../AGENTS.md`](../../AGENTS.md) · [ADR-0012](../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)

## Validation

```sh
pnpm --filter @secure-home/eslint-config run lint
pnpm --filter @secure-home/eslint-config run typecheck
pnpm --filter @secure-home/eslint-config run build
```
