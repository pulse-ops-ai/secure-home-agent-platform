# AGENTS.md — `profiles/`

Scoped rules for execution profiles. Inherits everything from
[`../AGENTS.md`](../AGENTS.md).

## Treat every change here as a security change

A profile is where an agent run gets its authority. Editing a file here can
widen what an autonomous process may do to a house. Review it accordingly.

## Read first

1. [`../AGENTS.md`](../AGENTS.md)
2. [`README.md`](README.md)
3. [`../docs/architecture/runner-model.md`](../docs/architecture/runner-model.md)
4. ADRs **0003, 0006, 0007, 0011**

## Rules

- **Least privilege.** Grant the minimum. If you cannot justify a grant in one
  sentence, remove it.
- **No credentials, ever.** A profile names a credential; it never contains one.
- **Declare the routing class.** No profile without one; no implicit escalation.
  An R0 profile gets **no** model egress.
- **R3 profiles declare their data categories.** Undeclared data must not leave
  the house.
- **Coding profiles get no household access.** No household tools, no device
  reachability.
- **Version, never mutate.** Changing an existing profile version silently
  changes what bound automations may do. Create a new version.
- **Provider names are opaque values** of the `adapter` and image fields only.
- **Pin images by digest.** A moving tag is not a pin.
- **Every profile declares its limits.** No unbounded wall clock.

## Do not

- Author a real profile before the schema exists — it would be unvalidatable.
  The governing ADRs are accepted, so writing the schema is now in scope under a
  task contract; profiles follow it, not the other way round.
- Invent the profile schema here. It belongs in
  [`../schemas/execution-profile/`](../schemas/execution-profile/) and is
  governed by ADR-0003 and ADR-0007.
- Grant a household capability to any agent while agent delegation is unmodelled
  ([ADR-0004](../docs/decisions/ADR-0004-treat-agents-as-clients.md)).

## Reviewing a profile change

Ask, in order:

1. What new authority does this grant, in one sentence?
2. Could the agent do its job with less?
3. Does the routing class match the data the agent will touch?
4. If R3 — which household data categories leave the house?
5. Which automations bind this profile, and does this change what they may do?
6. Is the image digest-pinned?
7. Are the limits bounded?

## Validation

```sh
bash scripts/validate-scaffold.sh
```

Future: schema validation and
[`../tests/profile-conformance/`](../tests/profile-conformance/).
