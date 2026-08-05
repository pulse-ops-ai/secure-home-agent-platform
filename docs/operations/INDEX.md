# docs/operations/ — Operational runbooks

Procedures for the people who run the household platform. Written for a human at
a terminal, not for a coding agent.

> **Status: nothing is deployed.** The only runbook here describes preparing the
> Pi and explicitly stops short of installing anything.

This index is validated by [`../../scripts/validate-scaffold.sh`](../../scripts/validate-scaffold.sh):
every document referenced here must exist, and every document in this folder must
be referenced here.

## Runbooks

| Runbook | Covers |
|---|---|
| [`pi-bootstrap.md`](pi-bootstrap.md) | Preparing the Raspberry Pi as the household control-plane host — prerequisites, verification, and the boundary where preparation stops |

## Planned, not yet written

Each of these is blocked on a decision or an implementation that does not exist:

| Runbook | Blocked on |
|---|---|
| Home Assistant installation and hardening | [ADR-0002](../decisions/ADR-0002-adopt-hybrid-home-deployment-profile.md) acceptance; [U10](../architecture/unresolved-decisions.md#u10) credential strategy |
| Deploying the local control plane | service implementations |
| Runner image build and publication | [ADR-0011](../decisions/ADR-0011-keep-coding-agent-images-provider-specific.md) acceptance |
| Tailnet ACL configuration | [ADR-0002](../decisions/ADR-0002-adopt-hybrid-home-deployment-profile.md) acceptance |
| **Degraded-mode drill** | [ADR-0009](../decisions/ADR-0009-define-degraded-mode-and-offline-authorization.md) acceptance — severs connectivity and verifies [`degraded-mode.md`](../architecture/degraded-mode.md) |
| Credential rotation | [U2](../architecture/unresolved-decisions.md#u2), [U10](../architecture/unresolved-decisions.md#u10) |
| Backup and restore | durable-state design |
| Incident response for a suspected agent compromise | runner substrate implementation |

## Rules for this folder

- **Runbooks are for humans.** Write the commands out. Do not assume the reader
  has repository context loaded.
- **Never include a real secret, token, device identifier, tailnet address, or
  household member name.** Use obviously-fake placeholders.
- Every runbook states its prerequisites, its verification steps, and how to
  undo it.
- A runbook that would deploy something must not be written before the ADR that
  authorizes it is accepted.
- Governed by [`../../AGENTS.md`](../../AGENTS.md) and [`../AGENTS.md`](../AGENTS.md).
