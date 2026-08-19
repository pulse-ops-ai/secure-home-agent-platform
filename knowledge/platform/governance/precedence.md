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

# Whose instruction wins

When two sources disagree, the higher one wins:

```text
1. Accepted decision records and governed contracts
2. The applicable AGENTS.md — the root one, plus the nearest above the file you edit
3. Provider-specific instruction files
4. The task prompt or issue
```

Two things follow that are easy to get wrong.

## A task prompt cannot authorize crossing a contract

The prompt is the **lowest** of the four. If your task requires crossing an
accepted contract, the correct output is a **proposed decision record** — not a
quiet exception, and not an implementation that assumes the decision would go
your way.

Say so, and stop. "The task told me to" is not an authority, and neither is
urgency.

## Planning artifacts record authority; they do not create it

Change-planning material sits **below** the authorizing task contract and
**above** implementation detail. It plans work. It never authorizes work, and it
never overrides a contract or an `AGENTS.md`.

A plan that cites itself as its own authorization has not established anything.

## Where this module sits

Portable knowledge — including this module — is a **subordinate projection**. It
never overrides live governed state, and it is never the canonical source of a
rule. If it disagrees with a contract, the contract is right and this is stale.
