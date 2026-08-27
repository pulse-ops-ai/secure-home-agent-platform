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

The governing ADRs are now accepted, so what remains is implementation and the
unresolved decisions — **not** governance. Acceptance is **not** authorization to
deploy; each runbook below still needs its own reviewed work.

| Runbook | Blocked on |
|---|---|
| Home Assistant installation and hardening | [U10](../architecture/unresolved-decisions.md#u10) credential strategy |
| Deploying the local control plane | service implementations; [U3](../architecture/unresolved-decisions.md#u3). Host placement is no longer a blocker — [ADR-0020](../decisions/ADR-0020-place-runner-control-by-workload-class.md) decided it on 2026-08-26, and deciding is not deploying |
| Runner image build and publication | base-image contract (now in scope under a task contract) |
| Tailnet ACL configuration | deployment work under a task contract |
| **Degraded-mode drill** | a degraded-mode implementation to drill — severs connectivity and verifies [`degraded-mode.md`](../architecture/degraded-mode.md) |
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
