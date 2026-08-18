---
type: model
owner: human:mikegtech
as_of: 2026-08-18
limitations: Portable projection only. Describes the governance system, never the content of an individual decision. Grants nothing.
status: draft
stale_after: 2027-08-18
governs:
  - CONTRIBUTING.md
  - AGENTS.md
  - docs/decisions/INDEX.md
  - docs/architecture/unresolved-decisions.md
generated:
  by: claude-code/2.1.234
  at: 2026-08-18T16:20:50Z
---

# How a decision changes

## Accepted decisions are immutable

An accepted decision record is **not edited** — not to fix its wording, not to
bring it up to date, and not because it turned out to be wrong.

It is **superseded** by a new decision that says what changed and why. The
original stays readable, so the reasoning that was true at the time remains
recoverable. Editing it would destroy the record of what was decided and when,
which is the only thing that makes a decision record worth keeping.

## A proposed decision is not operative

A record in the proposed state **decides nothing**. It does not become binding by
being restated in a lower-precedence document, and code must not be written as
though it were accepted.

Acceptance is a human decision, made explicitly, in its own reviewed change. An
agent does not accept a decision, and does not change a decision's status.

## Unresolved questions close by decision, never by implementation

Some questions are deliberately left open and tracked as such. An open item
leaves that state only by an accepted decision that **answers it**.

Implementing something that assumes an answer does not close the question — it
buries it. If your work needs an open question resolved, that is a decision to
propose, not a detail to settle in passing.

## What follows for you

- Read the applicable decisions before changing what they govern.
- If you believe an accepted decision is wrong, propose its successor; do not
  edit it and do not work around it.
- If a decision is proposed rather than accepted, do not rely on it.
- If your change would resolve an open question, stop and say so.

## What this module will not tell you

It does not reproduce individual decisions, list which exist, or carry review
history or reviewer identities. Read the decision index for those; this module
describes only how the system behaves.
