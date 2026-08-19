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
  `services/` deployable backend processes, `apps/` human-facing applications,
  `packages/` reusable libraries with no runtime identity, `agents/` agent
  implementations and runtime adapters, `profiles/` execution authority
  declarations, `knowledge/` portable context, `schemas/` published contract
  artifacts, `deploy/` deployment material, `docs/` architecture, operations,
  and governance material.
- That a directory `README.md` is authoritative for its directory, including
  what does **not** belong in it.
- That `schemas/` holds generated output, not authored sources.
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
[ADR-0006](../../../docs/decisions/ADR-0006-separate-agent-implementation-profile-run-and-automation.md) ·
[`../../../AGENTS.md`](../../../AGENTS.md) ·
[`agents/README.md`](../../../agents/README.md) ·
[`profiles/README.md`](../../../profiles/README.md) ·
[`knowledge/README.md`](../../../knowledge/README.md) ·
[`deploy/README.md`](../../../deploy/README.md) ·
[`docs/README.md`](../../../docs/README.md)

## Freshness and update trigger

Update when a taxonomy root is added, removed, or redefined. A new package
inside an existing root is not a trigger.
