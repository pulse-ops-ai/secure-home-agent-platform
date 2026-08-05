# Degraded Mode

What the house does when parts of the platform are unavailable.

Governed by
[ADR-0009](../decisions/ADR-0009-define-degraded-mode-and-offline-authorization.md).
This document holds the **operation classification**, which is part of that
decision.

> **Status: not implemented.** No mechanism exists. In particular, **no bounded
> local authority mechanism has been chosen**, so every `BOUNDED` operation
> below currently behaves as `FAIL CLOSED`.

## Two questions, not one

The earlier draft of this document classified by **physical direction** alone —
closing and locking were called "safe by construction" and therefore allowed to
continue without authorization. That conflated two different questions:

```
Is the physical direction safe?     ≠     May this principal initiate it now?
```

They are independent, and the second one does not disappear because the first
answers "yes":

- **Closing a garage can hurt someone.** Obstruction detection is a device
  feature with failure modes, not a guarantee, and a person, animal, or vehicle
  may be in the path.
- **Locking a door can lock a household member out**, or impede an emergency
  responder who is already inside.
- **Arming an alarm with occupants inside** produces a false alarm and,
  potentially, an armed response to a non-event.
- **A compromised but authenticated LAN principal** can use unlimited
  "safe-direction" actions as a denial-of-service — repeatedly locking, arming,
  and closing — precisely when relationship authorization is unavailable to stop
  it.

So a physically-safe direction earns a *more permissive* classification. It does
not earn an *authorization-free* one.

## Response classes

| Class | Meaning |
|---|---|
| **CONTINUE** | Proceeds without a live authorization decision — because authority was **already established and is locally available** (a predeclared automation with an immutable local scope), or because the operation carries no physical risk and refusing it would break the house for no security gain. |
| **BOUNDED** | May proceed on a bounded, previously-established local authority with explicit expiry, scope, and audit obligation. **The mechanism does not exist yet, so BOUNDED behaves as FAIL CLOSED today.** |
| **FAIL CLOSED** | Does not proceed without a live authorization decision. Refused, explained, audited. |
| **EMERGENCY** | A narrow exception: deterministic life-safety automation acting under an explicitly reviewed emergency policy. Ungated by authorization **by design**, because not acting is the hazard. |

### What distinguishes CONTINUE from BOUNDED

**Who is asking, and was authority established before the outage?**

| Requester | Meaning |
|---|---|
| **predeclared local automation** | Authorized when it was created; its trigger, scope, and resource set are immutable, local, and evaluable offline. Nothing new is being authorized during the outage — a prior decision is being executed. → eligible for **CONTINUE** |
| **interactive human** | A new request. Nothing established this principal's authority for this resource right now. → **BOUNDED** |
| **agent** | A new request, and delegation cannot be checked. → **BOUNDED**, and **FAIL CLOSED** for anything sensitive |

This preserves the separation
[ADR-0005](../decisions/ADR-0005-separate-capability-authorization-and-safety.md)
establishes: deterministic safety policy bounds the *action*, and it never
substitutes for deciding *who may act*.

**Unclassified capabilities fail closed.** A new capability with no entry in the
table below is refused during degradation. Silence is not permission.

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

Two axes: the **operation** (including its direction) and **who is requesting
it**. A cell is the response class for that combination.

`—` means the combination does not arise.

| Operation | Predeclared local automation | Interactive human | Agent |
|---|---|---|---|
| **Read temperature** | CONTINUE | **CONTINUE** | **CONTINUE** |
| **Turn a light on or off** | CONTINUE | **CONTINUE** | **CONTINUE** |
| **Bounded thermostat adjustment** | **CONTINUE** within the predeclared envelope | **BOUNDED** | **BOUNDED** |
| **Close the garage** | **CONTINUE** | **BOUNDED** | **BOUNDED** |
| **Lock a door** | **CONTINUE** | **BOUNDED** | **BOUNDED** |
| **Arm the alarm** | **CONTINUE** | **BOUNDED** | **BOUNDED** |
| **Open the garage** | **FAIL CLOSED** | **FAIL CLOSED** | **FAIL CLOSED** |
| **Unlock a door** | **FAIL CLOSED** | **FAIL CLOSED** | **FAIL CLOSED** |
| **Disable the alarm** | **FAIL CLOSED** | **FAIL CLOSED** | **FAIL CLOSED** |
| **Smoke / CO response** | **EMERGENCY** | — | — |
| **Leak shutoff** | **EMERGENCY** | — | — |
| **Emergency egress unlock / lockdown** | **EMERGENCY** | — | — |
| **Security notification** | **CONTINUE** locally, degrade remotely | **CONTINUE** locally | **CONTINUE** locally |
| **Grant, modify, or extend access** | — | **FAIL CLOSED** | **FAIL CLOSED** |
| **Camera live view or recordings** | — | **FAIL CLOSED** | **FAIL CLOSED** |
| **Presence / occupancy read** | — | **FAIL CLOSED** | **FAIL CLOSED** |
| **Access-history read** | — | **FAIL CLOSED** | **FAIL CLOSED** |

