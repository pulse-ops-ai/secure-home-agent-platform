# services/runner-control

The **runner substrate**: the provider- and framework-neutral component that
turns an execution profile into an isolated, bounded, evidenced run.

> **Status: not implemented.** A workspace member with a manifest and a
> placeholder package. No substrate, no image, no dependencies.

## Future ownership

Per [`../../docs/architecture/runner-model.md`](../../docs/architecture/runner-model.md):

- profile resolution and validation,
- sandbox construction: isolation, mounts, network policy, secret provisioning,
- run lifecycle: start, cancel, timeout, teardown,
- resource limits,
- event emission and evidence capture,
- run-record creation.

## What belongs here

- The substrate itself and the run lifecycle.
- The adapter launch mechanism — as an **isolated process**, never in-process.
- Profile validation against the schema.
- Evidence sealing.

## What does not belong here

- **Adapters.** Those are [`../../agents/adapters/`](../../agents/adapters/).
  The substrate launches them; it does not contain them.
- **Agent implementations.** Those are
  [`../../agents/implementations/`](../../agents/implementations/).
- **Profiles.** Those are [`../../profiles/`](../../profiles/).
- **Any provider or framework SDK.** The substrate is neutral. If a provider name
  appears in this package, something is wrong.
- **Image definitions.** Those are [`../../deploy/images/`](../../deploy/images/).

## Boundary rules

- **The sandbox is untrusted**, even though it runs on the Pi.
  ([`../../docs/architecture/trust-boundaries.md`](../../docs/architecture/trust-boundaries.md))
- **Default deny outbound.** Egress only as the profile grants, consistent with
  the declared routing class.
- **No ambient credentials.** Never a Home Assistant token; never a database
  connection.
- **The substrate cannot be widened by an adapter.** A runtime that needs more
  requires a reviewed profile change.
- **Bounded resources.** The Pi also carries the household control path; a run
  must not starve it.
- **Runs are not on the safety path.** A dead substrate must not affect local
  safety automations.

## Open

- The adapter SPI — [U6](../../docs/architecture/unresolved-decisions.md#u6).
- Workload identity for run credentials —
  [U2](../../docs/architecture/unresolved-decisions.md#u2).
- Whether this runs on the Pi, the VPS, or both —
  [U4](../../docs/architecture/unresolved-decisions.md#u4).

## Governed by

[`../AGENTS.md`](../AGENTS.md) · ADRs
[0003](../../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md),
[0005](../../docs/decisions/ADR-0005-separate-capability-authorization-and-safety.md),
[0006](../../docs/decisions/ADR-0006-separate-agent-implementation-profile-run-and-automation.md),
[0011](../../docs/decisions/ADR-0011-keep-coding-agent-images-provider-specific.md)

## Validation

`uv run ruff check .`, `uv run mypy`, `uv run pytest`. Future:
[`../../tests/profile-conformance/`](../../tests/profile-conformance/) and
[`../../tests/framework-conformance/`](../../tests/framework-conformance/).
