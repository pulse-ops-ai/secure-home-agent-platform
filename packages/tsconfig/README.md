# packages/tsconfig

Shared TypeScript compiler configurations.

> **Status: minimal and real.** Three configs, used by every TypeScript member.

## What belongs here

- `base.json` — the strict compiler options every member shares.
- `library.json` — for packages.
- `service.json` — for deployable services and applications.

`${configDir}` makes `rootDir` and `outDir` resolve against the **consuming**
package rather than this one.

## What does not belong here

- **Per-package overrides that weaken strictness.** A member needing to relax a
  rule says why in its own tsconfig; it does not change the shared base.
- **Path aliases across package boundaries.** Packages depend on each other
  through `workspace:*`, never through compiler paths — an alias would let a
  package import an outer layer invisibly.

## Governed by

[`../../AGENTS.md`](../../AGENTS.md) · [ADR-0012](../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)

## Validation

```sh
pnpm --filter @secure-home/tsconfig run lint
pnpm --filter @secure-home/tsconfig run typecheck
pnpm --filter @secure-home/tsconfig run build
```
