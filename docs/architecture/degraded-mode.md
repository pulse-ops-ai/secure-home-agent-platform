# Degraded Mode

What the house does when parts of the platform are unavailable.

Governed by
[ADR-0009](../decisions/ADR-0009-define-degraded-mode-and-offline-authorization.md).
This document holds the **operation classification**, which is part of that
decision.

> **Status: not implemented.** No mechanism exists. In particular, **no bounded
> local authority mechanism has been chosen**, so every `BOUNDED` operation
> below currently behaves as `FAIL CLOSED`.

## Response classes

| Class | Meaning |
|---|---|
| **CONTINUE** | Proceeds on local deterministic evaluation alone. Used where the operation is safe by construction, or where *not* acting is more dangerous than acting. |
| **BOUNDED** | *Target* posture only. May proceed on a bounded, previously-established local authority with an explicit expiry, scope, and audit obligation. **Requires a mechanism that does not exist. Behaves as FAIL CLOSED today.** |
| **FAIL CLOSED** | Does not proceed without a live authorization decision. Refused, explained, audited. |

**Unclassified capabilities fail closed.** A new capability with no entry in this
table is refused during degradation. Silence is not permission.

## Outage modes

These are different failures with different answers. A single "offline" flag
cannot express them.

| Mode | Still reachable | Lost |
|---|---|---|
| **WAN down** | Pi, LAN, Home Assistant, devices | shared edge, VPS, cloud, identity provider |
| **Shared edge down** | everything local, tailnet, VPS | remote ingress (Path A) |
| **Authorization decision point unreachable** | everything else | live authorization decisions |
| **Identity provider unreachable** | everything else; existing tokens valid until expiry | new token issuance and refresh |
| **VPS down** | Pi, local operation | durable writes, history, audit persistence |

## Operation classification

The **direction** of an action matters as much as the resource. Closing and
locking are safe by construction; opening and unlocking are not.

| Operation | Class | Rationale |
|---|---|---|
| **Read temperature** | **CONTINUE** | Local, non-sensitive, no physical effect. Refusing it makes the house feel broken for no security gain. |
| **Turn off a light** | **CONTINUE** | Local, reversible, low consequence, safe direction. |
| **Turn on a light** | **CONTINUE** | Same. Listed to make the symmetry explicit — lights are not direction-sensitive. |
| **Bounded thermostat automation** | **CONTINUE**, within the declared envelope | Deterministic local safety policy evaluates offline. Stays within the pre-declared range; cannot be widened while degraded. Comfort and equipment protection argue for continuing. |
| **Close the garage** | **CONTINUE** | Safe direction. Leaving a garage open during an outage is the worse outcome. Obstruction detection remains a device-level responsibility. |
| **Open the garage** | **FAIL CLOSED** | Physical access to the house. An attacker must not gain entry by causing an outage. |
| **Unlock a door** | **FAIL CLOSED** | Physical access. The single most important fail-closed case. |
| **Lock a door** | **CONTINUE** | Safe direction, no access granted. |
| **Disable the alarm** | **FAIL CLOSED** | Disabling a security control on an unverified authorization is exactly the attack. |
| **Arm the alarm** | **CONTINUE** | Safe direction. |
| **Smoke / CO automation** | **CONTINUE — always** | Life safety. R0 deterministic local, **not** authorization-gated and **not** agent-mediated. Not acting is the hazard. Must run with the WAN, the VPS, the authorization plane, and the agent runtime all down. |
| **Leak shutoff** | **CONTINUE — always** | Property protection. Same posture as smoke/CO: deterministic, local, ungated. Delay causes damage. |
| **Security notification** | **CONTINUE locally; degrade remotely** | Local annunciation (siren, in-home alert) always continues. Remote push requires the WAN; on failure it is queued and the failure is surfaced, never silently dropped. |
| **Grant, modify, or extend access** | **FAIL CLOSED** | Changing who may do what requires a live decision, by definition. |
| **Agent-initiated sensitive action** | **FAIL CLOSED** | An agent with no live delegation check has no established authority. See [ADR-0004](../decisions/ADR-0004-treat-agents-as-clients.md). |
| **Camera live view or recordings** | **FAIL CLOSED** | Privacy-sensitive read. Not all reads are safe; this one is not. |
| **Presence / occupancy read** | **FAIL CLOSED** | Privacy-sensitive, and useful to an attacker. |
| **Access-history read** | **FAIL CLOSED** | Privacy-sensitive. |

