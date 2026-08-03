# knowledge/security/

**Security-domain semantics**: what the household's security systems are, what
their signals mean, and what to do about them.

> **Status: empty.** No bundle exists — the validator must come first.
> **This is the domain where the prohibited-content rules matter most.**

## What belongs here

- What security equipment exists and what each device class is for — as
  **semantics**, not inventory with identifiers.
- What a signal **means**: the difference between a door-ajar sensor and a forced
  entry indication; what a smoke detector's supervisory state indicates.
- **Runbooks**: what a household member should do on a given alert.
- Escalation conventions: who is notified, in what order, for which class of
  event.
- Known limitations: what the system does **not** detect. This is often the most
  valuable content in the bundle.
- Owner, as-of date, limitations.

## What does not belong here — enforced

- **Current alarm state, armed/disarmed status, or any sensor reading.**
- **Presence or occupancy.**
- **Camera media, stills, or clips.** Never.
- **Access history** — who entered when.
- **Access grants or authorization tuples.** Who may unlock a door is owned by
  the policy decision point, never by a document an agent can read.
- **Codes, PINs, credentials, or key identifiers.**
- **Device identifiers or network addresses** that would help an attacker locate
  a specific sensor.
- **Household member names.**

## Why this is the strictest directory

A knowledge bundle is portable by design — safe to send to any execution
context, including a cloud model provider
([ADR-0007](../../docs/decisions/ADR-0007-route-local-remote-and-cloud-execution-explicitly.md)).
A security bundle containing sensor placement, access history, or occupancy
patterns would be a map of the house's weaknesses, transmitted routinely.

Write for a reader you do not control.

## Governed by

[`../README.md`](../README.md) → [`../AGENTS.md`](../AGENTS.md) · ADRs
[0008](../../docs/decisions/ADR-0008-use-openfga-for-relationships-and-deterministic-policy-for-safety.md),
[0010](../../docs/decisions/ADR-0010-use-okf-for-portable-knowledge-only.md)

## Validation

Future: `validate` enforces the prohibited-content rules, with extra scrutiny for
this domain.
