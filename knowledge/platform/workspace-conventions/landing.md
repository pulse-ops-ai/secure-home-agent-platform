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

# How a change lands

## Branching

**Work on a branch. Never commit directly to the main branch.** Check which
branch you are on before your first commit — discovering it afterwards is a
recoverable mistake, but only if you notice.

Branch names carry a type and a short summary, so the name says what the branch
is for without opening it.

## Commits

Commits follow a conventional prefixed form, scoped to what they touch. Prefer
**one coherent commit**, or a small logical sequence where each step stands on
its own. A commit per file is not a sequence; it is a diff cut into arbitrary
pieces.

## Opening a change for review

**Open as a draft until validation passes.** A draft says the work is not
claiming to be ready, which is the honest state while checks are still running.

Report **actual validation output**, and report **every skipped check with its
reason**. A skipped check that goes unmentioned reads as a passing one — the
reader cannot distinguish silence from success, so silence is the more damaging
of the two.

## Supply chain

Third-party automation used by the repository's own gates is **pinned to a full
commit identifier**, not to a moving tag. A tag can be repointed by whoever owns
it; the gate that enforces the repository's rules must not be re-aimable by
someone outside it.

## What this module will not tell you

No commands, no check counts, no tool versions, and no output. Those live in the
repository's own contribution guidance, which is authoritative for them.
