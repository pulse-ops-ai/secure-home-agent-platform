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

# What a physical action guarantees

**A physical action has an observable lifecycle and no atomicity guarantee.**

Nothing in this platform promises a transaction boundary across a device. A
command is dispatched, the world may or may not change, and what happened is
learned by observation rather than assumed from the request returning.

## `indeterminate` is a real outcome

An unclear result is a **first-class terminal outcome**, not a failure to retry
blindly.

This is the part most likely to be handled wrongly, because the reflex is to
treat uncertainty as transient. It is not. When the outcome of a physical action
is unknown, the honest report is that it is unknown. Repeating the command to
resolve the ambiguity is a decision to act twice on the world, and a run does not
get to make that decision on its own.

Nor is an automatic inverse command a correction. Undoing something that may not
have happened is another physical action with the same uncertainty, taken in a
situation already known to be unclear.

## Why this shape

The house is not a database, and modelling it as one produces confident,
incorrect reporting. A lifecycle that admits observation, delay, and ambiguity
describes what is actually true, and a run reasoning honestly about an unclear
state is far more useful than one reporting success it cannot support.

## What a run should do

Report the observed lifecycle, including `indeterminate` when that is what
happened. Do not retry a physical action on ambiguity, do not send an inverse,
and do not translate an unclear outcome into either a success or a plain failure
because those are easier to report.
