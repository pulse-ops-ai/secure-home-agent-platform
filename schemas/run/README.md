# schemas/run/

The canonical schema for a **run** — one invocation of one execution profile.

> **Status: not defined.**

## What a run record must carry

Per [ADR-0006](../../docs/decisions/ADR-0006-separate-agent-implementation-profile-run-and-automation.md):

| Field group | Contents |
|---|---|
| identity | run id, start and end timestamps |
| cause | what triggered it: a human, a schedule, or a named automation |
| profile | **profile name and version** — never a moving reference |
| image | the **digest** actually used, for provenance |
| principal | `sub` (the agent), and `actor` (the human) **or an explicit autonomous marker** |
| execution | effective routing class, and any fallback that occurred |
| outcome | result, termination reason, error |
| evidence | reference to the sealed evidence bundle |
| correlation | identifiers joining to requests, authorization decisions, and audit |

## Constraints

1. **Immutable once complete.** A run is a historical fact. Nothing amends it.
2. **Profile version is required**, so "which profile?" is never ambiguous in
   audit.
3. **`actor` absence is explicit** — a declared autonomous marker, never a
   missing field. An autonomous run must never be mistakable for a
   human-authorized one
   ([ADR-0004](../../docs/decisions/ADR-0004-treat-agents-as-clients.md)).
4. **Effective routing class is recorded**, so "did household data leave the
   house?" is answerable from audit
   ([ADR-0007](../../docs/decisions/ADR-0007-route-local-remote-and-cloud-execution-explicitly.md)).
5. **Correlatable** to every household action it caused.
6. **No secrets.** Evidence redaction is part of the contract.

## What belongs here

- The schema and its field documentation.
- Fixtures, including an autonomous run and a cancelled run.

## What does not belong here

- **The event and evidence contract** — [`../../packages/events/`](../../packages/events/).
  This schema references the bundle; it does not define its internals.
- **Storage or retention policy.**
- **Run execution logic** — [`../../services/runner-control/`](../../services/runner-control/).

## Governed by

[`../README.md`](../README.md) · ADRs
[0004](../../docs/decisions/ADR-0004-treat-agents-as-clients.md),
[0006](../../docs/decisions/ADR-0006-separate-agent-implementation-profile-run-and-automation.md),
[0007](../../docs/decisions/ADR-0007-route-local-remote-and-cloud-execution-explicitly.md)

## Validation

Future: fixture tests, plus an audit assertion that every device action joins to
a run, a profile version, and a triggering cause.
