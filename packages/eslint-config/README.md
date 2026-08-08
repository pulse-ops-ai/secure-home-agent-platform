# packages/eslint-config

Shared ESLint flat configuration. A member's `eslint.config.js` is two lines;
parser and project settings are never re-declared.

## Export matrix

| Export | Extends | Adds |
|---|---|---|
| `/base` | — | recommended + **type-checked** rules, unused vars, ESM type imports, `no-console`, `no-explicit-any` |
| `/node` | `base` | Node globals, no DOM |
| `/library` | `node` | `explicit-module-boundary-types`; **forbids `process` access** — a library takes configuration as a parameter |
| `/service` | `node` | boundary types off — a service is a composition root and *may* read the environment |
| `/application` | `node` | same as `service`; separate so framework rules can land without touching services |
| `/test` | `node` | relaxes surface rules on test files; **keeps `no-floating-promises` and the unsafe-* rules**, because a test whose assertions silently never run is worse than no test |

```js
// a member's entire eslint.config.js
import config from '@secure-home/eslint-config/library'
export default config
```

## Type-aware linting

`projectService: true` resolves each file against its nearest `tsconfig.json`,
so rules that need types — `no-floating-promises`, the `unsafe-*` family —
actually run. That is why every member has a `tsconfig.json` covering `src`
**and** `tests`.

Two narrow escapes, both deliberate:

- `allowDefaultProject: ['*.config.ts']` — a package-root `vitest.config.ts` sits
  outside the tsconfig `include`, correctly: it is tooling, not build input.
- JavaScript files get `disableTypeChecked`. They are not in a TypeScript
  project, so type-aware rules cannot run on them; turning them off explicitly is
  the difference between a lint result and a parse error.

## What is not here

- **Formatting.** Prettier is the single authority — see below.
- **Import direction.** ESLint checks *source imports*;
  [`../../scripts/check-workspace.mjs`](../../scripts/check-workspace.mjs)
  checks *manifest declarations*. They are distinct, and neither substitutes for
  the other. Manifest direction is enforced today; a source-import rule arrives
  when packages actually import each other.
- **Framework rules.** No NestJS, Next.js, React, or Zod rule. A test asserts
  this, so a framework rule cannot slip in.
- **Fixtures.** `tests/fixtures/**` is ignored repository-wide: those files are
  deliberately-invalid code whose purpose is to make a rule fire.

## Formatting: Prettier, and only Prettier

One authority, chosen explicitly:

- ESLint 10 ships **no formatting rules in core**, and this package adds no
  stylistic plugin — so there is nothing to disable and no conflict to arbitrate.
  `eslint-config-prettier` is therefore unnecessary, not merely omitted.
- `printWidth: 100` matches ruff's `line-length = 100`, so TypeScript and Python
  wrap the same way.
- Python is in `.prettierignore`: ruff formats it. Two formatters over one file
  is the exact conflict this rule exists to prevent.
- Markdown is ignored too — Prettier reflows prose in ways that fight
  hand-wrapped documentation and Mermaid blocks.

```sh
pnpm run format         # write
pnpm run format:check   # verify — this is what CI runs
```

## Governed by

[`../../AGENTS.md`](../../AGENTS.md) ·
[ADR-0012](../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)

## Validation

```sh
pnpm --filter @secure-home/eslint-config run test   # lints real fixtures
```

The tests run the real ESLint API against valid and deliberately-invalid
fixtures, so a rule that stops firing fails the build rather than drifting.
