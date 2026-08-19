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

# What a refusal during an outage means

**A refusal during an outage is a correct governed result.** It is not a fault,
not a bug to work around, and not evidence that something needs fixing before the
work can continue.

An undecidable authorization is never a permit. When the question *may this
happen?* cannot be answered, the answer is no — and the platform behaving that
way is the platform working, not failing.

The right response is to report the refusal, say which dependency was
unavailable, and stop. Looking for another route to the same effect is the
failure mode this design exists to prevent, and an outage is when it is most
tempting.

## Having knowledge is not having authority

Portable knowledge is local and file-based, so it stays readable during outages —
one of the few things that does.

**That availability grants nothing.** It is available precisely *because* it is
context rather than authority; if it conferred authority it could not safely
remain readable when the controls are unreachable. A run holding complete,
current, accurate knowledge and no live decision still cannot act.

The reasoning is worth keeping in mind, because the intuition runs the other way:
having more information feels like it should enable more. Here it enables better
*reporting* — a clearer account of what was wanted, what was refused, and why —
and nothing else.

## Degradation is never silent

When the platform is degraded it says so, on every affected response and in
audit. A refusal states which dependency was unavailable.

A run should preserve that property rather than smooth it over. Reporting "this
didn't work" without naming the unavailable dependency turns a legible outage
into an unexplained failure, and a household member should never have to guess
whether the system is still enforcing.

## Recovery is somebody else's explicit act

Restoration is reconciled deliberately — buffered audit flushed, any bounded
authority used reported, missed triggers not replayed unless declared. A run does
not perform recovery, and does not retry accumulated work on its own initiative
when things come back.

## What this concept does not carry

Current service health or outage status, which is live state, and the policy
configuration that decides any of this.
