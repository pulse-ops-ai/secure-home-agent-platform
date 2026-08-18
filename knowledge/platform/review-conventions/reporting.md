---
type: model
owner: human:mikegtech
as_of: 2026-08-18
limitations: Portable projection only. Contains nothing about specific people or review history. Grants nothing.
status: draft
stale_after: 2027-08-18
governs:
  - CONTRIBUTING.md
  - .github/pull_request_template.md
  - .github/agents/review.agent.md
generated:
  by: claude-code/2.1.234
  at: 2026-08-18T16:20:50Z
---

# What a reviewable change reports

A change is reviewable when a reader can tell **what changed, why, and what it
would take to falsify it** without reconstructing your reasoning.

State:

- **what changed and why** — the defect or obligation, not a restatement of the diff;
- **the governing decisions and contracts** the change answers to;
- **non-goals** — what you deliberately did not do, so a reviewer does not read
  an omission as an oversight;
- **actual validation output**, not the claim that checks were run;
- **every skipped check, with its reason.** An unreported skip is worse than a
  failure: a failure is visible, and a silent skip reads as success.

## Effects that must be called out explicitly

If the change touches trust, identity, authorization, safety, or degraded-mode
behaviour, say so in those words. These are the properties a reviewer cannot
recover by reading a diff, and the reviewer who most needs to know is the one
who does not already know where to look.

**A change to what a run is permitted to do is a security change**, whatever
directory it lives in.

## Findings a reviewer is expected to raise

- **"Reads as enforced" with no mechanism behind it.** Prose that describes a
  control is not a control.
- **A test that cannot fail.** It reports success unconditionally and is worse
  than no test, because it occupies the space where a test would go.
- **One defect, unswept.** Finding an instance means looking for the class. A
  fix that repairs one occurrence and leaves its siblings has not finished.
- **A claim stronger than its mechanism.** Especially where the mechanism has a
  known limit — the limit belongs in the claim.

## What this module will not tell you

It names no person, carries no review history, and describes no specific past
review.
