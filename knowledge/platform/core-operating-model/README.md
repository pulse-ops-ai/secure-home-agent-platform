# knowledge/platform/core-operating-model/

**Module `platform/core-operating-model`** — how this platform behaves, in the
terms an agent must reason in.

| Field | Value |
|---|---|
| Status | `Planned` |
| Owner | human:mikegtech |
| Blocked by | [U7](../../../docs/architecture/unresolved-decisions.md#u7) |

> Specification only. No module content is authored, and this directory is not
> runtime-authoritative. Registered in [`../../INDEX.md`](../../INDEX.md).

## Intended facts

- An agent is a **client**, not an insider. It re-enters the platform through the
  same governed enforcement point a browser would use; there is no internal path.
- An agent **proposes**; it does not decide. A denial is a normal, expected
  outcome and not an error to work around.
- Three controls are separate and all must pass: sandbox **capability**, platform
  **authorization**, deterministic **safety policy**.
- **Live state wins.** Where knowledge and live state disagree, the agent reports
  the discrepancy and reasons from live state.
- Knowledge is context. It grants nothing.
- A physical action has an observable lifecycle and no atomicity guarantee; an
  `indeterminate` outcome is a real outcome, not a failure to retry blindly.

## Prohibited facts

- The enforced rules themselves — the authorization model, the safety envelope,
  the policy thresholds. Documenting *that* they exist is knowledge; making them
  agent-readable would let a run reason about its own limits as data.
- Endpoints, internal addresses, credentials.
- Live platform state: service health, current runs, queue depth.

## Intended consumers

Every runner class. This is the one module no set should omit.

## Expected queries

- "Am I allowed to decide this, or must I propose it?"
- "What do I do when the authorization decision is `deny`?"
- "Knowledge says the zone has three rooms but the API returns two — which wins?"

## Governing sources

[ADR-0004](../../../docs/decisions/ADR-0004-treat-agents-as-clients.md) ·
[ADR-0005](../../../docs/decisions/ADR-0005-separate-capability-authorization-and-safety.md) ·
[ADR-0010](../../../docs/decisions/ADR-0010-use-okf-for-portable-knowledge-only.md) ·
[`system-context.md`](../../../docs/architecture/system-context.md)

## Freshness and update trigger

Update when an ADR changes the operating model — a new control, a changed
outcome vocabulary, a changed agent posture. Not on routine implementation work.
