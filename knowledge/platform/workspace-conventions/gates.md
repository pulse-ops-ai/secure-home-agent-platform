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
  at: 2026-08-18T18:53:35Z
---

# What runs, and why some gates never skip

The execution model has two halves, and the split is deliberate:

```text
always-on governance gates      run for EVERY change
        +
path-aware target gates         run for what the change actually affects
```

## Governance gates are unconditional on purpose

The gates that check the repository's own rules carry **no condition**. That is
load-bearing rather than tidy: a bug in the logic that selects which targets to
run could otherwise skip the very checks that would catch it.

The selector is itself governance, so it is validated unconditionally too. A gate
that can be skipped by the thing it is meant to constrain is not a gate.

## Targets are selected by dependency graph, not by directory

What runs for a change is derived from the **dependency graph**, not from which
folders were touched. A change to a shared library runs everything that depends
on it, even though those directories were not edited.

A consequence worth expecting: **root configuration changes fan out broadly.**
That is correct, not a misfire — a change to shared configuration can affect
every target that inherits it.

## A skipped target still reports

A target that was not selected still reports a conclusion. That is what stops a
required check from being satisfied by never having run — silence and success
must not look the same.

## What follows for you

- Do not expect a change to run only "its" tests; expect its dependents.
- Do not treat a broad fan-out as a bug.
- If a check did not run, say so and why. An unreported skip is worse than a
  failure, because a failure is visible.

## What this module will not tell you

It names no command, no job, and no tool version. Read the repository's own
contribution guidance for how to invoke things; this module explains why the
model is shaped the way it is.
