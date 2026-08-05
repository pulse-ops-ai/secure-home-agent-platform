# ADR-0009: Define degraded mode and offline authorization posture

- **Status:** Proposed
- **Date:** 2026-08-03
- **Deciders:** repository owner (pending human acceptance)
- **Supersedes:** none
- **Related:** [ADR-0002](ADR-0002-adopt-hybrid-home-deployment-profile.md), [ADR-0005](ADR-0005-separate-capability-authorization-and-safety.md), [ADR-0008](ADR-0008-use-openfga-for-relationships-and-deterministic-policy-for-safety.md), [`docs/architecture/degraded-mode.md`](../architecture/degraded-mode.md)

## Context

Two requirements are in direct tension.

- **Local-first availability.** The house must keep working when the WAN is
  down. Lights, thermostat, and safety automations cannot wait for a round trip
  to anything outside the building.
- **Fail closed on sensitive actions.** Locks, garage doors, and alarms must not
  operate on an unverified authorization. "The network was down so we allowed
  it" is the worst possible failure mode for a house.

A central policy decision point satisfies the second and breaks the first. A
purely local decision satisfies the first and, done naively, breaks the second —
a cached `permit` is a stale `permit`, and stale permits on a door lock are how
revoked access keeps working.

Failures are also not one thing. At least five distinct outages matter, and they
do not have the same answer:

| Outage | Reachable |
|---|---|
| WAN down | Pi, LAN, Home Assistant. Not: shared edge, VPS, cloud, identity provider |
| Shared edge down | Everything local and the tailnet. Remote entry lost |
| Authorization decision point unreachable | Everything else |
| Identity provider unreachable | Existing tokens valid until expiry; no new tokens |
| VPS down | Local operation intact; durable writes and history lost |

A single "offline mode" flag cannot express this.

## Decision

### 1. Four response classes, assigned by operation AND requester

**Physical direction and principal authority are two different questions.**
Collapsing them — treating a physically-safe direction as authorization-free — is
the error this decision explicitly avoids:

```
Is the physical direction safe?     ≠     May this principal initiate it now?
```

Closing a garage can injure someone; locking a door can lock a household member
out or impede a responder already inside; arming an alarm around occupants
produces a false alarm and possibly an armed response. And a compromised but
authenticated LAN principal can use unlimited "safe" actions as denial of service
precisely when relationship authorization is unavailable to stop it.

A safe direction therefore earns a *more permissive* class, never an
*authorization-free* one.

Every household operation is classified by **(operation, requester)**:

- **CONTINUE** — proceeds without a live authorization decision, because
  authority was **already established and is locally available** (a predeclared
  automation with an immutable, locally-evaluable scope), or because the
  operation carries no physical risk and refusing it would break the house for no
  security benefit.
- **BOUNDED** — may proceed on a bounded, previously-established local authority
  with explicit expiry, scope, and audit obligation. Requires a mechanism that
  does not yet exist (see below).
- **FAIL CLOSED** — does not proceed without a live authorization decision.
  Refused, explained to the user, and audited.
- **EMERGENCY** — deterministic life-safety response acting under an explicitly
  reviewed emergency policy, ungated by authorization by design.

The distinguishing question for CONTINUE versus BOUNDED is **whether a new
authorization is being made or a prior one is being executed**:

| Requester | Class ceiling in a safe direction |
|---|---|
| predeclared local automation | **CONTINUE** — executing a prior decision, not making a new one |
| interactive human | **BOUNDED** — a new request; nothing established this authority |
| agent | **BOUNDED**, and **FAIL CLOSED** for anything sensitive — delegation cannot be checked |

The full classification is maintained in
[`docs/architecture/degraded-mode.md`](../architecture/degraded-mode.md) and is
part of this decision.

This preserves
[ADR-0005](ADR-0005-separate-capability-authorization-and-safety.md)'s
separation: deterministic safety policy bounds the *action*; it never substitutes
for deciding *who may act*.

### 2. Life-safety response always continues, under a narrow EMERGENCY policy

Deterministic local life-safety behaviour — smoke and CO response, leak shutoff,
freeze protection, equipment interlocks, emergency egress — is **R0 deterministic
local** ([ADR-0007](ADR-0007-route-local-remote-and-cloud-execution-explicitly.md))
and runs with **no dependency on authorization, the agent runtime, the automation
service, the VPS, or the WAN**. Not acting is the greater hazard.

Because `EMERGENCY` is the one class that may act in a *permissive* physical
direction without a live decision, it is fenced:

