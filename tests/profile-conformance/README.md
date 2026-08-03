# tests/profile-conformance/

Tests that an **execution profile grants exactly what it declares** — no more,
and critically, no default-open.

> **Status: empty.** No profile schema and no runner substrate exist yet.

## What will be asserted

Per [ADR-0003](../../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md),
[ADR-0007](../../docs/decisions/ADR-0007-route-local-remote-and-cloud-execution-explicitly.md),
and [ADR-0011](../../docs/decisions/ADR-0011-keep-coding-agent-images-provider-specific.md):

| Assertion | Why |
|---|---|
| An **omitted grant denies** | the single most important property: no field's absence may mean "allow" |
| An ungranted tool is **unreachable**, not merely unlisted | listing is not enforcement |
| An **R0 profile has no model egress at all** | the class is enforced, not advisory |
| A profile **cannot escalate** its routing class at run time | prompt injection must not widen the class |
| An **R2 profile with the workstation unavailable** produces the declared outcome | no implicit fallback |
| A run using one provider's image **cannot reach another provider's credential** | credential isolation is structural |
| A **coding profile cannot reach a household tool** or the household API | the class boundary |
| Limits are enforced: wall clock, memory, output size | no unbounded run |
| An **invalid or unversioned profile is rejected** | not silently defaulted |

## What belongs here

- Tests driving the runner substrate with crafted profiles.
- Fixture profiles, valid and deliberately invalid.

## What does not belong here

- **Adapter output-shape tests** — [`../framework-conformance/`](../framework-conformance/).
- **Authorization or safety tests** — [`../policy-scenarios/`](../policy-scenarios/).
- **Anything requiring a network or a credential.**

## Boundary rules

- **Assert denial, not just permission.** The tests that matter here are the ones
  that prove something is refused.
- Offline and deterministic.
- Fixtures carry no real credentials, not even fake-looking ones.

## Governed by

[`../README.md`](../README.md) · ADRs
[0003](../../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md),
[0007](../../docs/decisions/ADR-0007-route-local-remote-and-cloud-execution-explicitly.md),
[0011](../../docs/decisions/ADR-0011-keep-coding-agent-images-provider-specific.md)

## Validation

`uv run pytest tests/profile-conformance`
