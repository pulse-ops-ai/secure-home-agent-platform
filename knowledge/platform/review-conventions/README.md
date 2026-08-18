# knowledge/platform/review-conventions/

**Module `platform/review-conventions`** — what a review in this repository
looks for, and what a reviewable change contains.

| Field | Value |
|---|---|
| Status | `Validated` |
| Owner | human:mikegtech |

> **Specification.** This README is not bundle source; the authored candidate
> beside it is. Not runtime-authoritative: nothing here is packaged, published,
> or resolvable by a running profile.

## Intended facts

- What a pull request must state: what changed and why, which ADRs govern it,
  explicit non-goals, the validation commands run **with their real output**, and
  whether any trust boundary, identity flow, authorization path, safety policy,
  or degraded-mode behaviour is affected.
- **Every skipped check is reported, with the reason.** A report that omits a
  failure is worse than no report.
- A rule that "reads as enforced" but has no mechanism is a finding, not a
  nitpick — as is a test whose assertion can never fail.
- Reviewing one instance of a defect means asking what else is in its class.
- A profile change is a security change and is reviewed as one.

## Prohibited facts

- Reviewer identities, review history, or anything about specific people.
- Any suggestion that a review can approve crossing an accepted contract.

## Intended consumers

Coding runners performing pre-pull-request review.

## Expected queries

- "What must I put in the pull request body?"
- "A check could not run on this machine. May I omit it?"
- "Is this test actually asserting anything?"

## Governing sources

[`../../../CONTRIBUTING.md`](../../../CONTRIBUTING.md) ·
[`.github/pull_request_template.md`](../../../.github/pull_request_template.md) ·
[ADR-0006](../../../docs/decisions/ADR-0006-separate-agent-implementation-profile-run-and-automation.md) ·
[`profiles/README.md`](../../../profiles/README.md)

## Freshness and update trigger

Update when the pull-request template, the reporting obligations, or the review
posture changes.
