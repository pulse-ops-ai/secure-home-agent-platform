# deploy/images/runner-base/

`secure-home-runner-base` — the provider-neutral **untrusted workload
substrate**. Every runner image derives from it
([ADR-0011](../../../docs/decisions/ADR-0011-keep-coding-agent-images-provider-specific.md)).

## What this image is

WHERE a workload executes, and nothing more:

- a minimal, digest-pinned Debian 13 surface with `ca-certificates`;
- `tini` as PID 1 (signal forwarding and zombie reaping for an arbitrary
  workload — process bootstrap, not process *decisions*);
- the non-root `runner` user (uid/gid 10001);
- two empty filesystem conventions: `/workspace` (the workload's working
  tree) and `/run/platform` (where the substrate mounts event/evidence
  plumbing at launch).

There is deliberately no `CMD`: this image is inert, and only the platform
launcher (L9, not yet landed) supplies a command.

## What it deliberately does not contain

- **No decision-bearing platform responsibility.** Authority acquisition,
  profile decisions, policy interpretation, gate membership,
  classification, lifecycle and finalization authority, and evidence
  sealing live in trusted `services/runner-control` (L4) **outside** every
  image; physical enforcement is L9. The lineage checker refuses any
  `COPY`/`ADD` from `services/**` or `packages/**`.
- **No provider CLI, no framework runtime, no provider SDK, no credential
  handling.** A provider or framework name anywhere in the Dockerfile is a
  lineage violation, refused mechanically.
- No package installed "because it might be useful": everything the base
  carries is carried by every derived workload image forever. `git` is a
  coding-runtime dependency and lives in the derived image that needs it.

## Failure mode and verification

The image grants nothing and enforces nothing; a defective base fails
builds, never households. Identity, pinning, and neutrality are validated
by `scripts/check-images.mjs` (structural) and re-proved by the governed
build path (`.github/workflows/images.yml`), which rebuilds the definition
and compares digests to [`../image-lock.yaml`](../image-lock.yaml).

## Resource limits

None are declared here, deliberately: limits are a **launch** property the
execution profile declares and L9 enforces per run. Baking a limit into an
image would misstate where that authority lives.

## Governed by

[`../README.md`](../README.md) → [`../../AGENTS.md`](../../AGENTS.md) ·
ADR-0003, ADR-0011 · issue #53 (L5)
