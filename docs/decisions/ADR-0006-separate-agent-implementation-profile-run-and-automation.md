# ADR-0006: Separate agent implementation, execution profile, run, and automation

- **Status:** Proposed
- **Date:** 2026-08-03
- **Deciders:** repository owner (pending human acceptance)
- **Supersedes:** none
- **Related:** [ADR-0003](ADR-0003-use-framework-neutral-runner-profiles.md), [ADR-0004](ADR-0004-treat-agents-as-clients.md), [ADR-0005](ADR-0005-separate-capability-authorization-and-safety.md)

## Context

"Agent" is used casually to mean at least four different things: the code, the
configured way of running it, one execution of it, and a standing arrangement
that keeps executing it. Systems that do not separate them end up with:

- authority attached to code rather than to a reviewed configuration,
- no diffable record of what a given execution was permitted to do,
- automations that silently inherit whatever the code can do today, including
  capabilities added long after the automation was approved,
- audit that cannot answer "under what authority did this happen?".

For a platform that actuates physical devices in a home, the last one is
disqualifying. A standing automation is the most dangerous object in the system:
it acts repeatedly, without a human present, often at times chosen by a trigger
rather than by a person.

## Decision

Four distinct concepts. Each has its own identity, its own lifecycle, and its
own governance. **They are never conflated, and no concept may substitute for
another.**

### 1. Agent implementation

Domain code — a climate observer, a security reviewer, an energy planner.

- Lives in [`agents/implementations/`](../../agents/implementations/).
- Versioned like any other code, reviewed as code.
- **Carries no authority.** Merging an implementation grants nothing.
- Names no credential, no device, and no endpoint directly.

### 2. Execution profile

The reviewed, declarative binding that makes an implementation runnable:
runner image, adapter, tool surface, filesystem access, network policy, model
route, timeouts and limits, the identity the run authenticates as, and the
evidence contract.

- Lives in [`profiles/`](../../profiles/).
- **This is where authority is granted.** A profile change is a security change
  and is reviewed as one.
- Versioned and identifiable, so a run can name exactly which profile version it
  used.

### 3. Run

One invocation of one profile.

- Has a run identity, a start and end, a triggering cause, a resolved principal
  (`sub`, and `actor` when acting for a human), a profile reference, an outcome,
  and an evidence bundle.
- **Immutable once complete.** A run is a historical fact.
- Is the unit that audit, cancellation, timeout, and resource accounting attach
  to.

### 4. Automation

A persisted standing arrangement that causes runs to happen.

- Has a trigger, conditions, the policy scope it operates under, the resource
  scope it may touch, an **expiration**, an owner, an enable/disable state, and a
  **binding to a specific profile version**.
- Lives in [`services/automation-service/`](../../services/automation-service/).
- **Is authorized in its own right**, separately from the profile. Approving a
  profile for interactive use does not approve it for unattended use.

### Rules

1. **Authority is granted by profiles, not by implementations.** New code cannot
   widen what a run may do.
2. **A run always names its profile version.** "Which profile?" must never be
   ambiguous in audit.
3. **An automation binds a profile version, not a moving reference.** A profile
   update does not silently change what a standing automation is permitted to
   do; re-binding is an explicit, reviewed act.
4. **Automations expire.** An automation with no expiration is not permitted. A
   forgotten automation that still actuates devices is the failure mode this
   rule exists to prevent.
5. **Automations are separately authorized.** An unattended run needs its own
   grant, because there is no human in the loop to catch a wrong action.
6. **Autonomous runs have no `actor`, explicitly.** See
   [ADR-0004](ADR-0004-treat-agents-as-clients.md).

## Consequences

**Positive.**

- Audit can answer, for any device action: which run, under which profile
  version, triggered by which automation or which human, acting for whom.
- A capability added to an implementation does not leak into existing
  automations.
- Profiles can be reviewed by a security reader without reading agent code.
- Expiration converts "we should clean these up" from an intention into a
  mechanism.

**Negative.**

- Four objects to model and keep consistent, when a simpler system would have
  one. This is real overhead for the first agent.
- Profile versioning plus automation binding means routine profile changes
  require deliberate re-binding, which will feel like friction.
- Expiration will occasionally disable something useful at an inconvenient
  moment. That is the intended trade: silent perpetual authority is worse.

**Neutral.**

- The split says nothing about how automations are stored or scheduled. That is
  unresolved; see
  [`docs/architecture/unresolved-decisions.md`](../architecture/unresolved-decisions.md).

## Alternatives considered

- **Agent = code + config in one object.** Rejected: authority would attach to
  code, so a merge could widen production authority without a security review.
- **No run object; log lines only.** Rejected: cancellation, timeout, resource
  accounting, and evidence all need something to attach to, and audit needs a
  join key.
- **Automations as Home Assistant automations.** Rejected as the platform
  mechanism: they sit in a different governance path, cannot carry profile
  binding or agent delegation, and would move platform authority into the device
  substrate. Home Assistant automations remain appropriate for local device-level
  interlocks.
- **Automations bind a profile *name* rather than a version.** Rejected: it
  reintroduces silent authority drift, which is the main failure this ADR
  prevents.
- **Automations without expiration, reviewed periodically.** Rejected: periodic
  review is a promise; expiration is a mechanism. Prefer the mechanism.
- **Merge run and automation ("recurring run").** Rejected: an automation is a
  policy object with a scope and an expiry; a run is an immutable historical
  fact. Merging makes the record mutable.

## Security implications

- The security review surface for agent authority is the profile set, which is
  small, declarative, and diffable — instead of the whole implementation
  codebase.
- Automation expiration bounds the lifetime of unattended physical authority.
- Version binding prevents the "approved once, widened later" escalation.
- Separate authorization for automations reflects that unattended action is a
  materially higher risk than interactive action, and is the correct place to
  require stricter policy for sensitive devices.

## Availability implications

- Automation persistence and scheduling become availability-relevant components:
  if the automation store is unreachable, standing automations must not
  double-fire, and must not silently stop for safety-relevant behaviour.
  Mechanism unresolved.
- Deterministic **local safety** automations are deliberately not agent
  automations. They must not depend on the automation service, the runner
  substrate, or any agent. See
  [ADR-0009](ADR-0009-define-degraded-mode-and-offline-authorization.md).
- Run records must be durable enough for audit. The Pi is not authoritative
  storage, so buffering behaviour when the VPS is unreachable must be designed —
  and losing audit for a sensitive action is not acceptable.

## Validation and follow-up obligations

1. Define the run schema ([`schemas/run/`](../../schemas/run/)) and the
   automation schema ([`schemas/automation/`](../../schemas/automation/)),
   including expiration as a required field. Not done in this change.
2. Decide automation persistence and scheduler implementation — unresolved; see
   [`docs/architecture/unresolved-decisions.md`](../architecture/unresolved-decisions.md).
3. Add conformance tests asserting: a run without a resolvable profile version
   is rejected; an automation without an expiration is rejected; an expired
   automation does not fire; a profile update does not change an existing
   automation's effective authority.
4. Add an audit assertion that every device action joins to a run, a profile
   version, and a triggering cause.

## References

- [`docs/architecture/runner-model.md`](../architecture/runner-model.md)
- [`agents/README.md`](../../agents/README.md)
- [`profiles/README.md`](../../profiles/README.md)
- [`services/automation-service/README.md`](../../services/automation-service/README.md)
