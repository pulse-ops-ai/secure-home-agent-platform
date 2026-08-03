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

### 1. Three response classes for every operation

Every household operation is classified into exactly one:

- **CONTINUE** — proceeds on local deterministic evaluation alone. Used where
  the operation is safe by construction or where *not* acting is more dangerous
  than acting.
- **BOUNDED** — may proceed on a bounded, previously-established local authority
  with an explicit expiry, scope, and audit obligation. Requires a mechanism
  that does not yet exist (see below).
- **FAIL CLOSED** — does not proceed without a live authorization decision.
  The operation is refused, the refusal is explained to the user, and the
  refusal is audited.

The classification for a representative operation set is maintained in
[`docs/architecture/degraded-mode.md`](../architecture/degraded-mode.md) and is
part of this decision.

### 2. Local safety automations always continue

Deterministic local safety behaviour — smoke and CO response, leak shutoff,
freeze protection, equipment interlocks — is **R0 deterministic local**
([ADR-0007](ADR-0007-route-local-remote-and-cloud-execution-explicitly.md)) and
runs with **no dependency on authorization, the agent runtime, the automation
service, the VPS, or the WAN**. It is not agent-mediated and it is not
authorization-gated. Not acting is the greater hazard.

### 3. Sensitive operations fail closed

Unlocking a door, opening a garage, disabling an alarm, and granting or
modifying access all **FAIL CLOSED** when authorization cannot be decided.
There is no degraded path that permits them on a network failure.

This is deliberately asymmetric with the safe direction: **closing** a garage or
**locking** a door is safe by construction and is classified more permissively
than the opening direction.

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
- The hard problem is named rather than solved badly.

**Negative.**

- Until a bounded-authority mechanism exists, more operations fail closed during
  an outage than the end state intends. A WAN outage will be more annoying than
  it eventually needs to be.
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
  (turning a light off, closing a garage). Direction and sensitivity matter more
  than read/write.
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

- **Guaranteed during WAN outage:** local safety automations, local reads of
  local state, safe-direction actuation as classified.
- **Not guaranteed:** remote access, durable history, cloud inference, new token
  issuance.
- **Fail closed:** sensitive actions, access grants, and anything requiring a
  fresh authorization decision.
- Identity provider unavailability is distinct from authorization unavailability
  and must be classified separately — existing tokens remain valid until expiry,
  so short TTLs trade availability against revocation latency.

## Validation and follow-up obligations

1. Write a follow-on ADR selecting the bounded-authority mechanism, with
   revocation latency as the primary criterion. **Blocking prerequisite for any
   BOUNDED classification to be implemented.**
2. Complete and maintain the operation classification in
   [`docs/architecture/degraded-mode.md`](../architecture/degraded-mode.md); make
   an unclassified capability fail closed by default.
3. Add degraded-mode scenario tests
   ([`tests/policy-scenarios/`](../../tests/policy-scenarios/)) with the
   authorization decision point unreachable, the WAN severed, and the VPS
   unreachable, asserting the classified outcome for each representative
   operation.
4. Add an operational drill in [`docs/operations/`](../operations/INDEX.md) that
   severs connectivity on the real Pi and verifies the classification.
5. Assert that every degraded refusal names the unavailable dependency and emits
   an audit record.

## References

- [`docs/architecture/degraded-mode.md`](../architecture/degraded-mode.md) — the operation classification
- [`docs/architecture/unresolved-decisions.md`](../architecture/unresolved-decisions.md)
- [`docs/architecture/local-remote-routing.md`](../architecture/local-remote-routing.md)
- Upstream `architecture/profiles/self-hosted-vps.md` failure-mode table @ `v0.3.0`
