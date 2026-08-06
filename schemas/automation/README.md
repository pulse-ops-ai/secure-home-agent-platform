# schemas/automation/

The canonical schema for an **automation** — a persisted standing arrangement
that causes runs to happen.

> **Status: not defined.**

## What an automation must carry

Per [ADR-0006](../../docs/decisions/ADR-0006-separate-agent-implementation-profile-run-and-automation.md):

| Field | Rule |
|---|---|
| identity | automation id, version |
| trigger | what causes it to fire |
| conditions | what must hold |
| policy scope | the safety envelope it operates under |
| resource scope | what it may touch |
| **expiration** | **required** — an automation without one is invalid |
| **profile binding** | a **specific profile version**, never a moving reference |
| owner | who is accountable |
| state | enabled or disabled |
| replay policy | whether missed triggers are replayed — **default no** |

## Constraints

1. **Expiration is required.** The schema must make an automation without one
   invalid. A forgotten automation that still actuates devices is the failure
   this prevents, and a mechanism beats an intention.
2. **Profile binding is version-exact.** A profile update must not silently
   change what a standing automation may do.
3. **Separately authorized.** Approving a profile for interactive use does not
   approve it for unattended use; the schema must carry the automation's own
   authorization reference.
4. **Replay is opt-in.** Replaying a garage command hours late is its own hazard.
5. **Autonomous by nature** — automation-triggered runs have no `actor`, and that
   is explicit.

## What belongs here

- The schema and its field documentation.
- Fixtures, including an invalid automation with no expiration and one bound to a
  superseded profile version.

## What does not belong here

- **Actual automations** — [`../../services/control-plane/`](../../services/control-plane/).
- **Scheduler implementation** — [U5](../../docs/architecture/unresolved-decisions.md#u5).
- **Local safety automations.** Smoke/CO response, leak shutoff, and freeze
  protection are deterministic local behaviour, not automation objects, and must
  not depend on this system
  ([`../../docs/architecture/degraded-mode.md`](../../docs/architecture/degraded-mode.md)).

## Governed by

[`../README.md`](../README.md) · ADRs
[0004](../../docs/decisions/ADR-0004-treat-agents-as-clients.md),
[0006](../../docs/decisions/ADR-0006-separate-agent-implementation-profile-run-and-automation.md),
[0009](../../docs/decisions/ADR-0009-define-degraded-mode-and-offline-authorization.md)

## Validation

Future: fixture tests asserting that an automation without an expiration is
rejected, that an expired automation does not fire, and that a profile update
does not widen an existing automation's authority.
