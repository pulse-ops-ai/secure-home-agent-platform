# packages/testing

Shared test configuration and, eventually, shared helpers.

> **Status: configuration only.** There are no helpers, doubles, or fixtures
> yet — those arrive with the first suite that needs the same one twice.

## Test runner: Vitest

Chosen for ESM-native execution, TypeScript without a separate transform step,
and V8 coverage that needs no native build — so it works identically on x86_64
CI and the ARM64 Raspberry Pi.

## Shared configuration

```ts
// a member's entire vitest.config.ts
import { definePackageConfig } from '@secure-home/testing/vitest'
export default definePackageConfig()
```

| Default | Value | Why |
|---|---|---|
| environment | `node` | There is no browser code here. A jsdom default would mask a Node-only mistake. |
| `globals` | `false` | Explicit imports; a test file reads as an ordinary module and needs no ambient types. |
| unit include | `src/**/*.test.ts` | Unit tests live beside their source. |
| integration include | `tests/integration/**/*.test.ts` | Separate, and separately timed. |
| exclude | `dist`, `node_modules`, `coverage` | Never collect from generated output. |
| unit timeout | 5s | Deterministic. A test that depends on machine speed fails on a loaded Pi and passes on CI, which trains people to re-run rather than investigate. |
| integration timeout | 30s | Real dependencies are slower. |
| `clearMocks` / `restoreMocks` | `true` | Mock state never leaks between tests. |
| coverage | V8, `text-summary` + `lcov` | Measures `src`, excludes tests. |
| coverage thresholds | **none yet** | Every package boundary is empty, so any number would either be 0 or fail the build. Thresholds arrive with the first package that has behaviour to cover. |
| `setupFiles` | unset | The extension point. A package passes its own; nothing is registered globally, so no package inherits setup it did not ask for. |

`defineIntegrationConfig()` reserves the integration shape. The infrastructure
integration tests will need — containers, fixtures, a live dependency — is
deliberately **not** implemented; this only ensures integration tests are not
later bolted on with their own conventions.

## Why the config is JavaScript

`vitest.base.js` is plain JSDoc-typed ESM, not TypeScript, and is exported
directly rather than from `dist/`. A consumer's `vitest.config.ts` imports it, so
if it were built TypeScript then `pnpm test` would fail on a clean checkout until
`pnpm build` had run. **A config that requires a build to run tests is a
bootstrapping trap.**

## What does not belong here

- **Helpers with exactly one consumer.** Keep them in that suite until a second
  appears.
- **Speculative mocks.** A double for a service that does not exist yet encodes
  a guess about its interface.
- **Real credentials, device identifiers, or household data** in fixtures.
- **Fixtures requiring a network or a live service.** Tests run offline.
- **A production dependency on this package.** It is devDependency-only, and
  [`../../scripts/check-workspace.mjs`](../../scripts/check-workspace.mjs)
  enforces that.

## Governed by

[`../../AGENTS.md`](../../AGENTS.md) ·
[ADR-0012](../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)

## Validation

```sh
pnpm --filter @secure-home/testing run test
```
