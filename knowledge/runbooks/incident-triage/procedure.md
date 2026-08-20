---
type: procedure
owner: human:mikegtech
as_of: 2026-08-20
limitations: Portable projection only. Defines no incident taxonomy, and carries no live device state, sensor value, occupancy, presence, member identity, contact detail, access history, or device identifier. Grants nothing.
status: draft
stale_after: 2027-08-20
governs:
  - docs/architecture/agent-triage-and-escalation.md
  - docs/decisions/ADR-0005-separate-capability-authorization-and-safety.md
  - docs/decisions/ADR-0009-define-degraded-mode-and-offline-authorization.md
  - docs/decisions/ADR-0010-use-okf-for-portable-knowledge-only.md
  - docs/decisions/ADR-0013-define-the-runner-adapter-spi.md
generated:
  by: claude-code/2.1.237
  at: 2026-08-20T15:12:56Z
---

# The order of work

Four steps, and the order is the content. Performed out of sequence they produce
confident conclusions built on evidence nobody read.

1. **Observe.** Establish what live state actually says. Where knowledge and live
   state disagree, **live state wins, and the discrepancy is reported** rather
   than quietly resolved. Knowledge describes; it does not report the present.
2. **Interpret.** Classify the signal using the domain semantics supplied to the
   run — see *Classification meaning is supplied, not invented* below.
3. **State the unknowns.** What could not be established is part of the finding,
   not an omission from it.
4. **Propose.** An agent proposes; the platform decides.

## Six kinds of statement, kept apart

The most common failure is a report that blends these, because a reader then
cannot tell what was seen from what was concluded.

| Kind | Is |
|---|---|
| **observation** | what live state actually returned |
| **interpretation** | what the agent infers that observation means |
| **unknown** | what could not be established |
| **attempted action** | what was proposed and accepted for execution |
| **disposition** | what became of that attempt, including that it is unresolved |
| **proposed next decision** | what should happen, and who must decide it |

An interpretation stated as an observation launders a guess into evidence, and
every later reader inherits it.

An agent's own report is a **claim** about the world, not the world — untrusted
until the platform validates it, and recorded as malformed rather than repaired
silently.

## Reasoning creates no authority

An agent may **observe**, **reason**, **report**, and **propose**. That is the
whole list.

An agent is a client and re-enters through the same governed enforcement point as
any other caller; three separate controls stand between a proposal and a physical
effect, and none may be skipped. **There is no path by which an agent remediates
a condition on its own authority, and reasoning about the condition creates no
such path.**

Urgency does not create one either. A situation that seems to demand immediate
action is the situation in which routing around a control is most tempting and
least defensible.

## Classification meaning is supplied, not invented

This procedure defines **no incident taxonomy**. Which conditions exist in a
household, what they mean, and which are severe are domain semantics owned
elsewhere, and inventing them here would freeze a vocabulary nobody agreed.

So: classify using the domain semantics supplied to the run. **If the condition
cannot be classified from the governed inputs available, report it as an unknown
and hand over** — never as a guess dressed as a category.
