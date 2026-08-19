# knowledge/platform/core-operating-model/

**Module `platform/core-operating-model`** — how this platform behaves, in the
terms an agent must reason in.

| Field | Value |
|---|---|
| Status | `Validated` |
| Owner | human:mikegtech |

> **Specification.** This README is not bundle source; the authored candidate
> beside it is. Not runtime-authoritative: nothing here is packaged, published,
> or resolvable by a running profile. Registered in [`../../INDEX.md`](../../INDEX.md).

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
[`system-context.md`](../../../docs/architecture/system-context.md) ·
[`services/README.md`](../../../services/README.md) ·
[`services/AGENTS.md`](../../../services/AGENTS.md)

## Freshness and update trigger

Update when an ADR changes the operating model — a new control, a changed
outcome vocabulary, a changed agent posture — or when the services
physical-action contract changes. Not on routine implementation work.
