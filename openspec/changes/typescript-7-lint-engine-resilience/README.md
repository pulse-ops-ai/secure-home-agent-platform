# typescript-7-lint-engine-resilience

Planning-only governed v2 change for policy-owned lint-engine replacement and
the TypeScript 7.0.2 compiler cutover.

The implementation is split into two independently reviewed scopes:

1. `replacement-authority-parity` — establish the policy authority, dual-engine
   parity, separate engine mappings, predecessor-bound maintenance proof,
   bounded TS6 API seam, and native platform proof while TypeScript 6 and ESLint
   remain. This scope creates the maintenance authority as a full-proof genesis;
   it does not self-authorize through that future maintenance path;
2. `typescript7-cutover` — make TypeScript 7.0.2 authoritative and retire ESLint
   only after the first scope is accepted.

`tasks.md` records both scopes and explicitly records implementation as
`NOT_AUTHORIZED`. `preimplementation-review.md` records the first independent
review's `FOCUSED_CLOSURE_REQUIRED` verdict over commit `aaa0aaf...`; the
planning bytes now require a fresh independent epoch-1 review after that bounded
correction. Neither this directory nor Proposed ADR-0022 creates implementation
authority.

Governed by [`../../AGENTS.md`](../../AGENTS.md), the change-local
`.openspec.yaml`, and
[`../../schemas/governed-spec-driven-v2/schema.yaml`](../../schemas/governed-spec-driven-v2/schema.yaml).