### The pattern

- **Safe direction continues, dangerous direction fails closed.** Close, lock,
  arm, turn off, stay within a pre-declared envelope.
- **Life safety always continues.** It is deterministic, local, and ungated by
  design, because the failure of *not acting* is worse than any authorization
  concern.
- **Sensitive reads fail closed.** "Reads are safe" is false for cameras,
  presence, and access history.
- **Anything that changes authority fails closed.** Always.

## Availability by outage mode

| | WAN down | Shared edge down | Authz unreachable | IdP unreachable | VPS down |
|---|---|---|---|---|---|
| Local reads (non-sensitive) | ✓ | ✓ | ✓ | ✓ (token valid) | ✓ |
| Safe-direction actuation | ✓ | ✓ | ✓ | ✓ (token valid) | ✓ |
| Bounded thermostat automation | ✓ | ✓ | ✓ | ✓ | ✓ |
| Life-safety automations | ✓ | ✓ | ✓ | ✓ | ✓ |
| Sensitive actions | ✗ closed | ✓ | ✗ closed | ✗ on expiry | ✓ if audit buffers |
| Remote access (Path A) | ✗ | ✗ | — | ✗ new logins | ✓ |
| Durable history / audit persistence | ✗ buffered | ✓ | ✓ | ✓ | ✗ buffered |
| New token issuance | ✗ | ✓ | ✓ | ✗ | ✓ |

**Identity-provider outage is a slow failure.** Existing tokens stay valid until
expiry, so the household keeps working for one token lifetime and then
degrades. This makes token TTL a direct availability parameter, not just a
security one.

## Degradation must be visible

- Every degraded refusal states **which dependency was unavailable** — not a
  generic error.
- Degraded state is surfaced in the UI and in audit.
- **Silent degradation is prohibited.** A household member must never have to
  guess whether the system is enforcing.
- Pushing the system into a weaker mode should be *loud*, because doing so
  quietly is an attack technique.

## Audit during degradation

- Audit for sensitive actions is buffered locally and flushed on recovery.
- **If audit cannot be buffered, the sensitive action does not proceed.** An
  unrecorded sensitive action is not acceptable.
- Non-sensitive telemetry may be dropped rather than blocking a physical action.

## Recovery

On restoration:

1. buffered audit is flushed;
2. any bounded authority used during the outage is reported;
3. standing automations do **not** replay missed triggers unless the automation
   explicitly declares that it should — replaying a garage command hours late is
   its own hazard;
4. degraded-state indicators clear only after the dependency is confirmed
   healthy, not merely reachable.

## Bounded local authority — three candidates, none chosen

| Candidate | How it works | Main problem |
|---|---|---|
| **Local OpenFGA replica** | read replica of the household store on the Pi | replication lag *is* revocation lag; operational cost of a second store on a Pi |
| **Signed grants / capability leases** | short-lived signed capabilities issued while online, verifiable offline | key management on the Pi; a lease outlives revocation by its lifetime |
| **Bounded decision cache** | recent decisions cached with a strict, sensitivity-dependent TTL | caches the *past*; the more useful the TTL, the longer the revocation window |

Every candidate has the same shape of problem: **local authority means stale
authority, and staleness is a revocation window.** For a door lock, that window
is the security parameter that matters most.

**No candidate is selected.** Choosing one without operating evidence would be
the most consequential unforced error available in this repository. See
[`unresolved-decisions.md`](unresolved-decisions.md).

## Validation obligations

1. Scenario tests per outage mode asserting the classified outcome for every row
   above — [`tests/policy-scenarios/`](../../tests/policy-scenarios/).
2. A real drill on the Pi that severs connectivity and verifies the
   classification holds — [`../operations/INDEX.md`](../operations/INDEX.md).
3. A check that an unclassified capability fails closed.
4. A check that every degraded refusal names the unavailable dependency.
