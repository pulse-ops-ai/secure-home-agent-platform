# `@secure-home/lint-config`

The repository's **lint policy**, stated in terms the repository owns, plus the
per-engine translation tables and the runner that executes both engines.

## Why this package exists

[ADR-0012](../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)
§15 names ESLint beside the architecture rule it was enforcing, because ESLint
was the selected implementation when that sentence was written.
[ADR-0022](../../docs/decisions/ADR-0022-decouple-typescript-policy-enforcement-from-lint-engine.md)
separates the two: **policy belongs to the repository, engines are
replaceable.**

That separation is only real if it is structural. So:

| File                        | Owns                                                              | Must never contain                       |
| --------------------------- | ----------------------------------------------------------------- | ---------------------------------------- |
| `policy.json`               | stable ids, intent, roles, blocking posture, semantic options      | a vendor rule identity                   |
| `engine-mappings.json`      | which engine rule realises which policy id                        | intent, roles, blocking, fixture meaning |
| `../../pnpm-workspace.yaml` | the version of every engine                                        | —                                        |

A policy id survives an engine change. That is the entire point: retiring an
engine must not renumber, rename, or silently drop a rule the repository relies
on.

## What this package does NOT own

- **Formatting.** Prettier is the single formatting authority. No engine
  configured here may emit or fix formatting.
- **Type correctness.** The TypeScript compiler owns it. Lint success is not
  typecheck success and neither substitutes for the other.
- **Package and source architecture.** `scripts/check-workspace.mjs` and
  `scripts/check-source-imports.mjs` keep their own authority. Moving those
  rules into a lint engine would make an architecture gate an engine feature.
- **Versions.** The workspace catalog pins every engine. A pin here would be a
  second version authority.

## Dispositions

Every policy row carries exactly one, from a closed set of three:

```text
MIGRATED_TO_NEW_LINT_ENGINE
REPLACED_BY_TYPESCRIPT_COMPILER
REPLACED_BY_DEDICATED_REPOSITORY_GATE
```

There is no `DROPPED`, and deliberately no "unavailable" value either. If a
fixture proves a policy cannot be enforced equivalently, that is a **blocking
conformance result**: the migration stops and ESLint keeps enforcing the policy.
A row that could record unavailability would make a failed migration look like a
decision somebody took.

Whether the replacement engine realises a policy natively or through options is
an engine implementation detail, so it lives in the mapping and not here.

## Layering

Layer 0, build tooling. Production source may not import it, and
`scripts/check-source-imports.mjs` enforces that mechanically rather than by
convention.

## Governed by

[`../../AGENTS.md`](../../AGENTS.md), then
[`../AGENTS.md`](../AGENTS.md) if present, then ADR-0012 and ADR-0022.
