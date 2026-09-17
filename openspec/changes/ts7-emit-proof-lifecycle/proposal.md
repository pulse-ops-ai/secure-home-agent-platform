# Change Proposal: TS7 emit proof lifecycle

## Why

After the TypeScript 7 cutover, `check:emit-conformance` still compares the
current repository's emitted source against the frozen TypeScript 6 capture.
An ordinary source edit therefore fails a migration proof even when the compiler
has not changed. Independent review of frozen PR #126 reported this separate
proof-lifecycle defect and no AP.1 implementation defect.

## What Changes

Retain artifact authenticity and historical differential replay, while removing
the unconditional comparison of future source revisions with historical output.
The accepted per-surface comparison semantics and predecessor-bound compiler
maintenance contract remain intact.

## Capabilities

### Modified Capabilities

- `typescript-7-cutover`: make the lifetime and subject of cutover evidence explicit.

## Impact

Repository emit-proof tooling, its CI/local invocation, documentation, and hostile
tests. No package source, compiler pin, lockfile, or maintenance authority changes.

## Governance

ADR-0001 governs inherited boundaries; ADR-0012 §§19–20 governs toolchain and CI;
ADR-0022 §§2, 10 governs compiler authority and maintenance; ADR-0014 and
`docs/architecture/knowledge-promotion-model.md` govern the promotion determination.
`REQ-TC-002`, `REQ-SC-006/007`, and the delivered TS7 assurance contract govern
the proof. See [design.md](design.md) for the inspection recorded before implementation.

**Depends on U1–U11: none.** No ADR status change or accepted ADR edit is proposed.

## Non-Goals

PR #126 remains frozen at `7309acb17e8e8d4a855d25c4d24317f621692b82`.
Its source and archive paths, PR #124, PR #101, `governance/state.json`, ADR-0020,
U4, GATE-U4, PR-3, and PR-4 are outside this correction. Frozen TS6 evidence and
its projections/bindings are never regenerated, rewritten, widened, or rebound.
No compiler update, maintenance shortcut, infrastructure operation, or merge.

## Related

- [Design and contract interpretation](design.md)
- [Assurance](assurance.md)
- [Tasks and external authority](tasks.md)
