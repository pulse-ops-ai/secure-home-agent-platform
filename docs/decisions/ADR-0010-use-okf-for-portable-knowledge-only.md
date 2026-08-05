# ADR-0010: Use OKF for portable knowledge only

- **Status:** Accepted
- **Date:** 2026-08-03
- **Accepted:** 2026-08-05
- **Deciders:** @mikegtech (repository owner)
- **Supersedes:** none
- **Related:** [ADR-0004](ADR-0004-treat-agents-as-clients.md), [ADR-0005](ADR-0005-separate-capability-authorization-and-safety.md), [ADR-0008](ADR-0008-use-openfga-for-relationships-and-deterministic-policy-for-safety.md), [`knowledge/README.md`](../../knowledge/README.md)

## Context

Agents reasoning about a house need durable context that is not in any database:
which HVAC zone serves which rooms, what the equipment actually is and what its
limits are, what the tariff structure means, which runbook applies when the
heat pump locks out, who owns a decision, and how stale a fact is.

That is **knowledge**: slow-moving, human-authored, reviewable, portable.

The failure mode is obvious once stated. A knowledge bundle is a convenient
place to put things, so it accumulates current temperature, whether anyone is
home, an access token "just for the agent", and a copy of who may open the
garage. At that point the bundle is an ungoverned parallel copy of live state,
secrets, and authorization — readable by any agent that can read knowledge, with
no revocation and no freshness guarantee.

A second, subtler failure: a knowledge bundle that carries authorization facts
becomes a *shadow policy source*. Agents would start reasoning from it, and it
would drift from the real decision point.

OKF is a candidate format for these bundles. It has not been validated for this
use and there is no working toolchain here.

## Decision

### 1. Knowledge bundles are portable knowledge only

A bundle carries facts that are slow-moving, human-authored, reviewable, and
safe to copy to another machine.

**Permitted:**

- home topology — floors, areas, rooms, and their relationships;
- device semantics — what a device *is*, what it means, what it is for
  (not what it currently reads);
- HVAC equipment mapping — zones, equipment, capacities, operating limits;
- Gridwise tariff and telemetry **semantics** — what a rate structure means, what
  a metric represents, its units and its interpretation;
- policies as documentation, runbooks, known limitations, ownership, and
  freshness metadata.

**Prohibited — never in a knowledge bundle:**

- secrets, tokens, keys, or credentials of any kind;
- live device state or any current reading;
- current presence or occupancy;
- authorization tuples, grants, or any relationship the decision point owns;
- mutable automation state;
- camera media or any recording;
- raw personal telemetry.

### 2. Every bundle declares ownership and freshness

Ownership, a freshness or as-of date, and stated limitations are **required**.
A fact with no owner and no date is not knowledge; it is a rumour with
formatting.

### 3. Knowledge is an input to reasoning, never an authority

An agent may read knowledge to *understand*. It may not use knowledge to
*authorize*, to *evaluate safety*, or to *substitute for reading live state*.
Authorization comes from the decision point
([ADR-0008](ADR-0008-use-openfga-for-relationships-and-deterministic-policy-for-safety.md)),
safety bounds from deterministic policy
([ADR-0005](ADR-0005-separate-capability-authorization-and-safety.md)), and live
state from the governed API.

If knowledge and live state disagree, **live state wins** and the discrepancy is
reported.

### 4. OKF is experimental and isolated behind an interface

The layout under [`knowledge/`](../../knowledge/) is **exploratory**. No OKF
schema is invented or asserted here, and none is validated.

The format is isolated behind four future interfaces so it can be replaced
without touching agents or services:

| Interface | Responsibility |
|---|---|
| **compile** | source knowledge → an internal representation |
| **validate** | schema conformance **and** the prohibited-content rules above |
| **package** | a versioned, addressable, integrity-checkable bundle |
| **query** | the only way an agent or service reads knowledge |

