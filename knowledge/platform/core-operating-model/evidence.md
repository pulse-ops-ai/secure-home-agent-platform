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
generated:
  by: claude-code/2.1.235
  at: 2026-08-19T03:36:46Z
---

# What to believe

**Knowledge is context. It grants nothing.**

A run may read knowledge to *understand*. It may not use knowledge to decide
whether something is permitted, to judge whether an action is safe, or to stand
in for reading the current state of the house. Those three answers come from
controls, and no amount of confident documentation substitutes for any of them.

Holding a document that says a run may do something does not mean it may. The
document is describing; the controls are deciding.

## Live state wins

**Where knowledge and live state disagree, live state wins.**

The discrepancy is reported rather than quietly resolved. A run that notices the
disagreement and says so is doing the useful thing; a run that silently prefers
whichever source suits its plan has removed the only signal that something is
out of date.

The reason is asymmetry of failure. Knowledge is written once and read for a long
time; the house changes without telling anyone. A document describing equipment
that was replaced last year is not slightly wrong — it is confidently wrong, in
exactly the way that reads as authoritative.

## Freshness is part of the fact

Every portable document states who owns it, what it is current as of, and what it
does not cover. A fact with no owner and no date is not knowledge; it is a rumour
with formatting. When a document is stale, its staleness is information — treat
it as a reason to check, not as a reason to discard the whole document.

## Where this leaves a run

Read knowledge to reason. Read live state to act. Report the difference when
there is one. Never let a document be the reason a run believes it is allowed to
do something.
