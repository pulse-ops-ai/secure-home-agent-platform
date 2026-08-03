# services/automation-service

**Persisted automations** — standing arrangements that cause agent runs to
happen.

> **Status: not implemented.** A workspace member with a manifest and a
> placeholder package. No persistence, no scheduler, no dependencies.

## Why this is the most dangerous object in the system

An automation acts repeatedly, without a human present, at times chosen by a
trigger. It is the thing most likely to still be running long after anyone
remembers approving it. Every rule below exists because of that.

## Required properties of an automation

Per [ADR-0006](../../docs/decisions/ADR-0006-separate-agent-implementation-profile-run-and-automation.md):

| Property | Rule |
|---|---|
| trigger | what causes it to fire |
| conditions | what must hold |
| policy scope | the safety envelope it operates under |
| resource scope | what it may touch |
| **expiration** | **required** — an automation without one is not permitted |
| **profile version binding** | a **specific** version, never a moving reference |
| owner | who is accountable |
| state | enabled or disabled |

Additionally:

- **Separately authorized.** Approving a profile for interactive use does not
  approve it for unattended use. Unattended action is a higher risk class.
- **Autonomous runs have no `actor`, explicitly.** The absence is a declared
  value, never a missing field.

## What belongs here

- Automation persistence and lifecycle.
- Trigger evaluation and scheduling.
- Expiration enforcement — including during an outage.
- Automation-level authorization checks.
- Emission of run requests to
  [`../runner-control/`](../runner-control/).

## What does not belong here

- **Local safety automations.** Smoke/CO response, leak shutoff, and freeze
  protection are deterministic local behaviour with **no dependency on this
  service**. If life safety depended on the automation service, an outage here
  would be a hazard. See
  [`../../docs/architecture/degraded-mode.md`](../../docs/architecture/degraded-mode.md).
- **Agent implementations** or **profiles**.
- **Device access** of any kind.
- **The runner substrate** — that is [`../runner-control/`](../runner-control/).

## Boundary rules

- An automation may never exceed the authority of its bound profile version, and
  a profile update must not silently change what it may do.
- Expiration is enforced even when degraded — an expired automation must not
  fire.
- Missed triggers are **not** replayed on recovery unless the automation
  explicitly declares that they should.
- Firing an automation does not bypass authorization or safety policy; the
  resulting run traverses the same path as any other client.

## Open

Persistence and scheduler implementation —
[U5](../../docs/architecture/unresolved-decisions.md#u5). The tension: the VPS is
authoritative, but a VPS outage must not stop local automations, and a local copy
risks double-firing on recovery.

## Governed by

[`../AGENTS.md`](../AGENTS.md) · ADRs
[0004](../../docs/decisions/ADR-0004-treat-agents-as-clients.md),
[0006](../../docs/decisions/ADR-0006-separate-agent-implementation-profile-run-and-automation.md),
[0009](../../docs/decisions/ADR-0009-define-degraded-mode-and-offline-authorization.md)

## Validation

`uv run ruff check .`, `uv run mypy`, `uv run pytest`. Future: expiration
enforcement tests, no-replay-on-recovery tests, and a test that a profile update
does not widen an existing automation.
