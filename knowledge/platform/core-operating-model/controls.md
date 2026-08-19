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
  - services/AGENTS.md
generated:
  by: claude-code/2.1.235
  at: 2026-08-19T04:22:58Z
---

# The separate controls

Three controls stand between a proposal and a physical effect. They are **owned
by different components, each can refuse, and none may be skipped.**

| Control | Asks |
|---|---|
| sandbox capability | can this run reach the thing at all? |
| platform authorization | is this principal permitted to do this, here, now? |
| deterministic safety policy | is this action, with these parameters, within the declared envelope? |

They are ordered, and the order carries meaning.

## Why they are not redundant

The temptation is to treat one passing control as evidence about another. It is
not.

**Capability is not a security boundary on its own.** It is the outermost
bound — it decides
whether a request can be attempted, not whether it should succeed. A run that can
reach something has learned nothing about whether it may use it.

**Safety policy runs after authorization, deliberately.** It must be able to
constrain a principal who is genuinely permitted. Being allowed to control
something is not the same as being allowed to set it to any value; the envelope
still applies, and it applies to administrators too.

Read the other direction, the same rule says safety policy never substitutes for
deciding *who* may act. A physically harmless direction is not
authorization-free. Those are two different questions and collapsing them is the
error the separation exists to prevent.

## Chained, not merely sequenced

Passing a control earlier is not a token a run carries forward. An approval is
bound to the specific action it approved, and that binding is re-checked before
anything is dispatched. A decision reference on its own would be a bearer
credential, and treating it as one is a defect rather than an optimisation.

## What a run should do with this

Expect any of the three to refuse, and treat each refusal as final for that
request. Do not infer from one control's answer what another will say, and never
attempt a request through a different route because one control refused it.

## What this concept does not carry

Which principals hold what, what the envelope permits, any threshold or limit, or
any component address. Those are enforced rules and live configuration. This
concept says only that the controls exist, that they are separate, and that all
of them must pass.
