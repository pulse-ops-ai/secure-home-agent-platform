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
  at: 2026-08-19T03:06:26Z
---

# How an operation becomes callable

There is one governed catalog with **one entry per operation**, and it is the
join point: it is where an operation's route, its input and output schemas, its
required capability, its sensitivity, whether it is read-only or side-effecting,
its confirmation posture, its idempotency behaviour, its audit event names, its
degraded-mode semantics, and its external tool eligibility all meet.

Scattering those facts across the code is how they drift apart. Joining them is
what lets one reviewer see the whole shape of an operation at once.

## Exposure is an act, not a consequence

**MCP tools are generated only from the allowlisted subset of the governed
operation catalog.** Exposing every route automatically is prohibited.

The reasoning is worth keeping: eligibility is a deliberate, reviewable property
of an operation. If exposure were a side effect of an operation merely existing,
then adding an internal route would silently widen the external surface, and the
review that should have caught it never happens — because nobody wrote anything
down to review.

## Describing is not granting

Metadata is authorization-aware, and **metadata describes; it never grants.**
Discovering an operation is not permission to invoke it, and the two questions
are answered by different mechanisms.

What metadata must never expose: credentials, home-automation entity identifiers,
database columns or query structure, relationship records, hidden fields, and
routes that exist only for internal use. A description that leaks structure has
granted something after all — reconnaissance — even though no call succeeded.

## The query surface has a ceiling

Each module owns exactly one projection configuration, and **that configuration
is the module's maximum query surface.** It generates the query validation, the
published query metadata, the runtime metadata answer, the tool guidance, and the
repository-level query validation from a single declaration.

The asymmetry is the load-bearing part: **authorization may narrow it for a
caller; nothing may widen it.** Models and MCP clients produce only a
**validated query AST**, never raw query language or arbitrary field
expressions.
