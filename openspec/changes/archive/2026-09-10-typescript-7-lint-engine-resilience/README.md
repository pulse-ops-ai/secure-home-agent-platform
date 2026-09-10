# typescript-7-lint-engine-resilience

Planning-only governed v2 change for policy-owned lint-engine replacement and
the TypeScript 7.0.2 compiler cutover.

> **Remedial correction (2026-09-01).** The original PR-A vehicle (PR #114)
> merged before its controlling review `pull/114#pullrequestreview-5074082616`
> was addressed. This is a planning-only remedial PR-A correction that lands that
> review's P1/P2 findings from current `main`. It is not PR-A2 and accepts
> nothing.

The merge-order program is four vehicles — PR-A (planning) → PR-A2 (acceptance-
only ADR transition) → PR-B (Scope 1) → PR-C (Scope 2). The implementation is
split into two independently reviewed scopes:

1. `replacement-authority-parity` — establish the policy authority, dual-engine
   parity, separate engine mappings, predecessor-bound maintenance proof,
   the three-domain maintenance boundary (trusted control / isolated untrusted
   subject / trusted verdict) with the subject-isolation contract, bounded TS6
   API seam, and native platform proof while TypeScript 6 and ESLint remain. This scope
   creates the maintenance authority as a full-proof genesis; its candidate
   workflow/checker does not self-authorize through that future maintenance path;
2. `typescript7-cutover` — make TypeScript 7.0.2 authoritative and retire ESLint
   only after the first scope is accepted.

`tasks.md` records both scopes and explicitly records implementation as
`NOT_AUTHORIZED`. `preimplementation-review.md` records the first independent
review's `FOCUSED_CLOSURE_REQUIRED` verdict over commit `aaa0aaf...`; a second
controlling review (`5074082616`, head `700d798...`) raised the three-trust-domain,
PR-A2, and merge-freshness findings addressed here. The review file remains
intentionally historical/current-gate-negative; a fresh independent epoch-1
review of the final corrected head is still required. Neither this directory nor
Proposed ADR-0022 creates implementation authority; ADR acceptance occurs only in
PR-A2.

Governed by [`../../AGENTS.md`](../../AGENTS.md), the change-local
`.openspec.yaml`, and
[`../../schemas/governed-spec-driven-v2/schema.yaml`](../../schemas/governed-spec-driven-v2/schema.yaml).
