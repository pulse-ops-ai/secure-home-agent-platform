# schemas/early-termination-record/

Generated JSON Schema for the **early-termination record** — what a run leaves
behind when it terminates before its production authority acquisition
completes: a request naming no profile, a profile that fails to resolve, or an
acquisition fault.

> **Generated output.** The authored source is
> [`packages/events/src/early-termination-record.ts`](../../packages/events/src/early-termination-record.ts)
> ([ADR-0012 §7](../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)).
> Edit the Zod source and regenerate; a hand edit here fails the drift check.

## Why this exists separately from the evidence bundle

`evidence-bundle` requires the digest-bound identities of the profile, path
policy, and gate registry that governed a run. A run that terminated before
acquiring them has no such identities — and **fabricating them is prohibited**.
This contract is the governed alternative: it records the run identity, who
asked, what was requested as data, how it ended, and when.

Two properties are structural rather than conventional:

- **No authority surface.** No field exists for an authority identity,
  capability grant, gate result, change set, or artifact, so a
  fabricated-authority record is unrepresentable.
- **No success.** The outcome is the platform's terminal vocabulary with the one
  success state absent, composed from the same option instances `run-record`
  uses. A run that obtained no authority cannot claim it succeeded.

Exactly one of `run-record` (with its evidence bundle) or
`early-termination-record` exists per run, distinguished by contract identity.

## Governed by

Change `runner-early-terminal-record` (authority: issue #51) · canonical
[`runner-evidence`](../../openspec/specs/runner-evidence/spec.md) ·
[`identity-ledger.json`](../identity-ledger.json), which pins these exact bytes