No agent, service, or profile reads bundle files directly. Direct file reads
would make the format load-bearing and unreplaceable.

### 5. Validation is a gate, not advice

The prohibited-content list is machine-checked before a bundle is publishable.
A bundle that fails is not published — it is not a warning.

## Consequences

**Positive.**

- The knowledge layer stays reviewable, portable, and safe to copy — including
  to an R2 or R3 execution context, because it contains nothing sensitive.
- The secrets-and-live-state failure mode is prevented by an enforced rule
  rather than by discipline.
- An unvalidated format cannot become load-bearing, because nothing reads it
  directly.
- Freshness metadata makes staleness visible instead of silent.

**Negative.**

- Four interfaces plus a validator is real work before the first bundle is
  useful.
- The boundary between "device semantics" and "device state" needs care — a
  device's *rated capacity* is knowledge; its *current output* is not.
- Agents needing both knowledge and live state must make two calls. Intentional.

**Neutral.**

- Choosing OKF is not decided by this ADR. Choosing *portable knowledge only*,
  behind an interface, is.

## Alternatives considered

- **Put everything an agent might need in the knowledge bundle.** Rejected: it
  becomes an ungoverned copy of live state, secrets, and authorization, with no
  revocation path. This is the failure mode the ADR exists to prevent.
- **Skip the knowledge layer; let agents query services for everything.**
  Rejected: topology, equipment semantics, and runbooks are not in any service,
  and re-deriving them per agent produces inconsistent, unreviewable context.
- **Commit to an OKF schema now.** Rejected: no validated schema exists for this
  use, and freezing one prematurely creates migration cost with no evidence
  behind it.
- **Let agents read bundle files directly.** Rejected: the on-disk format would
  become a hard dependency of every agent, and the prohibited-content rules
  would have no enforcement point.
- **Store knowledge in the VPS database.** Rejected: it would make knowledge
  unavailable during a VPS outage and would lose the review-as-code property.
  Knowledge is authored, reviewed, and versioned like code.
- **Warn instead of failing on prohibited content.** Rejected: a warning on a
  committed secret is not a control.

## Security implications

- The prohibited-content rules are the security value of this ADR. A bundle
  containing a token or an authorization tuple is a credential leak or a shadow
  policy source.
- Because bundles contain nothing sensitive, they can be shipped to less trusted
  execution contexts — which is precisely why the rules must be enforced rather
  than assumed.
- Knowledge must never be used to authorize. A bundle claiming "Alice may open
  the garage" is not a grant; the decision point is.
- Bundles are integrity-checkable when packaged, so a tampered bundle is
  detectable.

## Availability implications

- Knowledge is local and file-based, so it is available during WAN, VPS, and
  authorization outages — one of the few things that is.
- Because it is not an authority, its availability does not weaken any control.
  An agent with knowledge and no authorization still cannot act.
- Staleness is the real availability risk: a bundle describing equipment that
  has been replaced is confidently wrong. Freshness metadata plus "live state
  wins" bounds this.

## Validation and follow-up obligations

1. Evaluate OKF against the four interfaces and record the outcome. If it does
   not fit, choose another format — the interfaces do not change. Not done in
   this change.
2. Implement the validator for the prohibited-content rules **before** the first
   real bundle is authored. This is the gating deliverable.
3. Define required bundle metadata: owner, as-of date, limitations, scope,
   version.
4. Add tests asserting that a bundle containing a token-shaped string, a live
   reading, a presence fact, or an authorization tuple fails validation.
5. Add a repository check that no agent or service imports a bundle file
   directly.

## References

- [`knowledge/README.md`](../../knowledge/README.md)
- [`knowledge/AGENTS.md`](../../knowledge/AGENTS.md)
- [`docs/architecture/system-context.md`](../architecture/system-context.md)

---

**Accepted and immutable.** Do not edit this ADR. Reverse or amend the decision
by writing a new ADR that supersedes it, and update
[`INDEX.md`](INDEX.md) in the same change.