1. deterministic only — no model, no agent, no network;
2. triggered by a life-safety condition, never by a request; there is no API that
   invokes emergency behaviour;
3. enumerated and reviewed as an explicit emergency policy — the doors an alarm
   may release on a fire signal are a named list, never "all locks";
4. loud — every activation annunciates locally and is audited;
5. never a fallback — no ordinary operation may be reclassified into `EMERGENCY`
   to make it work during an outage.

### 3. Sensitive operations fail closed, for every requester

Unlocking a door, opening a garage, disabling an alarm, and granting or modifying
access all **FAIL CLOSED** when authorization cannot be decided — including when
the requester is a predeclared automation. There is no degraded path that permits
them on a network failure.

An automation that wants to unlock a door during an outage is exactly the
automation an attacker would create, so prior authorization does not earn the
dangerous direction. The only exception is a reviewed `EMERGENCY` egress policy
under the constraints above.

Sensitive **reads** — camera, presence, access history — also fail closed. "Reads
are safe" is false when the read tells someone whether the house is empty.

### 4. Bounded local authority is a candidate, not a decision

Three mechanisms could give the local path bounded authority when the central
decision point is unreachable:

- **a local OpenFGA replica** — a read replica of the household store on the Pi;
- **signed grants / capability leases** — short-lived, signed, scope-limited
  capabilities issued while connectivity exists and verifiable offline;
- **a bounded decision cache** — recently-made decisions cached with a strict
  TTL and a sensitivity-dependent policy.

Each has a revocation-latency problem, which is the whole difficulty: a cached
or leased permit outlives the removal of access by its lifetime.

**No mechanism is selected in this ADR.** Selecting one without evidence would
be the most consequential unforced error available here. The choice is recorded
as unresolved in
[`docs/architecture/unresolved-decisions.md`](../architecture/unresolved-decisions.md)
and requires its own ADR.

Until then, **BOUNDED behaves as FAIL CLOSED.** The classification exists so the
target posture is written down; it does not authorize an implementation.

### 5. A central decision point alone is not sufficient

Recorded explicitly: an architecture in which every household action requires a
live call to a central authorization service **does not satisfy the local-first
requirement**. Something must exist locally. What that something is remains open.

### 6. Degraded mode is observable

When the platform is degraded it says so — to users, in audit, and on every
affected response. A refusal must state *which* dependency was unavailable.
Silent degradation is prohibited: a household member must never have to guess
whether the system is enforcing.

### 7. Recovery is explicit

On restoration, the platform reconciles: buffered audit is flushed, any bounded
authority used is reported, and standing automations do not replay missed
triggers unless the automation declares that it should.

## Consequences

**Positive.**

- The availability posture is written down per operation rather than being an
  emergent property of whichever service happened to time out.
- Safety behaviour is protected by construction — it has no dependency to lose.
- The dangerous direction (unlock, open, disarm) is protected by an explicit
  fail-closed rule that no implementation convenience can quietly erode.
- **Physical safety and principal authority stay separate.** A physically-safe
  direction earns a more permissive class without becoming authorization-free,
  so "safe by construction" cannot quietly grow into "anyone may do it".
- The hard problem is named rather than solved badly.

**Negative.**

