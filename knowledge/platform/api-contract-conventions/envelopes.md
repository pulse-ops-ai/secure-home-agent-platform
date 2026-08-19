---
type: model
owner: human:mikegtech
as_of: 2026-08-19
limitations: Portable projection only. Names no endpoint path, hostname, or environment URL, and reproduces no generated document. Grants nothing.
status: draft
stale_after: 2027-08-19
governs:
  - docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md
  - docs/architecture/api-contract-model.md
generated:
  by: claude-code/2.1.235
  at: 2026-08-19T00:05:05Z
---

# The four response shapes

Every response is one of four families, and there is no fifth:

| Envelope | For |
|---|---|
| resource | one thing |
| collection | a list |
| accepted | long-running or asynchronous work |
| problem details | every error |

A new shape invented for one endpoint is not a local convenience. It is a
consumer-visible divergence that every generated client and every agent reading
the surface has to special-case forever.

## What a list answer must admit

Collections are **cursor-paginated by default**. Cursors are opaque and bound to
the filters, sort, projection, and include context that produced them — a cursor
from one query must not be usable against another.

**There is no exact count by default.** Counting is requested explicitly, and the
answer always says which kind it is: exact, estimated, or none. This is a
household-availability rule wearing a data-modelling costume — an unbounded count
is a foreseeable way to make an ordinary read look like an outage.

A collection also **echoes the query it actually applied**, including whether a
default sort was used. A caller should never have to infer what the server did.

## Partial answers say so

Warnings are typed and machine-readable, so a stale or partial result is
distinguishable from a complete one. That is not a nicety: silent degradation is
prohibited, and an answer that omits its own incompleteness is exactly that.

Errors follow a standard problem-details form with a stable type, a
machine-readable code, and field-level detail. A raw framework error reaching a
caller is a defect — it leaks implementation shape and gives an agent nothing it
can branch on.

## Conventions that travel with every response

Concurrency is optimistic: a conditional update that loses is a conflict, never a
silent overwrite. Mutations declare their idempotency posture, and an operation
requiring an idempotency key must not act twice. Long-running work returns the
accepted envelope with something to poll or subscribe to, rather than blocking a
request on a physical device.

Every envelope carries version fields, so a client can detect a contract it does
not understand instead of misreading one it does not.
