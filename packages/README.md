# packages/

**Reusable libraries with no runtime identity of their own.** A directory belongs
here when it is *imported* rather than *deployed*
([ADR-0012 §5](../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md),
**`Accepted`** 2026-08-06). Deployable processes are [`../services/`](../services/);
human-facing applications are [`../apps/`](../apps/).

All packages are TypeScript. Python is not a package language here — it is
confined to [`../services/workers/python-inference`](../services/workers/python-inference/),
the single admitted inference boundary.

> **Status: no package has an implementation.** Each is a workspace member with a
> manifest, a placeholder module, and a README describing future ownership.

## Layout

| Path | Purpose |
|---|---|
| [`contracts/`](contracts/) | The **authored Zod source** for API and domain-facing contracts |
| [`api-contracts/`](api-contracts/) | Operation contracts and the operation catalog |
| [`query-model/`](query-model/) | Projection configuration and the validated query AST |
| [`worker-base/`](worker-base/) | The standard worker runtime contract — **boundary only** |
| [`logging/`](logging/) | Structured logging and request-context propagation |
| [`observability/`](observability/) | Metrics and tracing hooks |
| [`errors/`](errors/) | RFC 9457 problem details and the shared error taxonomy |
| [`events/`](events/) | Run event and evidence contracts |
| [`runner-core/`](runner-core/) | The trusted runner decision core — pure decisions over captured authority and host observations |
| [`testing/`](testing/) | Shared test helpers and fixtures |
| [`eslint-config/`](eslint-config/) | Shared ESLint flat configuration |
| [`tsconfig/`](tsconfig/) | Shared TypeScript compiler configurations — `base`, `library`, `service`, `application`, `test` |

## One governed tooling surface

Every TypeScript member consumes the same three packages, by **export path**
rather than relative traversal, so there is no copied configuration to drift:

```jsonc
// tsconfig.json        — lint + typecheck project (src AND tests, never emits)
{ "extends": "@secure-home/tsconfig/test" }
// tsconfig.build.json  — emit project (src only)
{ "extends": "@secure-home/tsconfig/library" }
```

```js
// eslint.config.js
import config from '@secure-home/eslint-config/library'
export default config
```

```ts
// vitest.config.ts
import { definePackageConfig } from '@secure-home/testing/vitest'
export default definePackageConfig()
```

The full build template, every strictness decision, and the two documented
consequences are in [`tsconfig/README.md`](tsconfig/README.md).
**Formatting is Prettier only** — see [`eslint-config/README.md`](eslint-config/README.md).

> **Every package except `eslint-config` and `tsconfig` is an empty boundary.**
> They exist so the workspace, dependency direction, and CI target selection are
> real and testable. Contents arrive with the issues that own them.

## What belongs here

Code that is **imported by more than one** service, app, or agent, and that has
no deployment identity of its own.

## What does not belong here

- **Deployable services** — [`../services/`](../services/). A package is
  imported; a service is deployed.
- **Agent implementations** — [`../agents/implementations/`](../agents/implementations/).
- **Applications** — [`../apps/`](../apps/).
- **Hand-authored JSON Schema.** The authored source is Zod, in
  [`contracts/`](contracts/) (and [`events/`](events/) for the run-event and
  evidence vocabulary) — ADR-0012 §7. [`../schemas/`](../schemas/) holds the
  **generated, published** JSON Schema derived from that source; it is output,
  never a second authoring surface.
- **Anything used by exactly one consumer.** Keep it in that consumer until a
  second one exists. Premature sharing is how a package becomes a dumping
  ground.
- **Home Assistant clients or credentials** — only
  [`../services/control-plane/`](../services/control-plane/).

## Dependency direction

[ADR-0012 §15](../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)
(**`Accepted`** 2026-08-06) fixes one direction, to be enforced in CI:

```
contracts  ←  domain  ←  application  ←  adapters  ←  apps
```

Dependencies point **inward only**. `contracts` imports nothing from the
platform; no package imports a service or an application.

**Version governance is separate from import governance** (ADR-0012 §19):
**pnpm catalogs** hold canonical shared versions, **Syncpack** enforces manifest
consistency against them, and the **lockfile** is the resolved graph. None of
those sees direction — Syncpack would happily approve a manifest in which
`contracts` depends on an application.

Direction is enforced by two checks that are deliberately **not** the same one:

| Check | Reads | Catches |
|---|---|---|
| [`check-workspace.mjs`](../scripts/check-workspace.mjs) | manifests | an outward **declaration** in a runtime dependency field |
| [`check-source-imports.mjs`](../scripts/check-source-imports.mjs) | `src/**` and every other source file | an outward **import**, including one licensed by a `devDependency` |

The second exists because the first cannot see it: `devDependencies` are excluded
from manifest layering (every package devDepends on `@secure-home/testing`), so
without a source-level check a package could devDepend on an outer package and
import it from `src/**` with every gate green. Production source additionally may
not import a test-only or build-tooling package at all.

That separation is what lets a single Zod
definition be reused by a NestJS controller, a Next.js page, a generated SDK, an
MCP tool, and a test without any of them re-declaring it.

## Ownership and boundary rules

1. **One authored source per contract.** Under
   [ADR-0012](../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)
   the TypeScript contracts package is where API and domain-facing contracts are
   authored in Zod, and [`../schemas/`](../schemas/) becomes generated output.
   A second hand-maintained description of the same contract is a defect, not a
   convenience.
2. **No provider or framework name in a structural position.**
   ([ADR-0003](../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md))
3. **A package never holds a credential** and never reaches a device.
4. **Dependency-free by default.** Adding a dependency is a reviewed decision.
5. **No package may become a bypass.** A shared helper that lets a caller skip
   authorization or safety policy is a defect, however convenient.

## Governed by

[`../AGENTS.md`](../AGENTS.md) → [`../docs/decisions/INDEX.md`](../docs/decisions/INDEX.md).

## Validation

```sh
uv sync --all-packages && uv run ruff check . && uv run mypy && uv run pytest
pnpm install --frozen-lockfile
pnpm run deps:check && pnpm run format:check
pnpm run check:workspace && pnpm run check:imports
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Future: a cross-language check that the Python and TypeScript contract packages
agree with [`../schemas/`](../schemas/).
