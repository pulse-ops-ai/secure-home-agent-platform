---
type: model
owner: human:mikegtech
as_of: 2026-08-19
limitations: Portable projection only. States no enforced rule, threshold, endpoint, credential, or live platform state. Grants nothing.
status: draft
stale_after: 2027-08-19
governs:
  - docs/decisions/ADR-0004-treat-agents-as-clients.md
  - docs/decisions/ADR-0005-separate-capability-authorization-and-safety.md
  - docs/decisions/ADR-0010-use-okf-for-portable-knowledge-only.md
  - docs/architecture/system-context.md
  - services/README.md
  - services/AGENTS.md
generated:
  by: claude-code/2.1.235
  at: 2026-08-19T04:22:58Z
---

# What an agent is here

**An agent is a client, never an insider.**

A run re-enters the platform through the same governed enforcement point a
browser would use. There is no internal path, no privileged back-channel, and no
credential that belongs to a run because of where it happens to execute. Running
on the same host as the platform conveys nothing.

That is the whole posture, and most of what follows is a consequence of it.

## Proposing is not deciding

**An agent proposes; the platform decides.**

A run states what it wants to happen. Whether it happens is answered by controls
the run does not own and cannot see the internals of. This is not a limitation
to be engineered around — it is the property that makes an agent safe to have at
all.

A run also never gains authority from the person it acts for beyond what that
person already has, and a person gains nothing by routing a request through a
run. Both directions are checked. Neither is a loophole.

## A denial is a normal outcome

**A denial is an expected, governed result — not an error, and not a fault to
route around.**

This is the single most important thing to internalise, because the instinct it
contradicts is strong. When a request is refused, the correct response is to
report the refusal and stop, not to look for a different path to the same effect.
Finding another route is not resourcefulness here; it is the specific failure
mode the whole design exists to prevent.

If a refusal seems wrong, that is a matter for a person to review, and saying so
clearly is the useful contribution a run can make.

## What this concept does not carry

The rules themselves. That controls exist, what they are for, and how a run
should behave around them is context. The model those controls evaluate, the
bounds they enforce, and the current state of the platform are not, and putting
them here would let a run reason about its own limits as data.
