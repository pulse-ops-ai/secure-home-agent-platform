# deploy/runtime/

Current governance state is not authored here. Use [the canonical registry](../../governance/state.json),
[its generated projection](../../governance/STATE.md), or
`node scripts/query-governance-state.mjs --json` from the repository root.
Registry data grants no implementation or runtime authority.

The repository boundary for **future** host/container/VM execution-runtime
integration — **taxonomy only**. Established by L5 (issue #53); populated
only by a later governed landing.

> **Status: no runtime is selected, configured, or installed.** This
> README is this directory's entire permitted content, and
> `scripts/check-images.mjs` refuses anything else appearing here until a
> governed landing (L9 / #57, behind the U4 placement ADR #9) authorizes
> it.

## The taxonomy this directory exists to keep straight

```text
WHAT executes        → OCI workload image        → deploy/images/
HOW it is isolated   → execution/runtime layer   → deploy/runtime/   (this)
WHAT it may do       → execution profile         → profiles/
WHAT it may know     → knowledge release         → knowledge/
WHAT happened        → run evidence              → runner contracts
```

An image identifies a workload; a runtime isolates one. Conflating them —
an image named after an isolation runtime, or runtime host configuration
baked into an image — is refused mechanically. The runner contracts are
container-runtime neutral (constitution INV-012): replacing the runtime
must change no profile, run, event, or evidence contract, and the runtime
identity appears in run evidence as **data**.

## What belongs here — later

Concrete runtime integration needs its own governed task contract: runtime
configuration, hardening posture and proof of the launch contract. Query
canonical governance for the landing's current prerequisites and placement
question resolution; this directory grants no implementation authority.

## What does not belong here

- **Anything today.** No Kata, runc, containerd, gVisor, or QEMU
  configuration; no daemon config; no `--runtime` flags; no benchmarks.
- Runtime *selection* — that is a decision (U4 → L9), not a directory.
- Image definitions — [`../images/`](../images/).

## Governed by

[`../README.md`](../README.md) → [`../AGENTS.md`](../AGENTS.md) ·
`openspec/specs/runner-adoption/spec.md` (runtime neutrality) ·
issue #53 (L5), then #9 (U4) and #57 (L9)
