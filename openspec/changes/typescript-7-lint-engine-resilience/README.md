# typescript-7-lint-engine-resilience

Planning-only governed v2 change for policy-owned lint-engine replacement and
the TypeScript 7.0.2 compiler cutover.

The implementation is split into two independently reviewed scopes:

1. `replacement-authority-parity` — establish the policy authority, dual-engine
   parity, bounded TS6 API seam, and native platform proof while TypeScript 6 and
   ESLint remain;
2. `typescript7-cutover` — make TypeScript 7.0.2 authoritative and retire ESLint
   only after the first scope is accepted.

`tasks.md` records both scopes and explicitly records implementation as
`NOT_AUTHORIZED`. `preimplementation-review.md` remains `REVIEW_REQUIRED`.
Neither this directory nor Proposed ADR-0022 creates implementation authority.

Governed by [`../../AGENTS.md`](../../AGENTS.md), the change-local
`.openspec.yaml`, and
[`../../schemas/governed-spec-driven-v2/schema.yaml`](../../schemas/governed-spec-driven-v2/schema.yaml).
