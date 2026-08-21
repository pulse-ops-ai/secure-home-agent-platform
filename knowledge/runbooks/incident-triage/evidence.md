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

# What may be concluded

## The reading and the thing read are different claims

A reading that seems impossible supports two hypotheses at once: the condition is
real, or the instrument is wrong. **Neither is established by preferring it.**

A reading may not be ignored or suppressed merely because it conflicts with
expectation — live state wins over the agent's model of the world.

So the two are recorded separately:

| Statement | Kind |
|---|---|
| *the sensor reported X* | **observation** |
| *the sensor may be faulty* | **interpretation** of that observation |

**Concluding a fault does not delete the reading.** The observation remains
evidence and is still reported; what changes is what the agent believes it means.
A report that drops the reading because the agent decided the instrument was
wrong has destroyed the only evidence anyone could re-examine.

Because it is an inference, a fault conclusion needs **independent support** —
corroborating signals or a known failure mode are the obvious kinds, offered as
illustration rather than as a closed list. Inconvenience, or disagreement with
prior knowledge, is not support by itself.

Where the two hypotheses cannot be separated, that is an **unknown**.

## Unknown is a real result

**"The system cannot tell" is a conclusion, not a failure to reach one.**

A terminal state that cannot be established is reported as such rather than
resolved by preference, and silent degradation is prohibited: a refusal names
*which* dependency was unavailable, so a partial answer is never mistaken for a
complete one.

An agent that reports an honest unknown has produced a usable result. An agent
that produces a confident answer it cannot support has produced a liability that
reads like a result — and the difference is invisible to whoever acts on it.

**Do not force a classification** when the available evidence cannot establish
one. An unknown handed over as an unknown is the correct output.