> **Reminder: BOUNDED behaves as FAIL CLOSED today**, because no bounded-authority
> mechanism has been chosen ([U1](unresolved-decisions.md#u1)). Every **BOUNDED**
> cell above is currently refused. The column exists so the *target* posture is
> written down, not to authorize an implementation.

### Why each class was assigned

**CONTINUE for reads of local non-sensitive state and for lights.** No physical
risk and no access granted. Refusing these makes the house feel broken during
every outage for no security benefit. The residual concern is a compromised LAN
principal toggling lights as a nuisance; the correct control for that is an L5
rate limit, not authorization, and the consequence is bounded at "annoying".

**CONTINUE for a predeclared local automation, in any physically-safe
direction.** Nothing new is being authorized. The automation's trigger, scope,
and resource set were authorized when it was created, are immutable, and are
locally evaluable. During an outage the platform is *executing a prior decision*,
not *making a new one*. Its scope cannot be widened while degraded, and an
expired automation still does not fire.

**BOUNDED for interactive and agent requests in a physically-safe direction.**
Closing, locking, and arming are physically safer than their inverses, but the
platform still has no way to establish that *this* principal may act on *this*
resource. Closing a garage on a person, locking a household member out, or
arming an alarm around occupants are all real harms, and unlimited unauthorized
"safe" actions are a denial-of-service channel. These are the operations a
bounded-authority mechanism is genuinely *for*.

**FAIL CLOSED for the dangerous direction, always, for every requester —
including a predeclared automation.** Opening, unlocking, and disarming grant
physical access. No requester class earns them without a live decision, because
otherwise inducing an outage becomes a way in. An automation that wants to unlock
a door during an outage is exactly the automation an attacker would create.

**EMERGENCY for deterministic life-safety response.** Smoke/CO response, leak
shutoff, and emergency egress run ungated because the failure of *not acting* is
worse than any authorization concern. This is the one place where a lock may be
actuated in the permissive direction without a live decision — and it is
constrained hard, below.

**FAIL CLOSED for sensitive reads.** "Reads are safe" is false for cameras,
presence, and access history: each is directly useful to someone deciding whether
the house is empty.

**FAIL CLOSED for anything that changes authority.** By definition it requires a
live decision.

### The EMERGENCY exception is narrow and reviewed

`EMERGENCY` is the only class that both bypasses authorization *and* may act in a
permissive physical direction, so it is fenced:

1. **Deterministic only.** R0. No model, no agent, no automation-service
   dependency, no network.
2. **Triggered by a life-safety condition**, not by a request. There is no API
   that invokes emergency behaviour.
3. **Enumerated, reviewed, and signed off as an explicit emergency policy.** The
   set of doors an alarm system may release on a fire signal is a named, reviewed
   list — never a capability class, never "all locks".
4. **Loud.** Every activation annunciates locally and is audited, and it must not
   be silently reversible by the platform.
5. **Not a fallback.** No ordinary operation may be reclassified into
   `EMERGENCY` to make it work during an outage.

### The pattern

- **Physical direction sets the ceiling; requester sets the floor.** A safe
  direction can be at most `BOUNDED` for a new request, and a dangerous direction
  is `FAIL CLOSED` regardless of requester.
- **Executing a prior decision is not making a new one.** That is the whole
  justification for `CONTINUE` on predeclared automations.
- **Life safety is ungated by design**, narrowly and reviewably.
- **Sensitive reads fail closed.**
- **Anything that changes authority fails closed.** Always.

## Availability by outage mode

Rows reflect the classification above, with **BOUNDED shown at its current
behaviour (refused)**.

| | WAN down | Shared edge down | Authz unreachable | IdP unreachable | VPS down |
|---|---|---|---|---|---|
| Local reads (non-sensitive) | ✓ | ✓ | ✓ | ✓ (token valid) | ✓ |
| Lights | ✓ | ✓ | ✓ | ✓ (token valid) | ✓ |
| Predeclared local automations (safe direction) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Life-safety / EMERGENCY response | ✓ | ✓ | ✓ | ✓ | ✓ |
| Interactive close / lock / arm | ✗ closed *(BOUNDED, unimplemented)* | ✓ | ✗ closed *(BOUNDED)* | ✗ on expiry | ✓ if audit buffers |
| Interactive open / unlock / disarm | ✗ closed | ✓ | ✗ closed | ✗ on expiry | ✓ if audit buffers |
| Agent-initiated household actions | ✗ closed | ✓ | ✗ closed | ✗ on expiry | ✓ if audit buffers |
| Sensitive reads (camera, presence, history) | ✗ closed | ✓ | ✗ closed | ✗ on expiry | ✓ |
| Access grants and changes | ✗ closed | ✓ | ✗ closed | ✗ on expiry | ✓ |
| Remote access (Path A) | ✗ | ✗ | — | ✗ new logins | ✓ |
| Durable history / audit persistence | ✗ buffered | ✓ | ✓ | ✓ | ✗ buffered |
| New token issuance | ✗ | ✓ | ✓ | ✗ | ✓ |

**A WAN outage is currently more restrictive than the target posture**, because
every `BOUNDED` cell is refused until [U1](unresolved-decisions.md#u1) is
answered. During a WAN outage today a household member cannot interactively lock
a door — only a predeclared automation can. That is the conservative starting
posture, deliberately, and it is the concrete cost of leaving U1 open.

**Identity-provider outage is a slow failure.** Existing tokens stay valid until
expiry, so the household keeps working for one token lifetime and then degrades.
Token TTL is therefore an availability parameter as much as a security one.

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
