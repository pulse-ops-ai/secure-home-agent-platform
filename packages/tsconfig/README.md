# packages/tsconfig

Shared TypeScript compiler configurations. Every TypeScript member extends one
of these; no member restates compiler options.

## The configs

```
base ──┬── library       packages/*        emits declarations for consumers
       ├── service       services/*        no ambient types unless opted in
       ├── application   apps/*            no declarations — nothing consumes them
       └── test          any tests/        type-checked, never emitted
```

A deliberately **narrow, one-level chain**. A deeper chain makes "why is this
flag on?" a multi-file question.

Consumed by **package export path**, never a relative traversal:

```json
{ "extends": "@secure-home/tsconfig/library" }
```

`${configDir}` makes `rootDir`, `outDir`, and `exclude` resolve against the
**consuming** package. Without it a shared `rootDir` resolves against this
package and every build fails.

## Every strictness flag is a decision

| Flag | Setting | Why |
|---|---|---|
| `strict` | on | The baseline. Everything below is what `strict` does *not* cover. |
| `noUncheckedIndexedAccess` | on | `a[0]` is `T \| undefined`. Household code reads arrays and maps of device state, where a missing entry is a real case, not a theoretical one. |
| `exactOptionalPropertyTypes` | on | `{ a?: string }` must not accept `{ a: undefined }`. An explicitly-undefined field and an absent field mean different things in an API contract. |
| `noImplicitOverride` | on | An accidental override is a silent behaviour change. |
| `noFallthroughCasesInSwitch` | on | Fallthrough is almost always a missing `break`. |
| `noImplicitReturns` | on | A branch that forgets to return yields `undefined` at runtime. |
| `noPropertyAccessFromIndexSignature` | on | See the consequence below. |
| `useUnknownInCatchVariables` | on | A caught value is `unknown`; assuming `Error` is how a handler crashes. |
| `verbatimModuleSyntax` | on | Type and value imports stay distinct, which ESM needs and which bundlers rely on. |
| `isolatedModules` | on | Each file must be transpilable alone — required by every fast transpiler. |
| `forceConsistentCasingInFileNames` | on | The Pi is case-sensitive; a developer machine may not be. |
| `declaration` + `declarationMap` + `sourceMap` | on | A consumer gets types and can step into source. `application` turns declarations off — nothing consumes an app. |
| `noEmitOnError` | on | A build that fails must not leave a stale, partially-valid `dist/`. |
| `skipLibCheck` | on | Third-party `.d.ts` errors are not this repository's to fix. |
| `module`/`moduleResolution` | `NodeNext` | Node 24 ESM. Also makes explicit `.js` extensions in relative imports a compiler error, so ESM correctness needs no lint rule. |

### Two documented consequences

**1. `process.env` needs bracket access.** `noPropertyAccessFromIndexSignature`
makes `process.env.FOO` an error; write `process.env['FOO']`. Combined with
`noUncheckedIndexedAccess` the result is `string | undefined`, which is the
truth. Accepted deliberately — the alternative is pretending an env var is
always present.

**2. NestJS will need two more flags.** `experimentalDecorators` and
`emitDecoratorMetadata` are **not** set in `service`. They are framework-specific
and belong to the issues that scaffold NestJS (#26, #27), which will add them to
those services. `verbatimModuleSyntax` is compatible with NestJS DI provided
injected classes are imported as values, not with `import type`.

## Package build template

Two projects per member, so lint sees tests and `dist/` never does:

| File | Extends | Covers | Emits |
|---|---|---|---|
| `tsconfig.json` | `@secure-home/tsconfig/test` | `src` **and** `tests` | no |
| `tsconfig.build.json` | `library` / `service` / `application` | `src` only | yes |

```jsonc
// scripts
"typecheck": "tsc --noEmit",              // tsconfig.json — includes tests
"build": "tsc -p tsconfig.build.json"     // src only → dist/
```

`tsc` alone. **No bundler**: these are pure TypeScript packages consumed inside
the workspace, so a bundler would add configuration and build time for nothing.
Introduce one when there is evidence it is needed.

## What does not belong here

- **Per-package overrides that weaken strictness.** A member needing to relax a
  rule says why in its own tsconfig; it does not change the shared base.
- **Path aliases across package boundaries.** Packages depend on each other
  through `workspace:*`, never compiler paths — an alias would let a package
  import an outer layer invisibly, defeating the layer map in
  [`../../scripts/check-workspace.mjs`](../../scripts/check-workspace.mjs).
- **Framework flags.** They belong to the issue that introduces the framework.
- **Comments inside `compilerOptions`.** TypeScript rejects unknown options
  (TS5023). Rationale goes here instead.

## Governed by

[`../../AGENTS.md`](../../AGENTS.md) ·
[ADR-0012](../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)

## Validation

```sh
pnpm --filter @secure-home/tsconfig run test   # compiles fixtures against every role
```