- Until a bounded-authority mechanism exists, more operations fail closed during
  an outage than the end state intends — and this decision *widens* that set,
  because interactive close/lock/arm moved from CONTINUE to BOUNDED. During a WAN
  outage today a household member cannot interactively lock a door; only a
  predeclared automation can. That is a real usability cost, accepted, and it is
  the concrete price of leaving [U1](../architecture/unresolved-decisions.md#u1)
  open rather than guessing.
- Classification is now two-dimensional, so every capability needs a class per
  requester rather than a single verdict.
- Per-operation classification is a maintenance obligation. Every new capability
  needs a classification, or it defaults to fail closed.
- Observable degradation means surfacing state that a simpler product would
  hide.

**Neutral.**

- Fail-closed-by-default while the mechanism is undecided is a conservative
  starting posture, not the intended end state.

## Alternatives considered

- **Fail closed on everything.** Rejected: a WAN outage would leave a household
  member unable to turn on a light, and would risk suppressing safety
  automations. Unacceptable.
- **Fail open on everything local.** Rejected: it converts any authorization
  outage — including a deliberately induced one — into full physical access.
  This is the single worst option available and is worth naming.
- **Fail open on reads, closed on writes.** Rejected as too coarse: some reads
  are sensitive (camera, presence, access history) and some writes are safe
  (turning a light off). Direction, sensitivity, and requester matter more than
  read/write.
- **Classify by physical direction alone — "safe direction always continues".**
  Considered, and it was this ADR's first draft. Rejected: it conflates a safe
  *action* with a safe *actor*. Closing a garage can injure someone, locking a
  door can lock someone out or impede a responder, arming an alarm around
  occupants triggers a response, and unlimited unauthorized safe-direction
  actions are a denial-of-service channel available exactly when authorization is
  down. Direction sets the ceiling; it does not remove the authorization
  question.
- **Treat life-safety response as ordinary CONTINUE.** Rejected: life safety is
  the only case that both bypasses authorization and may act permissively, so it
  needs its own class with explicit fencing. Folding it into CONTINUE would make
  "reclassify it as safety" an available route around authorization.
- **Pick a bounded-authority mechanism now.** Rejected: revocation latency,
  key management, and replication cost differ sharply between the three
  candidates, and there is no operating evidence yet. Deciding now would be
  guessing on the highest-stakes design point in the repository.
- **Delegate degraded behaviour to Home Assistant.** Rejected as the platform
  answer: it would move the security posture into the device substrate and grant
  it authority the architecture does not give it. Home Assistant may hold local
  interlocks as defence in depth.
- **A "household is trusted when local" rule.** Rejected: it is network-position
  authority under a friendlier name, and it fails the moment a device on the LAN
  is compromised.

## Security implications

- Fail-closed on the dangerous direction means an attacker cannot obtain
  physical access by *causing* an outage. This is the property that makes the
  whole posture defensible, and it must survive every future optimization.
- Any bounded-authority mechanism introduces a revocation window whose length is
  a security parameter and must be an explicit, reviewed decision — shorter for
  higher sensitivity.
- Observable degradation removes a class of attack where the system is quietly
  pushed into a weaker mode.
- Audit must not be lost during a degraded period. Buffered locally, flushed on
  recovery, and if buffering is impossible, the sensitive action does not
  proceed.

## Availability implications

- **Guaranteed during WAN outage:** EMERGENCY life-safety response, local reads
  of local non-sensitive state, lights, and predeclared local automations acting
  in a safe direction within their immutable scope.
- **Not guaranteed:** remote access, durable history, cloud inference, new token
  issuance.
- **Fail closed:** the dangerous direction for every requester, sensitive reads,
  access grants, and — until U1 is answered — every BOUNDED operation, including
  an interactive request to lock a door or close a garage.
- Identity provider unavailability is distinct from authorization unavailability
  and must be classified separately — existing tokens remain valid until expiry,
  so short TTLs trade availability against revocation latency.

## Validation and follow-up obligations

1. Write a follow-on ADR selecting the bounded-authority mechanism, with
   revocation latency as the primary criterion. **Blocking prerequisite for any
   BOUNDED classification to be implemented.**
2. Complete and maintain the **(operation × requester)** classification in
   [`docs/architecture/degraded-mode.md`](../architecture/degraded-mode.md); make
   an unclassified combination fail closed by default.
3. Define what makes an automation "predeclared" for CONTINUE eligibility: an
   immutable, locally-evaluable scope; enforced expiry; no widening while
   degraded. Without a testable definition, CONTINUE-for-automations is a
   loophole rather than a rule.
4. Enumerate and obtain sign-off on the `EMERGENCY` policy set — specifically
   which doors may be released on which life-safety signal. **Blocking
   prerequisite for any emergency egress behaviour.**
5. Add degraded-mode scenario tests
   ([`tests/policy-scenarios/`](../../tests/policy-scenarios/)) with the
   authorization decision point unreachable, the WAN severed, and the VPS
   unreachable, asserting the classified outcome for **every cell** of the
   classification table — including that an interactive lock request is refused
   while the equivalent predeclared automation proceeds.
6. Add an operational drill in [`docs/operations/`](../operations/INDEX.md) that
   severs connectivity on the real Pi and verifies the classification.
7. Assert that every degraded refusal names the unavailable dependency and emits
   an audit record.

## References

- [`docs/architecture/degraded-mode.md`](../architecture/degraded-mode.md) — the operation classification
- [`docs/architecture/unresolved-decisions.md`](../architecture/unresolved-decisions.md)
- [`docs/architecture/local-remote-routing.md`](../architecture/local-remote-routing.md)
- Upstream `architecture/profiles/self-hosted-vps.md` failure-mode table @ `v0.3.0`
