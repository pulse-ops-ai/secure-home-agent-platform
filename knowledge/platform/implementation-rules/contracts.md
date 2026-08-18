---
type: model
owner: human:mikegtech
as_of: 2026-08-18
limitations: Portable projection only. States that rules are enforced; never carries the enforced rule data itself. Grants nothing.
status: draft
stale_after: 2027-08-18
governs:
  - docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md
  - packages/README.md
  - services/AGENTS.md
generated:
  by: claude-code/2.1.234
  at: 2026-08-18T16:20:50Z
---

# Authored contracts and generated artifacts

## One authored definition, many derivations

A contract is **authored once**, in one place, and everything else is derived
from it: runtime validation, static types, published schema documents, and any
client or tool surface.

The derived artifacts are **generated, not handwritten**. Editing a generated
artifact produces two answers to the same question, and the generator will
overwrite yours — silently, at the least convenient time.

## Do not create a second contract authority

The failure mode is rarely deliberate. It looks like: a component needs a shape,
the authored contract is somewhere else, and defining a local one is quicker. Now
two definitions exist, they agree today, and nothing keeps them agreeing.

If you need a shape that the authored contract does not express, extend the
authored contract. If it *cannot* express it, that is a decision to raise, not a
local definition to write.

## Handwritten validation duplicates are prohibited

Where a contract is authored, do not hand-write parallel validation, parallel
type declarations, or parallel schema documents. They are duplicates by
construction and they drift by default.

## Generated output is deterministic

Generation is expected to be reproducible: the same authored source produces the
same artifact. A generator whose output varies run to run cannot be verified,
so nondeterminism is a defect rather than an inconvenience.

## What this module will not tell you

It does not name the contract library, describe any specific schema, or carry a
generated document. It describes the authoring model, which outlives all three.
