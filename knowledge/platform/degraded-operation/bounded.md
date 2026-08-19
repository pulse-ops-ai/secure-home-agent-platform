---
type: model
owner: human:mikegtech
as_of: 2026-08-19
limitations: Portable projection only. Carries no per-operation policy table, no current outage or service health, and no live policy configuration. Names no bounded-authority mechanism, because none is selected. Grants nothing.
status: draft
stale_after: 2027-08-19
governs:
  - docs/decisions/ADR-0002-adopt-hybrid-home-deployment-profile.md
  - docs/decisions/ADR-0009-define-degraded-mode-and-offline-authorization.md
  - docs/architecture/degraded-mode.md
  - docs/decisions/ADR-0010-use-okf-for-portable-knowledge-only.md
generated:
  by: claude-code/2.1.235
  at: 2026-08-19T03:36:46Z
---

# `BOUNDED` is not a yes

**`BOUNDED` currently behaves as `FAIL CLOSED`.** Treat it as a refusal.

The class exists so the target posture is written down. It does not describe
anything a run may rely on today, and reading it as conditional permission is
the single most consequential misreading available in this module.

## Why it behaves that way

Proceeding on a previously-established local authority requires a mechanism that
would have to work while the deciding component is unreachable. **No such
mechanism has been selected.**

The difficulty is revocation latency: any authority established in advance
outlives the removal of access by however long it was granted for. Something
issued or remembered while things were healthy keeps answering after the reason
for it has gone away, and the window is exactly when nothing can correct it.

Choosing one without evidence would be a serious unforced error, so the choice
is recorded as unresolved and needs its own decision.

## What a run must not do with this

- **Do not treat a `BOUNDED` classification as permission.** It is a refusal
  today.
- **Do not propose, select, imply, or recommend a bounded-authority mechanism.**
  The decision is open on purpose. A run suggesting how to close it is
  contributing to a decision that is explicitly not its to make, and a plausible
  suggestion is worse than none because it invites implementation.
- **Do not design around it** — no caching of a prior answer, no reusing an
  earlier approval, no local re-derivation of what a decision would probably have
  been.

## When this changes

This concept describes the posture while the decision is open. If it resolves,
the classification stops behaving as `FAIL CLOSED` and this document is stale by
definition — which is why its freshness metadata matters more here than almost
anywhere else. A run should not infer from silence that the situation has
changed.
