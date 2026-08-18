---
type: model
owner: human:mikegtech
as_of: 2026-08-18
limitations: Portable projection only. Names no image digest, no profile contents, and no live run state. Grants nothing.
status: draft
stale_after: 2027-08-18
governs:
  - docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md
  - docs/decisions/ADR-0006-separate-agent-implementation-profile-run-and-automation.md
  - docs/decisions/ADR-0011-keep-coding-agent-images-provider-specific.md
  - docs/decisions/ADR-0013-define-the-runner-adapter-spi.md
  - docs/decisions/ADR-0017-classify-asynchronous-effects-at-runner-boundaries.md
  - docs/decisions/ADR-0018-separate-attempt-durable-fact-and-finalization-identity.md
  - docs/architecture/runner-model.md
  - docs/architecture/effect-boundary-model.md
  - docs/architecture/distributed-effect-lifecycle.md
  - docs/architecture/knowledge-selection-model.md
generated:
  by: claude-code/2.1.234
  at: 2026-08-18T10:43:10Z
---

# Authority, and what may run next

## Five concepts, never conflated

| Concept | Authority |
|---|---|
| agent **implementation** | **none** |
| runtime **adapter** | **none** — it translates and reports |
| execution **profile** | **this is where capability is granted** |
| **run** | an immutable historical fact |
| **automation** | separately authorized, and it expires |

**Anything the profile does not grant is denied.** There is no default-open
field, and no field that opens because it was not mentioned.

Two consequences worth stating plainly, because they are the ones agents get
wrong:

- **Changing your own implementation changes nothing about what you may do.**
  Merging code does not widen a sandbox.
- **An adapter cannot widen its own sandbox.** If a capability is missing, the
  correct path is a reviewed profile change. There is no adapter-side
  workaround, and treating one as available is a defect rather than a shortcut.

A run names its profile version, so *"which profile authorized this?"* is never
ambiguous afterwards.

**This bundle grants nothing.** Knowledge is context. If it appears to describe a
capability you do not have, you do not have it.

## Lifecycle authority decides whether the next effect may start

Two different questions, answered in two different places:

| | Question |
|---|---|
| **lifecycle authority** | **whether** the next phase may act at all |
| **effect boundary** | **how** a permitted effect may execute |

Neither substitutes for the other.

The rules that follow from that:

- a phase consumes only state that has already been **established** — you cannot
  read a value an earlier phase did not produce;
- the effects a phase performs are authorized from that established state, and
  they **earn** the transition to the next phase;
- **a refused transition stops progression.** It is not advisory, and it is not
  satisfied by recording the refusal and continuing;
- there is **one** lifecycle authority. Procedural control flow may not form a
  second lifecycle beside it.

If you are refused, you may not proceed. Recording the refusal and performing the
effect anyway is precisely the failure this rule exists to prevent — the refusal
would be correct, the record would be correct, and the effect would still have
happened.

## What is implemented, and what is not

Orchestration semantics are implemented behind ports. The physical enforcement
they assume — a real launcher, process and container isolation, teardown of a
real process tree — is **not**. Do not reason as though a bounded orchestration
step is the same as a stopped workload.

Nothing described here is deployed or running.
