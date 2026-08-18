# knowledge/platform/repository-taxonomy/

**Module `platform/repository-taxonomy`** — what lives where, and what does not.

| Field | Value |
|---|---|
| Status | `Validated` |
| Owner | human:mikegtech |

> **Specification.** This README is not bundle source; the authored candidate
> beside it is. Not runtime-authoritative: nothing here is packaged, published,
> or resolvable by a running profile.

## Intended facts

- Every governed root and what each is for, as a **test** rather than a list:
  `services/` deployable backend processes,
  `apps/` human-facing applications, `packages/` reusable libraries with no
  runtime identity, `agents/` agent implementations and profiles.
- That a directory `README.md` is authoritative for its directory, including
  what does **not** belong in it.
- That `schemas/` is generated output, not an authored source.
- That the nearest `AGENTS.md` above a file governs that file.

## Prohibited facts

- File inventories or directory listings. They go stale in a week and an agent
  can read the tree.
- Anything about repository contents that a `README.md` already states — this
  module says where to look, not what is there.

## Intended consumers

Coding runners. A household runner has no reason to know the repository layout.

## Expected queries

- "Where does a new deployable service go?"
- "Is this a package or a service?"
- "Which `AGENTS.md` governs the file I am editing?"

## Governing sources

[ADR-0012 §5](../../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md) ·
[`../../../AGENTS.md`](../../../AGENTS.md) · the directory READMEs themselves

## Freshness and update trigger

Update when a taxonomy root is added, removed, or redefined. A new package
inside an existing root is not a trigger.
