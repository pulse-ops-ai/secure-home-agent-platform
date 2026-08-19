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

# Where a contract is authored

**One definition per contract. Everything else is generated.**

That sentence is the whole model, and its consequence is the part worth
internalising: if a second artifact describes the same contract — a validation
class, a documentation decorator, a hand-written interface, a parallel schema —
**the second artifact is the defect, not the missing piece.** The instinct to add
one is the instinct this convention exists to interrupt.

The authored definition is a schema, and it carries its own semantics as
metadata rather than in a comment. That metadata is not decoration: the same text
becomes the published description, the generated client's documentation, the
runtime metadata answer, and the tool description an agent reads. Writing it
carelessly degrades four surfaces at once.

## What a controller is allowed to be

A request handler contains four things and nothing else: the route, one governed
operation contract, parsed inputs, and a single call into the application layer.

It does not authorize, evaluate policy, build queries, or shape responses. Those
belong where they can be tested without a transport, and where a second entry
path cannot skip them. A handler that grew a decision is not a shortcut — it is a
control that now exists in one path and not the others.

## What must not be hand-written

Restating an authored schema as a class for validation, typing, or reflection is
prohibited. If a class exists only to repeat a schema, it is the defect.

Path parameters are declared in the schema and checked against the route
template. An optional path parameter fails contract validation, because a
published path parameter is always required — a mismatch otherwise discovered
in production rather than at build time.

## The boundary is narrower than the language

Only constructs representable in the published schema format may cross the
boundary. The converter refuses the rest by default, and **that default is
kept**: the alternative emits an empty schema, which validates anything while
appearing to constrain something. A refusal at build time is the cheaper
outcome.

Timestamps cross as strings, not as native date objects. Where a transform makes
input and output differ, request and response are generated separately rather
than approximated by one shape.

## What this does not cover

Persistence. A schema authoritative for the API boundary is **not** authoritative
for database tables, and a table never becomes a transfer object automatically.
That separation is deliberate and is decided elsewhere.
