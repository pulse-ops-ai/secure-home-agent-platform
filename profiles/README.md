# profiles/

**Execution profiles** — the reviewed, declarative artifacts that grant an agent
run its authority.

> **This is where authority lives.** Nothing in [`../agents/`](../agents/) grants
> anything. Merging an implementation grants nothing; adding an adapter grants
> nothing. A profile change is a **security change** and is reviewed as one.

> **Status: no profile and no schema exist.** These directories are documented
> placeholders.

## Layout

| Path | Contains |
|---|---|
| [`schema/`](schema/) | Notes on the profile schema — canonical schema lives in [`../schemas/execution-profile/`](../schemas/execution-profile/) |
| [`coding/`](coding/) | Coding-runner profiles: repositories and documents, **no household access** |
| [`household/`](household/) | Household-runner profiles: observation and action on the house |

## What a profile declares

Per [ADR-0003](../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md)
and [ADR-0007](../docs/decisions/ADR-0007-route-local-remote-and-cloud-execution-explicitly.md):

| Group | Fields |
|---|---|
| identity | profile name, **version** |
| runtime | runner image (digest-pinned), adapter |
| capability | permitted tool surface, filesystem mounts and posture, network policy |
| execution | routing class R0–R3, model route, **declared** fallback behaviour |
| limits | wall clock, CPU, memory, output size |
| principal | the agent identity the run authenticates as; whether an `actor` is required |
| evidence | the evidence contract the run must satisfy |

**Anything the profile does not grant is denied.** There is no default-open
field.

## What belongs here

- Profile definitions, versioned.
- Profile-authoring documentation and worked examples.

## What does not belong here

- **Agent code** — [`../agents/implementations/`](../agents/implementations/).
- **Adapter code** — [`../agents/adapters/`](../agents/adapters/).
- **The canonical schema** — [`../schemas/execution-profile/`](../schemas/execution-profile/).
- **Credentials or secrets.** A profile *names* the credential a run needs; it
  never contains one.
- **Image definitions** — [`../deploy/images/`](../deploy/images/).
- **Automations** — [`../services/control-plane/`](../services/control-plane/).
  A profile says what a run *may* do; an automation says when runs *happen*, and
  is authorized separately.

## Boundary rules

1. **Least privilege.** Grant what the agent needs and nothing more. A profile
   granting "everything" is a review failure.
2. **Version everything.** A run names its profile version; an automation binds a
   **specific version**, never a moving reference
   ([ADR-0006](../docs/decisions/ADR-0006-separate-agent-implementation-profile-run-and-automation.md)).
3. **Routing class is declared and enforced.** No runtime auto-selection, no
   implicit escalation. An R0 profile has no model egress at all.
4. **R3 profiles declare their data categories.** Anything not declared must not
   be sent to a third party.
5. **Coding profiles have no household device access.** Enforced by tool surface
   and network policy, not by convention.
6. **Provider names are opaque values only** — of the `adapter` and image fields.
   Never in the schema's structure
   ([ADR-0011](../docs/decisions/ADR-0011-keep-coding-agent-images-provider-specific.md)).
7. **No credentials in a profile.** A profile references a credential; it does
   not carry one.

## Governed by

[`../AGENTS.md`](../AGENTS.md) → [`AGENTS.md`](AGENTS.md) · ADRs
[0003](../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md),
[0006](../docs/decisions/ADR-0006-separate-agent-implementation-profile-run-and-automation.md),
[0007](../docs/decisions/ADR-0007-route-local-remote-and-cloud-execution-explicitly.md),
[0011](../docs/decisions/ADR-0011-keep-coding-agent-images-provider-specific.md)

## Validation

Future: schema validation of every profile, plus
[`../tests/profile-conformance/`](../tests/profile-conformance/) asserting that
an omitted grant results in **denial**, not a default-open.
