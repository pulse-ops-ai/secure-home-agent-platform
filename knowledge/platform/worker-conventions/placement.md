---
type: model
owner: human:mikegtech
as_of: 2026-08-19
limitations: Portable projection only. Names no broker address, queue endpoint, or connection detail, and carries no live worker state. Grants nothing.
status: draft
stale_after: 2027-08-19
governs:
  - docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md
  - services/README.md
  - services/AGENTS.md
generated:
  by: claude-code/2.1.235
  at: 2026-08-19T00:05:05Z
---

# Where a worker lives

A worker is a **deployable process**. It has its own lifecycle, its own process,
and its own deployment identity, and no person uses it directly. That is what
puts it among the deployable backend processes rather than among libraries.

The shared runtime it is built on is the opposite: it is imported, has no runtime
identity of its own, and therefore belongs among the reusable libraries. One is
deployed; the other is depended on. Confusing the two is the most common
placement mistake, and it is decided by the deployability test rather than by
what the code appears to be about.

Language is not the criterion either. A worker in a different language is still a
deployable process and still sits with the others.

## Off the request path

Workers do specialist work **off** the household request path. They are not
another hop inside it.

This matters because of where the platform runs. The household control path lives
on a small machine, and a worker that consumes the host without bound is a
foreseeable way to make the household stop responding — not through a bug in the
control path, but by starving it. That is why the shared runtime imposes
concurrency limits rather than offering them, and why a worker does not get to
raise its own ceiling because its work is important.

The same reasoning explains why an untrusted execution substrate is deployed as
its own process rather than inside the household surface: isolation is what stops
one workload's appetite from becoming another's outage.

## What a worker's own module states

A worker declares what it owns, what it does **not** own, and how it fails. The
second and third are the ones that get skipped, and they are the ones a reader
needs during an incident.

Adding a worker requires an authorizing task contract. The conventions here
describe the shape such work must satisfy; they do not authorize the work, and no
accepted decision authorizes it either.
