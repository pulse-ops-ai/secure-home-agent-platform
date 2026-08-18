---
type: model
owner: human:mikegtech
as_of: 2026-08-18
limitations: Portable projection only. Names no pinned version; the catalog and lockfile are authoritative for those. Grants nothing.
status: draft
stale_after: 2027-08-18
governs:
  - docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md
  - CONTRIBUTING.md
  - scripts/README.md
generated:
  by: claude-code/2.1.234
  at: 2026-08-18T16:20:50Z
---

# Dependency governance

Several mechanisms operate here and they do **different jobs**. Treating them as
interchangeable is the usual source of error.

| Mechanism | Its job | What it does NOT do |
|---|---|---|
| workspace catalog | one declared version per external dependency, across the whole workspace | say which package may import which |
| internal workspace edges | resolve an internal package to the copy in this repository | make that import architecturally legal |
| manifest policy checking | keep declared versions consistent with the catalog | enforce import direction |
| lockfile | the exact resolved graph that was installed | express intent |
| import-direction checking | what source actually imports | govern declared versions |

The pair worth internalizing: **a manifest says what is declared; source says
what is imported.** A dependency can be perfectly declared and still be an
illegal import, so one mechanism cannot stand in for the other.

## The lockfile is a fact, not a preference

The lockfile records the exact graph that was resolved. Installs in a governed
run are **frozen**: a stale or drifted lockfile is a failure, not something to
repair silently in passing.

**A governed pipeline never mutates a manifest or the lockfile.** A run that
"fixes" drift and then reports success has reported on a repository state that
does not exist. If the lockfile is wrong, that is a change to propose in its own
right.

## Versions live in the catalog, not in your head

Do not carry a pinned version in portable context, and do not add a dependency
because you remember it being present. Adding one is a change that a task
contract has to authorize, and the version comes from the catalog.

## What this module will not tell you

It carries no pinned version, no lockfile content, and no shell recipe. Those
belong to the workspace itself, which is authoritative for them.
