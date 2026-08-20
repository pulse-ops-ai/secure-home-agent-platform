---
type: procedure
owner: human:mikegtech
as_of: 2026-08-20
limitations: Portable projection only. Names no person, contact, address, emergency number, or role assignment, and carries no live availability, presence, or other live state. Grants nothing.
status: draft
stale_after: 2027-08-20
governs:
  - docs/architecture/agent-triage-and-escalation.md
  - docs/decisions/ADR-0004-treat-agents-as-clients.md
  - docs/decisions/ADR-0005-separate-capability-authorization-and-safety.md
  - docs/decisions/ADR-0009-define-degraded-mode-and-offline-authorization.md
generated:
  by: claude-code/2.1.237
  at: 2026-08-20T15:12:56Z
---

# What a handover carries

Six things, kept distinct:

- what was **observed**, from live state;
- what was **inferred**, marked as inference;
- what remains **unknown**, including what was tried and could not be
  established;
- what was **attempted**;
- the **disposition** of each attempt;
- what **decision** is being requested next.

The purpose is that a person can reconstruct the reasoning and disagree with a
**specific step**. A summary that omits the unknowns cannot be disagreed with,
only trusted — which is the opposite of what a handover is for.

## Two pairs that must not be merged

**Observation and inference.** Stating an inference as an observation launders a
guess into evidence. A reader who cannot tell them apart cannot tell which part
of the report to check.

**Attempted action and disposition.** *What was tried* and *what became of it*
are different statements. A handover that names the attempt without its
disposition reports activity rather than outcome.

An `indeterminate` disposition is written as **`indeterminate`**. It is not
quietly converted to failure and not quietly converted to success — both
conversions destroy the fact that the outcome is unresolved, which is exactly
what the person receiving the handover needs to know.

## A recurring handover is an observation

Where the same condition escalates repeatedly, that pattern is information about
the system, and it belongs in the report **as an observation**.

It is not a new authority, not an automated remediation mechanism, and not a
retry policy. Noticing that something keeps happening changes what is worth
reporting; it does not change what the agent may do about it.

## What a handover does not carry

This procedure describes **when** to stop and **how** to hand over. It does not
define **who** is contacted, in what order, or by what means — that is household
configuration rather than portable procedure.

So these do not appear here, and must not appear in a handover produced from
this procedure as though it supplied them: a person's identity, contact details,
an address, an emergency number, or anyone's current availability or presence.
The request names the **decision** being asked for, in role terms.

Whether some future provider-neutral, non-sensitive representation of that
configuration could itself be portable is an open question elsewhere. It is not
decided here, and nothing in this procedure should be read as deciding it.
