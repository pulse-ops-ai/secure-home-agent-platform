---
type: model
owner: human:mikegtech
as_of: 2026-08-19
limitations: Portable projection only. Carries no per-operation policy table, no current outage or service health, and no live policy configuration. Names no bounded-authority mechanism, because none is selected. Grants nothing.
status: draft
stale_after: 2027-08-19
governs:
  - docs/decisions/ADR-0002-adopt-hybrid-home-deployment-profile.md
  - docs/decisions/ADR-0009-define-degraded-mode-and-offline-authorization.md
  - docs/architecture/degraded-mode.md
  - docs/decisions/ADR-0010-use-okf-for-portable-knowledge-only.md
generated:
  by: claude-code/2.1.235
  at: 2026-08-19T04:22:58Z
---

# How degraded behaviour is decided

**Degraded behaviour is classified per (operation, requester) — never by one
global switch.**

There is no "the system is offline, so X is allowed" mode. The same operation
can land in different classes depending on who is asking, and the same requester
gets different answers for different operations. A run that reasons in terms of a
single degraded flag is reasoning about a model this platform does not have.

Four outcomes exist, and they are the whole vocabulary:

| Class | Meaning |
|---|---|
| `CONTINUE` | proceeds without a live decision, because authority was already established and is locally available, or because the operation carries no physical risk **and** refusing it would break the house for no security benefit |
| `BOUNDED` | target posture for proceeding on previously-established local authority — see [bounded.md](bounded.md) before assuming anything |
| `FAIL CLOSED` | does not proceed without a live decision; refused, explained, audited |
| `EMERGENCY` | deterministic life-safety response under an explicitly reviewed policy |

## Two questions, never one

**Physical direction and principal authority are different questions.**

> Is the physical direction safe? ≠ May this principal initiate it now?

Collapsing them is the specific error the classification exists to avoid. A safe
direction earns a *more permissive* class; it never earns an
*authorization-free* one. An authenticated but compromised local caller can use
unlimited "harmless" actions as a denial of service precisely when the ability to
stop it is unavailable.

The distinguishing question between the two permissive classes is whether a
**new** authority is being created or a **prior** one is being executed. Executing
a decision someone already made is a different act from making one now, and a run
asking for something during an outage is always making a new request.

Note both halves of that `CONTINUE` condition. **Absence of physical risk does
not by itself earn `CONTINUE`** — the refusal must also cost something real and
buy no security. A harmless-looking operation whose refusal is merely
inconvenient does not qualify.

Sensitive operations fail closed for every requester, and that includes sensitive
**reads** — which carry no physical risk at all. "Reads are safe" is false when
the read tells someone whether the house is empty.

## `EMERGENCY` is not a fallback

Life-safety behaviour is deterministic, local, and **off the agent path
entirely**. It is triggered by a physical condition, never by a request; there is
no interface that invokes it.

**No ordinary operation may be reclassified into `EMERGENCY` to make it work
during an outage.** If that seems like the solution to a refusal, it is the
clearest possible sign that the refusal was correct.

## What this concept does not carry

The per-operation classification table, which is enforced policy and not agent
material; any current outage or service health, which is live state; and any
policy configuration.
