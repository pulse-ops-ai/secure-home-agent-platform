# schemas/execution-profile/

The canonical schema for an **execution profile** — the artifact that grants an
agent run its authority.

> **Status: `1.0.0.json` generated** from the authored Zod contract in
> [`packages/contracts`](../../packages/contracts/) (`runner-domain-contracts`,
> L2/#51) — regenerate via `pnpm --filter @secure-home/contracts run generate`;
> never hand-edit. The `$id` embeds the exact contract version and is recorded
> in [`../identity-ledger.json`](../identity-ledger.json).

## Required field groups

Per [ADR-0003](../../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md)
and [ADR-0007](../../docs/decisions/ADR-0007-route-local-remote-and-cloud-execution-explicitly.md):

| Group | Fields |
|---|---|
| identity | name, **version** |
| runtime | runner image (**digest-pinned**), adapter (opaque value) |
| capability | permitted tool surface, filesystem mounts and posture, network policy |
| execution | **routing class** R0–R3, model route, declared fallback behaviour |
| limits | wall clock, CPU, memory, output size — **all required** |
| principal | agent identity; whether an `actor` is required |
| evidence | the evidence contract the run must satisfy |

## Constraints this schema must enforce

1. **Default deny.** An omitted grant denies. No field's absence may mean
   "allow".
2. **Routing class required**, and any declared fallback must be **downward**
   only. No implicit escalation.
3. **R3 profiles must declare their data categories.** Undeclared household data
   must not leave the house.
4. **Limits required.** No unbounded wall clock.
5. **Digest-pinned image.** A moving tag is not a pin.
6. **Credential references only.** Never a credential value.
7. **Neutral.** Provider and framework names appear only as opaque values of the
   `adapter` and image fields. Adding a provider requires no schema change.

## What belongs here

- The schema definition and its field documentation.
- Valid and invalid example profiles as fixtures — including a profile that omits
  a grant, to prove it denies.

## What does not belong here

- **Actual profiles** — [`../../profiles/`](../../profiles/).
- **The human authoring guide** — [`../../profiles/schema/`](../../profiles/schema/).
- **Validation code** — [`../../services/runner-control/`](../../services/runner-control/).

## Governed by

[`../README.md`](../README.md) · ADRs
[0003](../../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md),
[0007](../../docs/decisions/ADR-0007-route-local-remote-and-cloud-execution-explicitly.md),
[0011](../../docs/decisions/ADR-0011-keep-coding-agent-images-provider-specific.md)

## Validation

Future: [`../../tests/profile-conformance/`](../../tests/profile-conformance/)
asserts that an omitted grant denies and that no profile can escalate its routing
class at run time.
