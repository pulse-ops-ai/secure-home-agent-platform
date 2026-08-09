# packages/contracts

The authored Zod contract source.

> **Status: runner slice implemented.** This package is the **shared authored
> contract source**; domain-specific issues own specific slices — the runner
> domain contracts via **L2/#51** (under the `runner-baseline-adoption`
> constitution, implemented by the `runner-domain-contracts` change), the
> household/read-only contract slice via **#28**. No slice owns the package
> globally.

## Layout

One directory per bounded contract family. Consumers import only the package
index; the internal organization is not API.

```text
src/
├── primitives/        # shared runner primitives (Digest, CapabilityGrant, …)
├── execution-profile/ # the platform's authority shape
├── launch-assertion/  # the composed launch as data
├── path-policy/       # declarative write-boundary policy
├── verification/      # gate registry, gate outcomes, verification packs
├── schema/            # artifact catalog (pure) + renderer and ledger guard (build-only)
├── conformance/       # corpus-wide proof suites (neutrality, strictness, identity, …)
└── tools/             # schema writer, run by `pnpm run generate`
```

`schema/index.ts` re-exports only the pure artifact catalog. The renderer
(`generation.ts`, needs Prettier) and the identity-ledger guard
(`ledger-history.ts`) are build/CI tooling and are never exported from the
package index — the package's only runtime dependency is Zod.

## What belongs here

- **Zod definitions** for request and response DTOs, path/query/header parameters,
  and domain types — the single authored source
  ([ADR-0012 §7](../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)).
- `z.infer` types, `.meta()` semantics, and the examples that flow into OpenAPI,
  the generated SDK, MCP tools, and the metadata routes.

## What does not belong here

- **Database tables.** Zod is authoritative for API and domain-facing contracts,
  **never** for persistence. A table must not become a DTO automatically.
- **Business logic.** Contracts describe shapes.
- **Generated JSON Schema** — that is [`../../schemas/`](../../schemas/), a
  generated artifact.
- **Any import from a service or an app.** This package imports nothing from the
  platform; it is the innermost layer.

## Governed by

[`../../AGENTS.md`](../../AGENTS.md) · ADRs [0006](../../docs/decisions/ADR-0006-separate-agent-implementation-profile-run-and-automation.md), [0012](../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)

## Validation

```sh
pnpm --filter @secure-home/contracts run lint
pnpm --filter @secure-home/contracts run typecheck
pnpm --filter @secure-home/contracts run build
```
