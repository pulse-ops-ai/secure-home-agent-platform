# services/policy-engine

**Deterministic operational and safety policy.** The control that answers
"is this action, with these parameters, in this context, within the envelope the
household has declared?"

> **Status: not implemented.** A workspace member with a manifest and a
> placeholder package. No policy format, no evaluator, no dependencies.

## Why this exists separately

Authorization answers *may this principal*. This service answers *is this action
within bounds* — and the two have different inputs, different owners, and
different availability requirements. A principal who may control the thermostat
is still refused a setpoint outside the declared range.

This is also the control that keeps
"sensitive home actions must not depend on unbounded LLM discretion" true. An
agent may **propose** an action; it may not set the bounds.

## Non-negotiable properties

1. **Deterministic.** Same inputs, same verdict, always.
2. **No model in the path.** No LLM, no learned ranker, no probabilistic
   component. Ever.
3. **Evaluable offline.** No remote call. This is the control that still works
   when the coordination plane does not.
4. **Legible to a household member.** Someone who does not write code must be
   able to read the envelope and understand it.
5. **Runs after authorization**, so it can constrain an authorized principal —
   and so it does not leak resource bounds to an unauthorized one.
6. **No bypass.** There is no administrator path around it. Overrides are
   themselves modelled, bounded, and audited.

## What belongs here

- The safety-policy declaration format and its evaluator.
- Numeric ranges, time windows, occupancy and equipment conditions.
- Rate limits on **physical actuation** (distinct from L5 API rate limits).
- Interlocks and required-confirmation rules.
- The verdict record fed into audit.

## What does not belong here

- **Relationship authorization** — that is the policy decision point.
  ([ADR-0008](../../docs/decisions/ADR-0008-use-openfga-for-relationships-and-deterministic-policy-for-safety.md))
- **Any model or inference client.**
- **Device access.** This service decides; [`../action-gateway/`](../action-gateway/) acts.
- **Remote state fetches.** If remote state is ever needed, it is cached with an
  explicit staleness bound and documented stale behaviour.

## Placement rule

Inputs are *principals, actors, relationships* → authorization.
Inputs are *numbers, times, physical state, rates, equipment limits* → here.
Needs both → two rules.

## Governed by

[`../AGENTS.md`](../AGENTS.md) · ADRs
[0005](../../docs/decisions/ADR-0005-separate-capability-authorization-and-safety.md),
[0008](../../docs/decisions/ADR-0008-use-openfga-for-relationships-and-deterministic-policy-for-safety.md),
[0009](../../docs/decisions/ADR-0009-define-degraded-mode-and-offline-authorization.md)

## Validation

`uv run ruff check .`, `uv run mypy`, `uv run pytest`. Future:
[`../../tests/policy-scenarios/`](../../tests/policy-scenarios/), plus a check
that this package has no dependency on any model or inference client.
