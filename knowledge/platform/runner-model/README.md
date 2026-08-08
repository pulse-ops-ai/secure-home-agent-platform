# knowledge/platform/runner-model/

**Module `platform/runner-model`** — how agent runs are executed, and where
authority actually comes from.

| Field | Value |
|---|---|
| Status | `Planned` |
| Owner | @mikegtech |
| Blocked by | [U7](../../../docs/architecture/unresolved-decisions.md#u7) |

> Specification only. No module content is authored, and this directory is not
> runtime-authoritative. Registered in [`../../INDEX.md`](../../INDEX.md).

## Intended facts

- The five concepts and that they are never conflated: agent **implementation**
  (no authority), runtime **adapter** (no authority), execution **profile**
  (**this is where authority is granted**), **run** (an immutable historical
  fact), **automation** (separately authorized, and it expires).
- **Anything the profile does not grant is denied.** There is no default-open
  field.
- An adapter cannot widen its own sandbox; the resolution for a missing grant is
  a reviewed profile change, never an adapter workaround.
- A run names its profile version, so "which profile?" is never ambiguous in
  audit.
- A coding runner has no path to household devices.
- Every run produces an event stream and an evidence bundle, uniform across
  adapters.

## Prohibited facts

- Image digests, registry locations, or profile contents.
- Which profiles exist, or what any specific profile grants. A run learns its own
  grants from the substrate, not from a portable document.
- Live run state.

## Intended consumers

Both runner classes, plus any agent reasoning about what it may request.

## Expected queries

- "I need a capability I do not have. What is the correct path?"
- "Does merging my implementation change what I am allowed to do?"
- "Why is my knowledge selection recorded in evidence?"

## Governing sources

[ADR-0003](../../../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md) ·
[ADR-0006](../../../docs/decisions/ADR-0006-separate-agent-implementation-profile-run-and-automation.md) ·
[ADR-0011](../../../docs/decisions/ADR-0011-keep-coding-agent-images-provider-specific.md) ·
[`runner-model.md`](../../../docs/architecture/runner-model.md) ·
[`knowledge-selection-model.md`](../../../docs/architecture/knowledge-selection-model.md)

## Freshness and update trigger

Update when the runner concepts, the grant model, or the evidence contract
changes.
