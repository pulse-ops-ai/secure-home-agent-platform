# deploy/runtime/

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

Concrete runtime integration authored by its own governed landing:
runtime configuration, hardening posture, and the documentation of how the
chosen runtime satisfies the launch contract. That landing is L9 (or an
explicitly authorized prerequisite), and it requires the accepted U4
placement ADR first.

## What does not belong here

- **Anything today.** No Kata, runc, containerd, gVisor, or QEMU
  configuration; no daemon config; no `--runtime` flags; no benchmarks.
- Runtime *selection* — that is a decision (U4 → L9), not a directory.
- Image definitions — [`../images/`](../images/).

## Governed by

[`../README.md`](../README.md) → [`../AGENTS.md`](../AGENTS.md) ·
`openspec/specs/runner-adoption/spec.md` (runtime neutrality) ·
issue #53 (L5), then #9 (U4) and #57 (L9)
